import {readStoreStockSnapshot} from './dynamics-stock.mjs';
import {assortmentIndex} from './assortment.mjs';
import {timingSafeEqual} from 'node:crypto';
import {GLOVO_SKUS,GLOVO_CATALOG_VERSION,GLOVO_CATALOG_SOURCE} from '../data/glovo-catalog.mjs';

const clean=v=>String(v??'').trim();
const secureEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y)};
const partnerStores=()=>new Set(String(process.env.GLOVO_PARTNER_STORE_IDS||'val-fleuri,trefle').split(',').map(clean).filter(Boolean));
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const buffer=()=>Math.max(0,Number(process.env.GLOVO_AVAILABILITY_BUFFER)||0);
const availabilityCache=new Map(),availabilityInflight=new Map();
const availabilityCacheMs=()=>Math.max(15_000,Math.min(300_000,Number(process.env.STOREOPS_GLOVO_AVAILABILITY_CACHE_MS)||60_000));
function vendorMap(){try{return JSON.parse(process.env.GLOVO_VENDOR_IDS_JSON||'{}')}catch{return{}}}
function glovoConfig(storeId){
 const chainId=clean(process.env.GLOVO_CHAIN_ID),vendorId=clean(vendorMap()[storeId]),token=clean(process.env.GLOVO_CATALOG_BEARER_TOKEN);
 return{chainId:chainId||null,vendorId:vendorId||null,tokenConfigured:!!token,ready:!!(chainId&&vendorId&&token),partnerPullConfigured:!!clean(process.env.GLOVO_READ_API_KEY),partnerEndpoint:`/api/partners/glovo/stores/${encodeURIComponent(storeId)}/availability`}
}
export async function buildGlovoAvailability(storeId,{businessDate=new Date().toISOString().slice(0,10),force=false}={}){
 const cacheKey=`${storeId}|${businessDate}`,hit=availabilityCache.get(cacheKey);if(!force&&hit&&Date.now()<hit.expiresAt)return{...hit.value,cache:{status:'HIT',ageMs:Date.now()-hit.storedAt}};
 if(!force&&availabilityInflight.has(cacheKey))return availabilityInflight.get(cacheKey);
 const task=(async()=>{
  const stock=await readStoreStockSnapshot(storeId,{force}),assortment=assortmentIndex(storeId,{businessDate});
  if(stock.status!=='READY'||stock.truncated)return{status:'PARTIAL',storeId,businessDate,privacyMode:'AVAILABILITY_ONLY',items:[],summary:{available:0,unavailable:0,total:0},diagnostics:{stockStatus:stock.status,assortmentState:assortment.status}};
  const safety=buffer(),stockBySku=new Map((stock.items||[]).map(row=>[clean(row.productNumber),row])),items=[];
  for(const sku of GLOVO_SKUS){
   const row=stockBySku.get(sku)||null,inStoreAssortment=assortment.status!=='READY'||assortment.included.has(sku),active=!!row&&inStoreAssortment&&n(row.availableOnHandQuantity)>safety;
   items.push({sku,name:row&&clean(row.name)&&clean(row.name)!==sku?clean(row.name):null,active,barcode:row?.ean||undefined});
  }
  const matched=items.filter(x=>stockBySku.has(x.sku)).length;
  const value={status:'READY',storeId,businessDate,privacyMode:'AVAILABILITY_ONLY',catalog:{version:GLOVO_CATALOG_VERSION,source:GLOVO_CATALOG_SOURCE,allowedSkus:GLOVO_SKUS.size},items,summary:{available:items.filter(x=>x.active).length,unavailable:items.filter(x=>!x.active).length,total:items.length},diagnostics:{warehouseId:stock.warehouseId,stockRows:stock.rowCount,catalogMatchedStockRows:matched,catalogMissingStockRows:Math.max(0,GLOVO_SKUS.size-matched),assortmentState:assortment.status,safetyBuffer:safety,rawQuantityExposed:false},integration:glovoConfig(storeId)};
  availabilityCache.set(cacheKey,{value,storedAt:Date.now(),expiresAt:Date.now()+availabilityCacheMs()});return{...value,cache:{status:'MISS',ageMs:0}}
 })();
 if(!force)availabilityInflight.set(cacheKey,task);try{return await task}finally{if(!force&&availabilityInflight.get(cacheKey)===task)availabilityInflight.delete(cacheKey)}
}
export async function pushGlovoAvailability(storeId,{businessDate=new Date().toISOString().slice(0,10),fetchImpl=fetch}={}){
 const snapshot=await buildGlovoAvailability(storeId,{businessDate}),cfg=glovoConfig(storeId);
 if(snapshot.status!=='READY')throw Object.assign(new Error('Disponibilité Glovo non envoyée : snapshot stock incomplet.'),{status:409,code:'GLOVO_AVAILABILITY_PARTIAL'});
 if(!cfg.ready)throw Object.assign(new Error('Intégration Glovo à configurer : chain, vendor et token requis.'),{status:409,code:'GLOVO_CONFIG_REQUIRED',details:{chainId:cfg.chainId,vendorId:cfg.vendorId,tokenConfigured:cfg.tokenConfigured}});
 const url=`https://glovo.partner.deliveryhero.io/v2/chains/${encodeURIComponent(cfg.chainId)}/vendors/${encodeURIComponent(cfg.vendorId)}/catalog`;
 const products=snapshot.items.map(x=>({sku:x.sku,active:x.active}));
 const res=await fetchImpl(url,{method:'PUT',headers:{'content-type':'application/json','authorization':`Bearer ${process.env.GLOVO_CATALOG_BEARER_TOKEN}`},body:JSON.stringify({products})});
 let data=null;try{data=await res.json()}catch{}
 if(!res.ok)throw Object.assign(new Error(`Glovo a refusé la synchronisation (${res.status}).`),{status:502,code:'GLOVO_PUSH_FAILED',details:data});
 return{status:'QUEUED',storeId,privacyMode:'AVAILABILITY_ONLY',sentProducts:products.length,jobId:data?.job_id||null,jobStatus:data?.job_status||null,rawQuantityExposed:false}
}


export async function handleGlovoPartnerApi({req,url}){
 const match=url.pathname.match(/^\/api\/partners\/glovo\/stores\/([^/]+)\/availability$/);if(!match||req.method!=='GET')return null;
 const storeId=decodeURIComponent(match[1]),expected=clean(process.env.GLOVO_READ_API_KEY),auth=clean(req.headers.authorization),provided=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
 if(!expected)return{status:503,data:{error:'API Glovo non activée.',code:'GLOVO_PARTNER_API_NOT_CONFIGURED'}};
 if(!secureEqual(provided,expected))return{status:401,data:{error:'Authentification Glovo requise.',code:'GLOVO_PARTNER_UNAUTHORIZED'}};
 if(!partnerStores().has(storeId))return{status:403,data:{error:'Magasin non autorisé pour ce partenaire.',code:'GLOVO_PARTNER_STORE_FORBIDDEN'}};
 const snapshot=await buildGlovoAvailability(storeId,{businessDate:url.searchParams.get('date')||undefined,force:url.searchParams.get('force')==='1'});
 if(snapshot.status!=='READY')return{status:503,data:{error:'Disponibilité temporairement indisponible.',code:'GLOVO_AVAILABILITY_NOT_READY',storeId,catalogVersion:GLOVO_CATALOG_VERSION}};
 return{status:200,data:{apiVersion:'1',storeId,businessDate:snapshot.businessDate,refreshedAt:new Date().toISOString(),catalogVersion:GLOVO_CATALOG_VERSION,privacyMode:'AVAILABILITY_ONLY',summary:snapshot.summary,items:snapshot.items.map(x=>({sku:x.sku,active:!!x.active}))}};
}

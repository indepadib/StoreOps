import {readStoreStockSnapshot} from './dynamics-stock.mjs';
import {assortmentIndex} from './assortment.mjs';

const clean=v=>String(v??'').trim();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const buffer=()=>Math.max(0,Number(process.env.GLOVO_AVAILABILITY_BUFFER)||0);
function vendorMap(){try{return JSON.parse(process.env.GLOVO_VENDOR_IDS_JSON||'{}')}catch{return{}}}
function glovoConfig(storeId){
 const chainId=clean(process.env.GLOVO_CHAIN_ID),vendorId=clean(vendorMap()[storeId]),token=clean(process.env.GLOVO_CATALOG_BEARER_TOKEN);
 return{chainId:chainId||null,vendorId:vendorId||null,tokenConfigured:!!token,ready:!!(chainId&&vendorId&&token)}
}
export async function buildGlovoAvailability(storeId,{businessDate=new Date().toISOString().slice(0,10)}={}){
 const stock=await readStoreStockSnapshot(storeId),assortment=assortmentIndex(storeId,{businessDate});
 if(stock.status!=='READY'||stock.truncated)return{status:'PARTIAL',storeId,businessDate,privacyMode:'AVAILABILITY_ONLY',items:[],summary:{available:0,unavailable:0,total:0},diagnostics:{stockStatus:stock.status,assortmentState:assortment.status}};
 const safety=buffer(),items=[];
 for(const row of stock.items||[]){
  const sku=clean(row.productNumber);if(!sku)continue;
  if(assortment.status==='READY'&&!assortment.included.has(sku))continue;
  const active=n(row.availableOnHandQuantity)>safety;
  items.push({sku,active,barcode:row.ean||undefined});
 }
 return{status:'READY',storeId,businessDate,privacyMode:'AVAILABILITY_ONLY',items,summary:{available:items.filter(x=>x.active).length,unavailable:items.filter(x=>!x.active).length,total:items.length},diagnostics:{warehouseId:stock.warehouseId,stockRows:stock.rowCount,assortmentState:assortment.status,safetyBuffer:safety,rawQuantityExposed:false},integration:glovoConfig(storeId)}
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

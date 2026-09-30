import {readStoreStockSnapshot} from './dynamics-stock.mjs';
import {assortmentIndex} from './assortment.mjs';
import {timingSafeEqual} from 'node:crypto';
import {GLOVO_SKUS,GLOVO_CATALOG_VERSION,GLOVO_CATALOG_SOURCE} from '../data/glovo-catalog.mjs';

const clean=v=>String(v??'').trim();
const secureEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&timingSafeEqual(x,y)};
const truthy=v=>/^(1|true|yes|on)$/i.test(clean(v));
const partnerStores=()=>new Set(String(process.env.GLOVO_PARTNER_STORE_IDS||'val-fleuri,trefle').split(',').map(clean).filter(Boolean));
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const buffer=()=>Math.max(0,Number(process.env.GLOVO_AVAILABILITY_BUFFER)||0);
const apiBase=()=>clean(process.env.GLOVO_API_BASE_URL)||'https://glovo.partner.deliveryhero.io';
const requestTimeoutMs=()=>Math.max(2_000,Math.min(60_000,Number(process.env.GLOVO_REQUEST_TIMEOUT_MS)||15_000));
const availabilityCache=new Map(),availabilityInflight=new Map();
const availabilityCacheMs=()=>Math.max(15_000,Math.min(300_000,Number(process.env.STOREOPS_GLOVO_AVAILABILITY_CACHE_MS)||60_000));
let tokenCache={token:null,expiresAt:0,mode:null};

function vendorMap(){try{return JSON.parse(process.env.GLOVO_VENDOR_IDS_JSON||'{}')}catch{return{}}}
function authConfig(){
 const staticToken=clean(process.env.GLOVO_CATALOG_BEARER_TOKEN),clientId=clean(process.env.GLOVO_CLIENT_ID),clientSecret=clean(process.env.GLOVO_CLIENT_SECRET),tokenUrl=clean(process.env.GLOVO_TOKEN_URL),oauthReady=!!(clientId&&clientSecret&&tokenUrl);
 return{mode:oauthReady?'CLIENT_CREDENTIALS':staticToken?'STATIC_BEARER':'NONE',oauthReady,staticTokenConfigured:!!staticToken,credentialsConfigured:oauthReady||!!staticToken,tokenEndpointConfigured:!!tokenUrl};
}
export function glovoIntegrationConfig(storeId){
 const chainId=clean(process.env.GLOVO_CHAIN_ID),vendorId=clean(vendorMap()[storeId]),auth=authConfig(),credentialsReady=!!(chainId&&vendorId&&auth.credentialsConfigured),pushEnabled=truthy(process.env.GLOVO_PUSH_ENABLED);
 return{chainId:chainId||null,vendorId:vendorId||null,apiBaseUrl:apiBase(),authMode:auth.mode,tokenConfigured:auth.credentialsConfigured,tokenEndpointConfigured:auth.tokenEndpointConfigured,credentialsReady,pushEnabled,ready:credentialsReady&&pushEnabled,partnerPullConfigured:!!clean(process.env.GLOVO_READ_API_KEY),partnerEndpoint:`/api/partners/glovo/stores/${encodeURIComponent(storeId)}/availability`};
}
function catalogUrl(cfg){return `${cfg.apiBaseUrl.replace(/\/$/,'')}/v2/chains/${encodeURIComponent(cfg.chainId)}/vendors/${encodeURIComponent(cfg.vendorId)}/catalog`}
function timeoutSignal(){return typeof AbortSignal?.timeout==='function'?AbortSignal.timeout(requestTimeoutMs()):undefined}
async function safeJson(res){try{return await res.json()}catch{return null}}
async function fetchWithTimeout(fetchImpl,url,init={}){return fetchImpl(url,{...init,signal:init.signal||timeoutSignal()})}

export async function resolveGlovoBearerToken({fetchImpl=fetch}={}){
 const auth=authConfig();
 if(auth.oauthReady){
  if(tokenCache.token&&tokenCache.mode==='CLIENT_CREDENTIALS'&&Date.now()<tokenCache.expiresAt)return tokenCache.token;
  const style=(clean(process.env.GLOVO_TOKEN_AUTH_STYLE)||'basic').toLowerCase(),scope=clean(process.env.GLOVO_TOKEN_SCOPE),form=new URLSearchParams({grant_type:'client_credentials'}),headers={'content-type':'application/x-www-form-urlencoded'};
  if(scope)form.set('scope',scope);
  if(style==='body'){form.set('client_id',clean(process.env.GLOVO_CLIENT_ID));form.set('client_secret',clean(process.env.GLOVO_CLIENT_SECRET))}
  else headers.authorization='Basic '+Buffer.from(clean(process.env.GLOVO_CLIENT_ID)+':'+clean(process.env.GLOVO_CLIENT_SECRET)).toString('base64');
  const res=await fetchWithTimeout(fetchImpl,clean(process.env.GLOVO_TOKEN_URL),{method:'POST',headers,body:form.toString()}),data=await safeJson(res);
  if(!res.ok)throw Object.assign(new Error(`Glovo a refusé la génération du token (${res.status}).`),{status:502,code:'GLOVO_TOKEN_FAILED',details:{httpStatus:res.status}});
  const token=clean(data?.access_token||data?.token);if(!token)throw Object.assign(new Error('Glovo n’a retourné aucun access token.'),{status:502,code:'GLOVO_TOKEN_MISSING'});
  const expiresSeconds=Math.max(60,Number(data?.expires_in)||7200);tokenCache={token,mode:'CLIENT_CREDENTIALS',expiresAt:Date.now()+Math.max(30,expiresSeconds-60)*1000};return token;
 }
 const staticToken=clean(process.env.GLOVO_CATALOG_BEARER_TOKEN);if(staticToken)return staticToken;
 throw Object.assign(new Error('Authentification Glovo non configurée.'),{status:409,code:'GLOVO_AUTH_REQUIRED'});
}

export function glovoCatalogPayload(snapshot){
 return{products:(snapshot?.items||[]).map(x=>({sku:x.sku,active:!!x.active}))};
}

export async function buildGlovoAvailability(storeId,{businessDate=new Date().toISOString().slice(0,10),force=false}={}){
 const cacheKey=`${storeId}|${businessDate}`,hit=availabilityCache.get(cacheKey);if(!force&&hit&&Date.now()<hit.expiresAt)return{...hit.value,cache:{status:'HIT',ageMs:Date.now()-hit.storedAt}};
 if(!force&&availabilityInflight.has(cacheKey))return availabilityInflight.get(cacheKey);
 const task=(async()=>{
  const stock=await readStoreStockSnapshot(storeId,{force}),assortment=assortmentIndex(storeId,{businessDate}),cfg=glovoIntegrationConfig(storeId);
  if(stock.status!=='READY'||stock.truncated)return{status:'PARTIAL',storeId,businessDate,generatedAt:new Date().toISOString(),privacyMode:'AVAILABILITY_ONLY',catalog:{version:GLOVO_CATALOG_VERSION,source:GLOVO_CATALOG_SOURCE,allowedSkus:GLOVO_SKUS.size},items:[],summary:{available:0,unavailable:0,total:0},diagnostics:{stockStatus:stock.status,stockTruncated:!!stock.truncated,assortmentState:assortment.status,rawQuantityExposed:false},integration:cfg};
  const safety=buffer(),stockBySku=new Map((stock.items||[]).map(row=>[clean(row.productNumber),row])),items=[];
  for(const sku of GLOVO_SKUS){
   const row=stockBySku.get(sku)||null,inStoreAssortment=assortment.status!=='READY'||assortment.included.has(sku),active=!!row&&inStoreAssortment&&n(row.availableOnHandQuantity)>safety;
   items.push({sku,name:row&&clean(row.name)&&clean(row.name)!==sku?clean(row.name):null,active,barcode:row?.ean||undefined});
  }
  const matched=items.filter(x=>stockBySku.has(x.sku)).length,matchRatio=GLOVO_SKUS.size?matched/GLOVO_SKUS.size:0,assortmentFiltered=assortment.status==='READY'?items.filter(x=>!assortment.included.has(x.sku)).length:null;
  const value={status:'READY',storeId,businessDate,generatedAt:new Date().toISOString(),privacyMode:'AVAILABILITY_ONLY',catalog:{version:GLOVO_CATALOG_VERSION,source:GLOVO_CATALOG_SOURCE,allowedSkus:GLOVO_SKUS.size},items,summary:{available:items.filter(x=>x.active).length,unavailable:items.filter(x=>!x.active).length,total:items.length},diagnostics:{warehouseId:stock.warehouseId,stockStatus:stock.status,stockRows:stock.rowCount,catalogMatchedStockRows:matched,catalogMissingStockRows:Math.max(0,GLOVO_SKUS.size-matched),catalogMatchRatio:matchRatio,assortmentState:assortment.status,assortmentFiltered,safetyBuffer:safety,rawQuantityExposed:false},integration:cfg};
  availabilityCache.set(cacheKey,{value,storedAt:Date.now(),expiresAt:Date.now()+availabilityCacheMs()});return{...value,cache:{status:'MISS',ageMs:0}}
 })();
 if(!force)availabilityInflight.set(cacheKey,task);try{return await task}finally{if(!force&&availabilityInflight.get(cacheKey)===task)availabilityInflight.delete(cacheKey)}
}

export async function verifyGlovoConnection(storeId,{fetchImpl=fetch}={}){
 const cfg=glovoIntegrationConfig(storeId);if(!cfg.credentialsReady)throw Object.assign(new Error('Connexion Glovo incomplète : chain ID, vendor ID et authentification sont requis.'),{status:409,code:'GLOVO_CONFIG_REQUIRED',details:{chainId:cfg.chainId,vendorId:cfg.vendorId,authMode:cfg.authMode}});
 const token=await resolveGlovoBearerToken({fetchImpl}),url=catalogUrl(cfg)+'?page=1&page_size=1',res=await fetchWithTimeout(fetchImpl,url,{method:'GET',headers:{accept:'application/json',authorization:'Bearer '+token}}),data=await safeJson(res);
 if(!res.ok)throw Object.assign(new Error(`Connexion Glovo refusée (${res.status}).`),{status:502,code:'GLOVO_VERIFY_FAILED',details:{httpStatus:res.status}});
 return{status:'READY',storeId,checkedAt:new Date().toISOString(),httpStatus:res.status,chainId:cfg.chainId,vendorId:cfg.vendorId,authMode:cfg.authMode,catalogReachable:true,sampleCount:Array.isArray(data?.products)?data.products.length:null};
}

export async function pushGlovoAvailability(storeId,{businessDate=new Date().toISOString().slice(0,10),fetchImpl=fetch}={}){
 const snapshot=await buildGlovoAvailability(storeId,{businessDate}),cfg=glovoIntegrationConfig(storeId);
 if(snapshot.status!=='READY')throw Object.assign(new Error('Disponibilité Glovo non envoyée : snapshot stock incomplet.'),{status:409,code:'GLOVO_AVAILABILITY_PARTIAL'});
 if(!cfg.credentialsReady)throw Object.assign(new Error('Intégration Glovo à configurer : chain, vendor et authentification requis.'),{status:409,code:'GLOVO_CONFIG_REQUIRED',details:{chainId:cfg.chainId,vendorId:cfg.vendorId,authMode:cfg.authMode}});
 if(!cfg.pushEnabled)throw Object.assign(new Error('Push Glovo verrouillé. Tester la connexion puis activer GLOVO_PUSH_ENABLED=1.'),{status:409,code:'GLOVO_PUSH_DISABLED'});
 if(snapshot.catalog?.allowedSkus&&Number(snapshot.diagnostics?.catalogMatchedStockRows||0)===0)throw Object.assign(new Error('Push Glovo bloqué : aucun SKU du catalogue Glovo ne correspond au snapshot stock du magasin.'),{status:409,code:'GLOVO_STOCK_MAPPING_EMPTY'});
 const token=await resolveGlovoBearerToken({fetchImpl}),url=catalogUrl(cfg),payload=glovoCatalogPayload(snapshot),res=await fetchWithTimeout(fetchImpl,url,{method:'PUT',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify(payload)}),data=await safeJson(res);
 if(!res.ok)throw Object.assign(new Error(`Glovo a refusé la synchronisation (${res.status}).`),{status:502,code:'GLOVO_PUSH_FAILED',details:{httpStatus:res.status,jobStatus:data?.job_status||null}});
 return{status:'QUEUED',storeId,submittedAt:new Date().toISOString(),privacyMode:'AVAILABILITY_ONLY',sentProducts:payload.products.length,jobId:data?.job_id||null,jobStatus:data?.job_status||'QUEUED',authMode:cfg.authMode,rawQuantityExposed:false}
}

export async function handleGlovoPartnerApi({req,url}){
 const match=url.pathname.match(/^\/api\/partners\/glovo\/stores\/([^/]+)\/availability$/);if(!match||req.method!=='GET')return null;
 const storeId=decodeURIComponent(match[1]),expected=clean(process.env.GLOVO_READ_API_KEY),auth=clean(req.headers.authorization),provided=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
 if(!expected)return{status:503,data:{error:'API Glovo non activée.',code:'GLOVO_PARTNER_API_NOT_CONFIGURED'}};
 if(!secureEqual(provided,expected))return{status:401,data:{error:'Authentification Glovo requise.',code:'GLOVO_PARTNER_UNAUTHORIZED'}};
 if(!partnerStores().has(storeId))return{status:403,data:{error:'Magasin non autorisé pour ce partenaire.',code:'GLOVO_PARTNER_STORE_FORBIDDEN'}};
 const snapshot=await buildGlovoAvailability(storeId);
 if(snapshot.status!=='READY')return{status:503,data:{error:'Disponibilité temporairement indisponible.',code:'GLOVO_AVAILABILITY_NOT_READY',storeId,catalogVersion:GLOVO_CATALOG_VERSION}};
 return{status:200,data:{apiVersion:'1',storeId,businessDate:snapshot.businessDate,refreshedAt:snapshot.generatedAt||new Date().toISOString(),catalogVersion:GLOVO_CATALOG_VERSION,privacyMode:'AVAILABILITY_ONLY',summary:snapshot.summary,items:snapshot.items.map(x=>({sku:x.sku,active:!!x.active}))}};
}

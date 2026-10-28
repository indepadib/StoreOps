import {readStoreStockSnapshot} from './dynamics-stock.mjs';
import {assortmentIndex} from './assortment.mjs';
import {prepareGlovoPrices,glovoPreparedPrices,glovoJob,saveGlovoJob,receiveGlovoWebhook,glovoAssortmentPage,assertNoGlovoJobInFlight} from './glovo-v2.mjs';
export {prepareGlovoPrices,glovoJob,glovoAssortmentPage};
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {GLOVO_SKUS,GLOVO_CATALOG_VERSION,GLOVO_CATALOG_SOURCE} from '../data/glovo-catalog.mjs';

const localDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date());
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
 const staticToken=clean(process.env.GLOVO_CATALOG_BEARER_TOKEN),clientId=clean(process.env.GLOVO_CLIENT_ID),clientSecret=clean(process.env.GLOVO_CLIENT_SECRET),tokenUrl=clean(process.env.GLOVO_TOKEN_URL)||apiBase().replace(/\/$/,'')+'/v2/oauth/token',oauthReady=!!(clientId&&clientSecret&&tokenUrl);
 return{mode:oauthReady?'CLIENT_CREDENTIALS':staticToken?'STATIC_BEARER':'NONE',oauthReady,staticTokenConfigured:!!staticToken,credentialsConfigured:oauthReady||!!staticToken,tokenEndpointConfigured:!!tokenUrl};
}
export function glovoIntegrationConfig(storeId){
 const chainId=clean(process.env.GLOVO_CHAIN_ID),vendorId=clean(vendorMap()[storeId]),auth=authConfig(),credentialsReady=!!(chainId&&vendorId&&auth.credentialsConfigured),pushEnabled=truthy(process.env.GLOVO_PUSH_ENABLED);
 return{chainId:chainId||null,vendorId:vendorId||null,apiBaseUrl:apiBase(),authMode:auth.mode,tokenConfigured:auth.credentialsConfigured,tokenEndpointConfigured:auth.tokenEndpointConfigured,credentialsReady,pushEnabled,ready:credentialsReady&&pushEnabled,priceSyncEnabled:truthy(process.env.GLOVO_PRICE_SYNC_ENABLED),webhookConfigured:!!clean(process.env.GLOVO_WEBHOOK_TOKEN),webhookPath:'/api/partners/glovo/catalog/webhook',testVendorId:'51530',partnerPullConfigured:!!clean(process.env.GLOVO_READ_API_KEY),partnerEndpoint:`/api/partners/glovo/stores/${encodeURIComponent(storeId)}/availability`};
}
function catalogUrl(cfg){return `${cfg.apiBaseUrl.replace(/\/$/,'')}/v2/chains/${encodeURIComponent(cfg.chainId)}/vendors/${encodeURIComponent(cfg.vendorId)}/catalog`}
function timeoutSignal(){return typeof AbortSignal?.timeout==='function'?AbortSignal.timeout(requestTimeoutMs()):undefined}
async function safeJson(res){try{return await res.json()}catch{return null}}
async function fetchWithTimeout(fetchImpl,url,init={}){return fetchImpl(url,{...init,signal:init.signal||timeoutSignal()})}

export async function resolveGlovoBearerToken({fetchImpl=fetch}={}){
 const auth=authConfig();
 if(auth.oauthReady){
  if(tokenCache.token&&tokenCache.mode==='CLIENT_CREDENTIALS'&&Date.now()<tokenCache.expiresAt)return tokenCache.token;
  const style=(clean(process.env.GLOVO_TOKEN_AUTH_STYLE)||'body').toLowerCase(),scope=clean(process.env.GLOVO_TOKEN_SCOPE),form=new URLSearchParams({grant_type:'client_credentials'}),headers={'content-type':'application/x-www-form-urlencoded'};
  if(scope)form.set('scope',scope);
  if(style==='body'){form.set('client_id',clean(process.env.GLOVO_CLIENT_ID));form.set('client_secret',clean(process.env.GLOVO_CLIENT_SECRET))}
  else headers.authorization='Basic '+Buffer.from(clean(process.env.GLOVO_CLIENT_ID)+':'+clean(process.env.GLOVO_CLIENT_SECRET)).toString('base64');
  const res=await fetchWithTimeout(fetchImpl,clean(process.env.GLOVO_TOKEN_URL)||apiBase().replace(/\/$/,'')+'/v2/oauth/token',{method:'POST',headers,body:form.toString()}),data=await safeJson(res);
  if(!res.ok)throw Object.assign(new Error(`Glovo a refusé la génération du token (${res.status}).`),{status:502,code:'GLOVO_TOKEN_FAILED',details:{httpStatus:res.status}});
  const token=clean(data?.access_token||data?.token);if(!token)throw Object.assign(new Error('Glovo n’a retourné aucun access token.'),{status:502,code:'GLOVO_TOKEN_MISSING'});
  const expiresSeconds=Number(data?.expires_in)||7200;tokenCache={token,mode:'CLIENT_CREDENTIALS',expiresAt:Date.now()+Math.max(0,expiresSeconds-Math.min(60,expiresSeconds/10))*1000};return token;
 }
 const staticToken=clean(process.env.GLOVO_CATALOG_BEARER_TOKEN);if(staticToken)return staticToken;
 throw Object.assign(new Error('Authentification Glovo non configurée.'),{status:409,code:'GLOVO_AUTH_REQUIRED'});
}

export function glovoCatalogPayload(snapshot){
 const products=snapshot.items.map(x=>({sku:x.sku,active:x.active,...(Number.isFinite(x.price)&&x.price>0?{price:x.price}:{})}));
 return{products};
}

export async function buildGlovoAvailability(storeId,{businessDate=localDay(),force=false}={}){
 const cacheKey=`${storeId}|${businessDate}`,hit=availabilityCache.get(cacheKey);if(!force&&hit&&Date.now()<hit.expiresAt)return{...hit.value,cache:{status:'HIT',ageMs:Date.now()-hit.storedAt}};
 if(!force&&availabilityInflight.has(cacheKey))return availabilityInflight.get(cacheKey);
 const task=(async()=>{
  const stock=await readStoreStockSnapshot(storeId,{force}),assortment=assortmentIndex(storeId,{businessDate}),cfg=glovoIntegrationConfig(storeId);
  if(stock.status!=='READY'||stock.truncated)return{status:stock.status==='PREPARING'?'PREPARING':'PARTIAL',progress:stock.progress||null,storeId,businessDate,generatedAt:new Date().toISOString(),privacyMode:'AVAILABILITY_ONLY',catalog:{version:GLOVO_CATALOG_VERSION,source:GLOVO_CATALOG_SOURCE,allowedSkus:GLOVO_SKUS.size},items:[],summary:{available:null,unavailable:null,total:null},diagnostics:{stockStatus:stock.status,stockTruncated:!!stock.truncated,assortmentState:assortment.status,rawQuantityExposed:false},integration:cfg};
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

export async function readGlovoCatalogSkus(cfg,{token,fetchImpl=fetch}={}){
 const skus=new Set();let totalPages=1;
 for(let page=1;page<=totalPages;page++){
  const res=await fetchWithTimeout(fetchImpl,catalogUrl(cfg)+`?page=${page}&page_size=500`,{method:'GET',headers:{accept:'application/json',authorization:'Bearer '+token}}),data=await safeJson(res);
  if(!res.ok||!Array.isArray(data?.products))throw Object.assign(new Error('Lecture du catalogue Glovo impossible ; aucun envoi.'),{status:502,code:'GLOVO_CATALOG_UNAVAILABLE'});
  const pages=Number(data.total_pages??(data.products.length<500?1:NaN));
  if(!Number.isInteger(pages)||pages<0||pages>100||(page>1&&pages!==totalPages))throw Object.assign(new Error('Pagination Glovo incomplète ou instable.'),{status:502,code:'GLOVO_CATALOG_INCOMPLETE'});
  totalPages=pages;for(const row of data.products){if(clean(row.sku))skus.add(clean(row.sku))}
 }
 return skus;
}

async function pushGlovoAvailabilityInternal(storeId,{businessDate=localDay(),fetchImpl=fetch,readAvailability=buildGlovoAvailability}={}){
 const snapshot=await readAvailability(storeId,{businessDate,force:true}),cfg=glovoIntegrationConfig(storeId);
 if(snapshot.status!=='READY')throw Object.assign(new Error('Disponibilité Glovo non envoyée : snapshot stock incomplet.'),{status:409,code:'GLOVO_AVAILABILITY_PARTIAL'});
 if(!cfg.credentialsReady)throw Object.assign(new Error('Intégration Glovo à configurer : chain, vendor et authentification requis.'),{status:409,code:'GLOVO_CONFIG_REQUIRED',details:{chainId:cfg.chainId,vendorId:cfg.vendorId,authMode:cfg.authMode}});
 if(!cfg.pushEnabled)throw Object.assign(new Error('Push Glovo verrouillé. Tester la connexion puis activer GLOVO_PUSH_ENABLED=1.'),{status:409,code:'GLOVO_PUSH_DISABLED'});
 if(snapshot.catalog?.allowedSkus&&Number(snapshot.diagnostics?.catalogMatchedStockRows||0)===0)throw Object.assign(new Error('Push Glovo bloqué : aucun SKU du catalogue Glovo ne correspond au snapshot stock du magasin.'),{status:409,code:'GLOVO_STOCK_MAPPING_EMPTY'});
 if(!cfg.webhookConfigured)throw Object.assign(new Error('Configurer le token du webhook Glovo avant tout envoi.'),{status:409,code:'GLOVO_WEBHOOK_REQUIRED'});
 if(businessDate!==new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date()))throw Object.assign(new Error('Seule la date du jour peut être synchronisée.'),{status:409});
 assertNoGlovoJobInFlight(storeId);
 const token=await resolveGlovoBearerToken({fetchImpl}),remoteSkus=await readGlovoCatalogSkus(cfg,{token,fetchImpl}),requestedProducts=snapshot.items.length;
 snapshot.items=snapshot.items.filter(x=>remoteSkus.has(x.sku));
 if(!snapshot.items.length)throw Object.assign(new Error('Aucun SKU autorisé présent dans le catalogue Glovo ; charger l’assortiment avant synchronisation.'),{status:409,code:'GLOVO_CATALOG_MAPPING_EMPTY'});
 if(cfg.priceSyncEnabled){if(process.env.GLOVO_PRICE_BASIS!=='TTC_PER_SALES_UNIT')throw Object.assign(new Error('Base tarifaire TTC non confirmée.'),{status:409,code:'GLOVO_PRICE_BASIS_REQUIRED'});const prices=glovoPreparedPrices(storeId,businessDate);for(const item of snapshot.items){const row=prices.get(item.sku);if(!row||row.status!=='READY')throw Object.assign(new Error('Préparer tous les prix valides avant la synchronisation prix.'),{status:409,code:'GLOVO_PRICES_INCOMPLETE'});item.price=row.price}}
 assertNoGlovoJobInFlight(storeId);
 const url=catalogUrl(cfg),payload=glovoCatalogPayload(snapshot),dispatchId='dispatch-'+randomUUID(),submittedAt=new Date().toISOString();
 const dispatch={jobId:dispatchId,storeId,vendorId:cfg.vendorId,status:'SUBMITTING',sentProducts:payload.products.length,pricesSent:cfg.priceSyncEnabled,excludedProducts:requestedProducts-payload.products.length,submittedAt};saveGlovoJob(dispatch);
 let res,data;
 try{res=await fetchWithTimeout(fetchImpl,url,{method:'PUT',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify(payload)});data=await safeJson(res)}catch{saveGlovoJob({...dispatch,status:'UNKNOWN'});throw Object.assign(new Error('Résultat de l’envoi Glovo inconnu. Vérifier auprès de Glovo avant toute relance.'),{status:502,code:'GLOVO_SUBMISSION_UNKNOWN'})}
 if(!res.ok){saveGlovoJob({...dispatch,status:res.status>=500?'UNKNOWN':'FAILED',httpStatus:res.status});throw Object.assign(new Error(`Glovo a refusé la synchronisation (${res.status}).`),{status:502,code:'GLOVO_PUSH_FAILED',details:{httpStatus:res.status}})}
 if(res.status!==202||!clean(data?.job_id)){saveGlovoJob({...dispatch,status:'UNKNOWN'});throw Object.assign(new Error('Réponse Glovo sans job accepté identifiable.'),{status:502,code:'GLOVO_JOB_MISSING'})}
 saveGlovoJob({...dispatch,status:'SUBMITTED',remoteJobId:data.job_id});
 saveGlovoJob({...dispatch,jobId:data.job_id,status:'QUEUED'});
 return{status:'QUEUED',storeId,excludedProducts:requestedProducts-payload.products.length,pricesSent:cfg.priceSyncEnabled,submittedAt:new Date().toISOString(),privacyMode:cfg.priceSyncEnabled?'AVAILABILITY_AND_PRICE':'AVAILABILITY_ONLY',sentProducts:payload.products.length,jobId:data?.job_id||null,jobStatus:data?.job_status||'QUEUED',authMode:cfg.authMode,rawQuantityExposed:false}
}

export async function handleGlovoPartnerApi({req,url}){
 if(url.pathname==='/api/partners/glovo/catalog/webhook')return receiveGlovoWebhook({req});
 const match=url.pathname.match(/^\/api\/partners\/glovo\/stores\/([^/]+)\/availability$/);if(!match||req.method!=='GET')return null;
 const storeId=decodeURIComponent(match[1]),expected=clean(process.env.GLOVO_READ_API_KEY),auth=clean(req.headers.authorization),provided=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
 if(!expected)return{status:503,data:{error:'API Glovo non activée.',code:'GLOVO_PARTNER_API_NOT_CONFIGURED'}};
 if(!secureEqual(provided,expected))return{status:401,data:{error:'Authentification Glovo requise.',code:'GLOVO_PARTNER_UNAUTHORIZED'}};
 if(!partnerStores().has(storeId))return{status:403,data:{error:'Magasin non autorisé pour ce partenaire.',code:'GLOVO_PARTNER_STORE_FORBIDDEN'}};
 const snapshot=await buildGlovoAvailability(storeId);
 if(snapshot.status!=='READY')return{status:503,data:{error:'Disponibilité temporairement indisponible.',code:'GLOVO_AVAILABILITY_NOT_READY',storeId,catalogVersion:GLOVO_CATALOG_VERSION}};
 return{status:200,data:{apiVersion:'1',storeId,businessDate:snapshot.businessDate,refreshedAt:snapshot.generatedAt||new Date().toISOString(),catalogVersion:GLOVO_CATALOG_VERSION,privacyMode:'AVAILABILITY_ONLY',summary:snapshot.summary,items:snapshot.items.map(x=>({sku:x.sku,active:!!x.active}))}};
}

const pushInflight=new Set();
export async function pushGlovoAvailability(storeId,options={}){if(pushInflight.has(storeId))throw Object.assign(new Error('Synchronisation Glovo déjà en cours.'),{status:409});pushInflight.add(storeId);try{return await pushGlovoAvailabilityInternal(storeId,options)}finally{pushInflight.delete(storeId)}}

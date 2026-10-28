import {db} from '../db.mjs';
import {timingSafeEqual} from 'node:crypto';
import {getStoreSalesPriceContext} from './dynamics-price.mjs';
import {productDataMany} from './product-data.mjs';
import {GLOVO_SKUS} from '../data/glovo-catalog.mjs';
const clean=v=>String(v??'').trim();
const fail=(message,status=409,code='GLOVO_VALIDATION')=>Object.assign(new Error(message),{status,code});
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date());
function schema(){db.exec(`CREATE TABLE IF NOT EXISTS glovo_v2_jobs(id TEXT PRIMARY KEY,store_id TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS glovo_v2_prices(store_id TEXT NOT NULL,sku TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(store_id,sku));`)}
export function saveGlovoJob(job){schema();db.prepare('INSERT INTO glovo_v2_jobs(id,store_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(job.jobId,job.storeId,JSON.stringify(job));return job}
export function glovoJob(storeId,jobId){schema();const row=db.prepare('SELECT payload FROM glovo_v2_jobs WHERE id=? AND store_id=?').get(jobId,storeId);if(!row)throw fail('Job Glovo introuvable.',404);const {downloadUrl,...safe}=JSON.parse(row.payload);return safe}
export function glovoJobs(storeId){schema();return db.prepare("SELECT payload FROM glovo_v2_jobs WHERE store_id=? AND json_extract(payload,'$.status') <> 'SUBMITTED' ORDER BY rowid DESC LIMIT 30").all(storeId).map(x=>{const {downloadUrl,...safe}=JSON.parse(x.payload);return safe})}
export function assertNoGlovoJobInFlight(storeId){schema();if(db.prepare("SELECT id FROM glovo_v2_jobs WHERE store_id=? AND json_extract(payload,'$.status') IN ('QUEUED','IN_PROGRESS','SUBMITTING','UNKNOWN') LIMIT 1").get(storeId))throw fail('Une mise à jour Glovo attend encore son résultat. Vérifier son rapport avant un nouvel envoi.',409,'GLOVO_JOB_IN_FLIGHT')}
export function glovoPreparedPrices(storeId,day=today()){schema();return new Map(db.prepare('SELECT sku,payload FROM glovo_v2_prices WHERE store_id=?').all(storeId).map(x=>[x.sku,JSON.parse(x.payload)]).filter(([,x])=>x.businessDate===day&&Date.now()-Date.parse(x.checkedAt)<900000))}
export function resolveGlovoPrice(context){
 const base=context?.basePrice?.row,a=context?.applicability;
 if(context?.mode!=='LIVE'||!base||!a||['AMBIGUOUS','UNSAFE'].includes(a.status))return{status:'UNAVAILABLE',reason:'PRICE_CONTEXT_UNPROVEN'};
 const unit=clean(base.SalesUnitSymbol).toUpperCase();
 if(!['PCS','PCE','PC','EA','UN','UNIT','U'].includes(unit))return{status:'UNAVAILABLE',reason:'SALES_UNIT_REQUIRES_MAPPING'};
 const quantity=Number(base.SalesPriceQuantity||1),currency=clean(a.selected?.row?.PriceCurrencyCode||process.env.GLOVO_PRICE_CURRENCY);
 if(currency!=='MAD'||!(quantity>0))return{status:'UNAVAILABLE',reason:'CURRENCY_OR_PRICE_BASIS_UNPROVEN'};
 const raw=a.status==='UNIQUE'?a.safePrice:Number(base.SalesPrice),price=Number((raw/quantity).toFixed(2));
 if(base.SalesPrice==null||!Number.isFinite(raw)||!(price>0))return{status:'UNAVAILABLE',reason:'PRICE_MISSING'};
 return{status:'READY',price,currency,unit,source:a.status==='UNIQUE'?'D365_STORE_TRADE_AGREEMENT':'D365_BASE_PRICE',promotionsIncluded:false};
}
export async function prepareGlovoPrices(storeId,{offset=0,readContext=getStoreSalesPriceContext}={}){
 if(process.env.GLOVO_PRICE_BASIS!=='TTC_PER_SALES_UNIT')throw fail('Confirmer la base TTC par unité de vente avant de préparer les prix.',409,'GLOVO_PRICE_BASIS_REQUIRED');
 schema();const start=Number(offset);if(!Number.isInteger(start)||start<0||start>GLOVO_SKUS.size)throw fail('Offset invalide.',400);
 const skus=[...GLOVO_SKUS].slice(start,start+20),items=[],day=today();let cursor=0;
 await Promise.all(Array.from({length:3},async()=>{while(cursor<skus.length){const sku=skus[cursor++];let value;try{value=resolveGlovoPrice(await readContext(sku,{storeId,businessDate:day}))}catch{value={status:'UNAVAILABLE',reason:'PRICE_READ_FAILED'}}const row={sku,...value,businessDate:day,checkedAt:new Date().toISOString()};db.prepare('INSERT INTO glovo_v2_prices(store_id,sku,payload) VALUES(?,?,?) ON CONFLICT(store_id,sku) DO UPDATE SET payload=excluded.payload').run(storeId,sku,JSON.stringify(row));items.push(row)}}));
 return{items,total:GLOVO_SKUS.size,nextOffset:start+skus.length<GLOVO_SKUS.size?start+skus.length:null,ready:items.filter(x=>x.status==='READY').length};
}
export async function glovoAssortmentPage(storeId,{offset=0,readProducts=productDataMany,readStock}={}){
 const start=Number(offset);if(!Number.isInteger(start)||start<0||start>GLOVO_SKUS.size)throw fail('Offset invalide.',400);
 const skus=[...GLOVO_SKUS].slice(start,start+40),refs=await readProducts(skus),prices=glovoPreparedPrices(storeId),stock=readStock?await readStock(storeId):null,bySku=new Map((stock?.items||[]).map(x=>[x.sku,x]));
 let images={};try{images=JSON.parse(process.env.GLOVO_PRODUCT_IMAGES_JSON||'{}')}catch{}
 const items=skus.map(sku=>{const ref=refs.get(sku)||{},price=prices.get(sku),image=clean(images[sku]),validImage=/^https:\/\//i.test(image),row={sku,name:ref.productName||bySku.get(sku)?.name||null,barcode:bySku.get(sku)?.barcode||null,price:price?.status==='READY'?price.price:null,currency:'MAD',imageUrl:validImage?image:null,category:ref.rayonLabel||null};return{...row,missing:['name','barcode','price','imageUrl','category'].filter(k=>!row[k])}});
 return{storeId,items,total:GLOVO_SKUS.size,nextOffset:start+skus.length<GLOVO_SKUS.size?start+skus.length:null,readyToSend:items.every(x=>!x.missing.length),scope:'GLOVO_APPROVED_ASSORTMENT'};
}
async function readBody(req){let size=0,parts=[];for await(const part of req){size+=Buffer.byteLength(part);if(size>65536)throw fail('Notification trop volumineuse.',413);parts.push(part)}try{return JSON.parse(Buffer.concat(parts.map(x=>Buffer.from(x))).toString('utf8'))}catch{throw fail('JSON invalide.',400)}}
export async function receiveGlovoWebhook({req}){
 if(req.method!=='POST')return{status:405,data:{error:'POST requis.'}};
 const expected=clean(process.env.GLOVO_WEBHOOK_TOKEN),provided=clean(req.headers.authorization).replace(/^Bearer\s+/i,'');
 if(!expected)return{status:503,data:{error:'Webhook non configuré.'}};
 const a=Buffer.from(expected),b=Buffer.from(provided);if(a.length!==b.length||!timingSafeEqual(a,b))return{status:401,data:{error:'Authentification Glovo requise.'}};
 const body=await readBody(req);schema();const found=db.prepare('SELECT payload FROM glovo_v2_jobs WHERE id=?').get(clean(body.job_id));if(!found)return{status:404,data:{error:'Job inconnu.'}};
 const old=JSON.parse(found.payload),status=clean(body.status||body.job_status);
 if(clean(body.platform_vendor_id)!==old.vendorId||!['COMPLETED','FAILED','IN_PROGRESS'].includes(status))return{status:400,data:{error:'Notification incohérente.'}};
 // Ignore delayed progress callbacks after the final notification.
 if(['COMPLETED','FAILED'].includes(old.status)){if(status===old.status&&!old.downloadUrl&&clean(body.download_url))saveGlovoJob({...old,downloadUrl:clean(body.download_url),reportStatus:'AVAILABLE'});return{status:200,data:{received:true,duplicate:true}};}
 const downloadUrl=clean(body.download_url)||null;
 saveGlovoJob({...old,status,downloadUrl,reportStatus:downloadUrl?'AVAILABLE':'NOT_PROVIDED',updatedAt:new Date().toISOString()});
 return{status:200,data:{received:true}};
}
export async function downloadGlovoReport(storeId,jobId,{token,fetchImpl=fetch}={}){
 schema();const found=db.prepare('SELECT payload FROM glovo_v2_jobs WHERE id=? AND store_id=?').get(jobId,storeId);if(!found)throw fail('Job introuvable.',404);const job=JSON.parse(found.payload);if(!job.downloadUrl)throw fail('Rapport pas encore disponible.');
 const url=new URL(job.downloadUrl),hosts=clean(process.env.GLOVO_REPORT_ALLOWED_HOSTS).split(',').map(clean).filter(Boolean);
 if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.includes(url.hostname)||/^(localhost|.*\.localhost|.*\.local|[\d.]+|\[.*\])$/i.test(url.hostname))throw fail('Hôte du rapport non autorisé. Configurer le domaine exact fourni par Glovo.',409,'GLOVO_REPORT_HOST_FORBIDDEN');
 const res=await fetchImpl(url,{headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});if(!res.ok)throw fail('Téléchargement du rapport refusé.',502);
 const reader=res.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5000000)throw fail('Rapport trop volumineux.',413);chunks.push(Buffer.from(value))}}finally{await reader.cancel()}
 const report=Buffer.concat(chunks).toString('utf8');saveGlovoJob({...job,reportStatus:'DOWNLOADED',reportDownloadedAt:new Date().toISOString()});return{jobId,content:report,interpretation:'Rapport brut Glovo : vérifier les erreurs par SKU même si le job est terminé.'};
}


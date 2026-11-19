import {createHash,randomUUID} from 'node:crypto';
import {GLOVO_SKUS} from '../data/glovo-catalog.mjs';
import {getProductPricing,computeSimpleEffectivePrice} from './dynamics-promotion.mjs';
import {isMarkdownOffer} from './markdown-offer.mjs';
import {buildGlovoAvailability,glovoIntegrationConfig,resolveGlovoBearerToken,readGlovoCatalogSkus} from './glovo-availability.mjs';
import {saveGlovoJob,glovoJob,assertNoGlovoJobInFlight} from './glovo-v2.mjs';
const fail=(message,code='GLOVO_PRODUCT_VALIDATION')=>Object.assign(new Error(message),{status:409,code});
const round=value=>Math.round(value*100)/100;
function dayBoundary(value,end=false){
 const day=String(value||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<='1900-01-02'||!Number.isFinite(Date.parse(day)))return null;
 const offset=new Intl.DateTimeFormat('en',{timeZone:'Africa/Casablanca',timeZoneName:'shortOffset'}).formatToParts(new Date(day+'T12:00:00Z')).find(part=>part.type==='timeZoneName').value;
 const hours=Number(offset.replace('GMT','')||0);
 return new Date(Date.parse(day+'T'+(end?'23:59:59':'00:00:00')+'Z')-hours*3600000).toISOString();
}
export function glovoProductPrices(pricing){
 const base=pricing?.basePrice,trade=pricing?.tradeAgreements?.applicability;
 const raw=Number(base?.price),quantity=Number(base?.priceQuantity||1);
 if(pricing?.mode!=='LIVE'||!base||!trade||['AMBIGUOUS','UNSAFE'].includes(trade.status)||!(raw>0)||!(quantity>0)||!['PC','PCS','PCE','EA','UN','UNIT','U'].includes(String(base.unit).toUpperCase()))throw fail('Prix TTC unitaire ou promotions Dynamics non vérifiés.');
 const basePrice=round((trade.status==='UNIQUE'?Number(trade.safePrice):raw)/quantity);
 if(!(basePrice>0))throw fail('Prix de base indisponible.');
 const offers=(pricing.promotions?.items||[]).filter(offer=>offer.activeForRequestedContext&&!isMarkdownOffer(offer.offerId,offer.name));
 if(offers.some(offer=>offer.mechanic?.type!=='DISCOUNT')||offers.length>1)throw fail('Offres cumulées ou conditionnelles à rapprocher avant envoi à Glovo.');
 if(!offers.length)return{basePrice,promotion:null};
 const offer=offers[0],unit=String(offer.itemLine?.unit||base.unit).toUpperCase();
 if(unit!==String(base.unit).toUpperCase()||quantity!==1||offer.currencyCode&&offer.currencyCode!=='MAD')throw fail('Unité ou devise de promotion à rapprocher.');
 const price=computeSimpleEffectivePrice(basePrice,offer.mechanic),startTime=dayBoundary(offer.validFrom),endTime=dayBoundary(offer.validTo,true);
 if(!(price>0&&price<basePrice)||!startTime||!endTime||startTime>=endTime)throw fail('Prix promotionnel ou dates de promotion indisponibles.');
 return{basePrice,promotion:{price,offerId:offer.offerId,name:offer.name,startTime,endTime}};
}
export async function previewGlovoProduct(storeId,sku,{readAvailability=buildGlovoAvailability,readPricing=getProductPricing}={}){
 if(typeof sku!=='string'||!GLOVO_SKUS.has(sku))throw fail('Choisir un article du catalogue Glovo.');
 if(process.env.GLOVO_PRICE_BASIS!=='TTC_PER_SALES_UNIT'||process.env.GLOVO_PRICE_CURRENCY!=='MAD')throw fail('Base TTC par unité de vente et devise MAD à confirmer.','GLOVO_PRICE_BASIS_REQUIRED');
 const [snapshot,pricing]=await Promise.all([readAvailability(storeId,{force:true}),readPricing(sku,{storeId})]);
 if(snapshot.status!=='READY')throw fail('Stock magasin incomplet.');
 const item=snapshot.items.find(row=>row.sku===sku);if(!item)throw fail('Article absent du catalogue magasin.');
 const prices=glovoProductPrices(pricing),config=glovoIntegrationConfig(storeId);
 const product={sku,name:item.name||sku,active:item.active,basePrice:prices.basePrice,promotion:prices.promotion,currency:'MAD',vendorId:config.vendorId};
 return{...product,fingerprint:createHash('sha256').update(JSON.stringify(product)).digest('hex')};
}
function requireTest(storeId){
 const config=glovoIntegrationConfig(storeId);
 if(!config.credentialsReady||!config.webhookConfigured||!config.testPushEnabled||config.vendorId!=='51530')throw fail('Le test complet exige le magasin test 51530, ses accès et ses notifications configurés.');
 return config;
}
async function send(url,payload,token,fetchImpl){
 const response=await fetchImpl(url,{method:'PUT',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw fail('Glovo a refusé cet envoi (HTTP '+response.status+').',[400,401,403,404,409,422].includes(response.status)?'GLOVO_PRODUCT_REJECTED':'GLOVO_PRODUCT_UNKNOWN');
 if(!result?.job_id)throw fail('Glovo n’a pas retourné de numéro de traitement.');
 return result;
}
export async function submitGlovoProduct(storeId,{sku,fingerprint,...options}={}){
 const config=requireTest(storeId),product=await previewGlovoProduct(storeId,sku,options);
 if(product.fingerprint!==fingerprint)throw fail('Le prix ou la disponibilité a changé. Refaire la prévisualisation.');
 assertNoGlovoJobInFlight(storeId);
 const fetchImpl=options.fetchImpl||fetch,token=await resolveGlovoBearerToken({fetchImpl});
 const remote=await readGlovoCatalogSkus(config,{token,fetchImpl});if(!remote.has(sku))throw fail('Article absent du catalogue Glovo distant.');
 const dispatchId='dispatch-'+randomUUID(),base={jobId:dispatchId,storeId,vendorId:config.vendorId,scope:'TEST_PRODUCT_PRICES',testedSku:sku,testedActive:product.active,pricesSent:true,sentProducts:1,product,submittedAt:new Date().toISOString(),status:'SUBMITTING'};
 assertNoGlovoJobInFlight(storeId);saveGlovoJob(base);
 try{
  const result=await send(config.apiBaseUrl.replace(/\/$/,'')+`/v2/chains/${encodeURIComponent(config.chainId)}/vendors/${encodeURIComponent(config.vendorId)}/catalog`,{products:[{sku,active:product.active,price:product.basePrice}]},token,fetchImpl);
  saveGlovoJob({...base,status:'SUBMITTED'});saveGlovoJob({...base,jobId:result.job_id,status:'QUEUED'});
  return{jobId:result.job_id,product,status:'QUEUED',stage:'CATALOG'};
 }catch(error){saveGlovoJob({...base,status:error.code==='GLOVO_PRODUCT_REJECTED'?'FAILED':'UNKNOWN'});throw error;}
}
export async function continueGlovoProduct(storeId,jobId,{fetchImpl=fetch}={}){
 const config=requireTest(storeId),job=glovoJob(storeId,jobId);
 if(job.scope!=='TEST_PRODUCT_PRICES')throw fail('Traitement incompatible.');
 if(job.promotionJobId)return{...glovoJob(storeId,job.promotionJobId),stage:'PROMOTION'};
 if(job.status!=='COMPLETED')throw fail('Attendre la fin de la mise à jour du catalogue.');
 if(!job.product?.promotion)return{...job,stage:'DONE'};
 assertNoGlovoJobInFlight(storeId);
 const promotion=job.product.promotion,token=await resolveGlovoBearerToken({fetchImpl});
 assertNoGlovoJobInFlight(storeId);
 const dispatch={...job,jobId:'dispatch-'+randomUUID(),status:'SUBMITTING',scope:'TEST_PRODUCT_PROMOTION',parentJobId:jobId};
 // Claim before sending. A repeated request sees the same claim instead of resending.
 const claim={...job,promotionJobId:dispatch.jobId};saveGlovoJob(claim);saveGlovoJob(dispatch);
 try{
  const result=await send(config.apiBaseUrl.replace(/\/$/,'')+`/v2/chains/${encodeURIComponent(config.chainId)}/promotion`,{vendors:[config.vendorId],type:'STRIKETHROUGH',active:true,reason:'COMPETITIVENESS',name:promotion.name,conditions:{start_time:promotion.startTime,end_time:promotion.endTime},discount:[{discount_subtype:'PERCENTAGE',discount_value:Number(((job.product.basePrice-promotion.price)/job.product.basePrice*100).toFixed(8)),active:true,sku:[job.testedSku]}]},token,fetchImpl);
  saveGlovoJob({...dispatch,status:'SUBMITTED'});saveGlovoJob({...dispatch,jobId:result.job_id,status:'QUEUED'});saveGlovoJob({...claim,promotionJobId:result.job_id});
  return{jobId:result.job_id,status:'QUEUED',stage:'PROMOTION'};
 }catch(error){saveGlovoJob({...dispatch,status:error.code==='GLOVO_PRODUCT_REJECTED'?'FAILED':'UNKNOWN'});throw error;}
}
export async function productSyncStatus(storeId,jobId,{fetchImpl=fetch}={}){
 const job=glovoJob(storeId,jobId);
 if(job.scope!=='TEST_PRODUCT_PROMOTION'||!['QUEUED','IN_PROGRESS'].includes(job.status))return job;
 const config=requireTest(storeId),token=await resolveGlovoBearerToken({fetchImpl});
 const response=await fetchImpl(config.apiBaseUrl.replace(/\/$/,'')+`/v2/chains/${encodeURIComponent(config.chainId)}/promotion/jobs/${encodeURIComponent(jobId)}`,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw fail('Résultat Glovo temporairement indisponible.');
 const result=await response.json(),issues=result.result||{};
 const rejected=Object.values(issues).some(value=>Array.isArray(value)?value.length>0:value&&typeof value==='object'?Object.values(value).some(items=>items?.length>0):false);
 const status=rejected?'FAILED':result.job_status;
 if(!['QUEUED','IN_PROGRESS','COMPLETED','FAILED','DUPLICATE'].includes(status))throw fail('État Glovo inconnu.');
 saveGlovoJob({...job,status:status==='DUPLICATE'?'COMPLETED':status,result:issues,updatedAt:new Date().toISOString()});
 return glovoJob(storeId,jobId);
}

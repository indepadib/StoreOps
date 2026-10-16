import { db } from '../db.mjs';
import { canAccessStore, isPlatformAdmin } from './permissions.mjs';
import { getStoreCommerceProduct } from './loss-api.mjs';
import {
 listMarkdownRecommendations,markdownDashboard,listMarkdownRules,upsertMarkdownRule,markdownPosProfiles,validatePosProfile,
 listPrinters,upsertPrinter,operationPreview,createMarkdownOperation,approveMarkdownOperation,createPrintJob,listPrintJobs,retryPrintJob,
 confirmLabelsApplied,listMarkdownAlerts,claimPrintJob,completePrintJob,runMarkdownMonitor
} from './dlc-markdown.mjs';

const clean=v=>String(v??'').trim();
function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>2e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',reject)})}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function canExecute(user,storeId){return !!user&&(user.role==='ops_director'||isPlatformAdmin(user)||user.store_id===storeId||(user.role==='employee'&&user.permissions_profile==='quality_audit'))}
function requireExecute(user,storeId){if(!canExecute(user,storeId))throw Object.assign(new Error('Action DLC / étiquetage non autorisée pour ce profil.'),{status:403})}
function requireDirector(user){if(!(user?.role==='ops_director'||isPlatformAdmin(user)))throw Object.assign(new Error('Configuration Markdown réservée à la Direction / administration.'),{status:403})}
async function currentPrice(storeId,record){
 if(!record?.ean)return{price:null,product:null,error:'EAN absent'};
 try{const product=await getStoreCommerceProduct(storeId,record.ean);return{price:product?.price??null,product,error:product?.pricingError?.message||null}}catch(error){return{price:null,product:null,error:error?.message||String(error)}}
}

export async function handleDlcMarkdownApi({req,url,user}){
 const path=url.pathname;let p;
 p=route(path,'/api/stores/:storeId/dlc-markdown');if(p&&req.method==='GET'){
  requireStore(user,p.storeId);
  return{status:200,data:{dashboard:markdownDashboard(p.storeId),recommendations:listMarkdownRecommendations(p.storeId),alerts:listMarkdownAlerts(p.storeId),jobs:listPrintJobs(p.storeId,{limit:50}),printers:listPrinters(p.storeId),posProfiles:markdownPosProfiles()}}
 }
 p=route(path,'/api/stores/:storeId/dlc-markdown/recommendations');if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:{items:listMarkdownRecommendations(p.storeId,{includeProcessed:url.searchParams.get('all')==='1'}),dashboard:markdownDashboard(p.storeId)}}}
 p=route(path,'/api/stores/:storeId/dlc-markdown/jobs');if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:{items:listPrintJobs(p.storeId,{limit:url.searchParams.get('limit')||100})}}}
 p=route(path,'/api/stores/:storeId/label-printers');if(p){
  requireStore(user,p.storeId);
  if(req.method==='GET')return{status:200,data:{items:listPrinters(p.storeId)}};
  if(req.method==='POST'||req.method==='PUT'){requireDirector(user);const b=await body(req);return{status:200,data:upsertPrinter({id:b.id||null,user,storeId:p.storeId,name:b.name,bridgeKey:b.bridgeKey,protocol:b.protocol,mediaWidthMm:b.mediaWidthMm,mediaHeightMm:b.mediaHeightMm,dpi:b.dpi,colorMode:b.colorMode,active:b.active!==false,isDefault:!!b.isDefault})}}
 }
 if(path==='/api/dlc-markdown/rules'){
  if(req.method==='GET'){if(!(user?.role==='ops_director'||isPlatformAdmin(user)||user?.permissions_profile==='quality_audit'))throw Object.assign(new Error('Accès règles Markdown non autorisé.'),{status:403});return{status:200,data:{items:listMarkdownRules(),posProfiles:markdownPosProfiles()}}}
  if(req.method==='POST'||req.method==='PUT'){requireDirector(user);const b=await body(req);return{status:200,data:upsertMarkdownRule({id:b.id||null,user,scopeType:b.scopeType,scopeValue:b.scopeValue,storeId:b.storeId,daysBeforeExpiry:b.daysBeforeExpiry,markdownCode:b.markdownCode,priority:b.priority,actionMode:b.actionMode,alertPriority:b.alertPriority,active:b.active!==false})}}
 }
 p=route(path,'/api/dlc-markdown/pos/:markdownCode');if(p&&(req.method==='PUT'||req.method==='POST')){requireDirector(user);const b=await body(req);return{status:200,data:validatePosProfile({markdownCode:p.markdownCode,user,symbology:b.symbology,roundingDecimals:b.roundingDecimals,evidenceNote:b.evidenceNote,confirmed:b.confirmed===true})}}
 p=route(path,'/api/dlc-markdown/:dlcId/preview');if(p&&req.method==='GET'){
  const record=db.prepare('SELECT * FROM dlc_records WHERE id=?').get(p.dlcId);if(!record)return{status:404,data:{error:'Lot DLC introuvable'}};
  requireStore(user,record.store_id);const live=await currentPrice(record.store_id,record),preview=operationPreview({dlcId:p.dlcId,markdownCode:url.searchParams.get('markdown')||null,originalPrice:live.price});
  return{status:200,data:{...preview,priceSource:live.price==null?'UNAVAILABLE':'D365_COMMERCE',priceError:live.error,product:live.product?{productNumber:live.product.productNumber,ean:live.product.ean,name:live.product.name,retailUnit:live.product.retailUnit}:null}}
 }
 p=route(path,'/api/dlc-markdown/:dlcId/operations');if(p&&req.method==='POST'){
  const record=db.prepare('SELECT * FROM dlc_records WHERE id=?').get(p.dlcId);if(!record)return{status:404,data:{error:'Lot DLC introuvable'}};
  requireExecute(user,record.store_id);const b=await body(req),live=await currentPrice(record.store_id,record),op=createMarkdownOperation({dlcId:p.dlcId,user,quantity:b.quantity,markdownCode:b.markdownCode,originalPrice:live.price,idempotencyKey:b.idempotencyKey});
  return{status:201,data:{operation:op,priceSource:live.price==null?'UNAVAILABLE':'D365_COMMERCE',priceError:live.error}}
 }
 p=route(path,'/api/dlc-markdown/operations/:operationId/approve');if(p&&req.method==='POST'){return{status:200,data:approveMarkdownOperation({operationId:p.operationId,user})}}
 p=route(path,'/api/dlc-markdown/operations/:operationId/applied');if(p&&req.method==='POST'){
  const op=db.prepare('SELECT * FROM dlc_markdown_operations WHERE id=?').get(p.operationId);if(!op)return{status:404,data:{error:'Opération introuvable'}};
  requireExecute(user,op.store_id);return{status:200,data:confirmLabelsApplied({operationId:p.operationId,user})}
 }
 p=route(path,'/api/stores/:storeId/label-print-jobs');if(p&&req.method==='POST'){
  requireExecute(user,p.storeId);const b=await body(req);return{status:201,data:createPrintJob({storeId:p.storeId,user,operationIds:b.operationIds||[],printerId:b.printerId||null,idempotencyKey:b.idempotencyKey||null})}
 }
 p=route(path,'/api/label-print-jobs/:jobId/retry');if(p&&req.method==='POST'){
  const job=db.prepare('SELECT * FROM label_print_jobs WHERE id=?').get(p.jobId);if(!job)return{status:404,data:{error:'Job introuvable'}};
  requireExecute(user,job.store_id);return{status:200,data:retryPrintJob({jobId:p.jobId,user})}
 }
 if(path==='/api/dlc-markdown/dashboard'&&req.method==='GET'){requireDirector(user);return{status:200,data:{dashboard:markdownDashboard(null),alerts:listMarkdownAlerts(null),rules:listMarkdownRules(),posProfiles:markdownPosProfiles()}}}
 return null;
}

export async function handleDlcMarkdownInternalApi({req,url}){
 const path=url.pathname,monitorSecret=clean(process.env.STOREOPS_MONITOR_SECRET),printToken=clean(process.env.STOREOPS_PRINT_BRIDGE_TOKEN);
 if(path==='/api/internal/dlc-markdown/monitor'&&req.method==='POST'){
  if(!monitorSecret||clean(req.headers['x-storeops-monitor-secret'])!==monitorSecret)throw Object.assign(new Error('Monitor non autorisé.'),{status:403});
  return{status:200,data:runMarkdownMonitor()};
 }
 if(path==='/api/internal/store-print/claim'&&req.method==='POST'){
  if(!printToken||clean(req.headers['x-storeops-print-token'])!==printToken)throw Object.assign(new Error('Print bridge non autorisé.'),{status:403});
  const b=await body(req),job=claimPrintJob({bridgeKey:b.bridgeKey});
  return{status:200,data:{job}};
 }
 if(path==='/api/internal/store-print/complete'&&req.method==='POST'){
  if(!printToken||clean(req.headers['x-storeops-print-token'])!==printToken)throw Object.assign(new Error('Print bridge non autorisé.'),{status:403});
  const b=await body(req);return{status:200,data:completePrintJob({jobId:b.jobId,bridgeKey:b.bridgeKey,success:b.success===true,error:b.error||null})};
 }
 return null;
}

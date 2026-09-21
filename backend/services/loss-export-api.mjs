import { todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { lossExportRun,lossExportStatus,generateLossClosingPack,confirmLossClosingPackImport } from './loss-export.mjs';
import { isNetworkDirector,isPlatformAdmin } from './access-management.mjs';
import { lossExportMappingConfig,saveLossExportMappingDraft,previewLossExportMapping,activateLossExportMapping,disableLossExportMapping } from './loss-export-mapping.mjs';
import { buildLossExcel } from './operations-excel.mjs';
import { listLossRecords,revalueLossRecord } from './loss.mjs';
import { LOSS_VALUATION_VERSION } from './loss-valuation.mjs';
import { getStoreCommerceProduct } from './loss-api.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>2e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',reject)})}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function requireManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou Directeur d’exploitation'),{status:403})}
function requireNetwork(user){if(!isNetworkDirector(user))throw Object.assign(new Error('Configuration Closing Pack réservée à la Direction.'),{status:403,code:'LOSS_EXPORT_MAPPING_READ_REQUIRED'})}
function requirePlatformAdmin(user){if(!isPlatformAdmin(user))throw Object.assign(new Error('Modification du template Closing Pack réservée à un Administrateur StoreOps.'),{status:403,code:'PLATFORM_ADMIN_REQUIRED'})}

async function refreshLegacyValuations({storeId,businessDate,user}){
 const rows=listLossRecords(storeId,businessDate,'ALL').filter(x=>x.status!=='CANCELLED'&&x.valuation_version!==LOSS_VALUATION_VERSION);
 const outcomes=[];
 for(let i=0;i<rows.length;i+=4){
  const batch=rows.slice(i,i+4);
  const results=await Promise.all(batch.map(async row=>{
   try{
    const product=await getStoreCommerceProduct(storeId,row.ean,businessDate);
    if(!product)return{id:row.id,status:'SKIPPED',reason:'PRODUCT_NOT_FOUND'};
    revalueLossRecord({id:row.id,product,user});
    return{id:row.id,status:'REVALUED'}
   }catch(error){return{id:row.id,status:'SKIPPED',reason:error?.code||error?.message||'REVALUATION_FAILED'}}
  }));
  outcomes.push(...results)
 }
 return{requested:rows.length,revalued:outcomes.filter(x=>x.status==='REVALUED').length,skipped:outcomes.filter(x=>x.status!=='REVALUED').length,outcomes}
}

export async function handleLossExportApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/admin/loss-export-mapping'&&req.method==='GET'){requireNetwork(user);return{status:200,data:{...lossExportMappingConfig(),canManage:isPlatformAdmin(user)}}}
 if(path==='/api/admin/loss-export-mapping/draft'&&req.method==='POST'){requirePlatformAdmin(user);const b=await body(req);return{status:200,data:saveLossExportMappingDraft({actor:user,input:b})}}
 if(path==='/api/admin/loss-export-mapping/preview'&&req.method==='POST'){requirePlatformAdmin(user);const b=await body(req);return{status:200,data:previewLossExportMapping({actor:user,input:b.template||null})}}
 if(path==='/api/admin/loss-export-mapping/activate'&&req.method==='POST'){requirePlatformAdmin(user);const b=await body(req);return{status:200,data:activateLossExportMapping({actor:user,reference:b.reference})}}
 if(path==='/api/admin/loss-export-mapping/disable'&&req.method==='POST'){requirePlatformAdmin(user);return{status:200,data:disableLossExportMapping({actor:user})}}
 p=route(path,'/api/stores/:storeId/losses/export-status');if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:lossExportStatus(p.storeId,url.searchParams.get('date')||todayISO())}}
 p=route(path,'/api/stores/:storeId/losses/export-excel');if(p&&(req.method==='GET'||req.method==='POST')){requireStore(user,p.storeId);requireManage(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO(),revaluation=await refreshLegacyValuations({storeId:p.storeId,businessDate,user}),data=buildLossExcel({storeId:p.storeId,businessDate,user});return{status:200,data:{...data,revaluation}}}
 p=route(path,'/api/stores/:storeId/losses/export');if(p&&req.method==='POST'){requireStore(user,p.storeId);requireManage(user,p.storeId);const b=await body(req);return{status:201,data:generateLossClosingPack({storeId:p.storeId,businessDate:b.businessDate||url.searchParams.get('date')||todayISO(),user})}}
 p=route(path,'/api/loss-exports/:exportId/confirm');if(p&&req.method==='POST'){const run=lossExportRun(p.exportId);if(!run)throw Object.assign(new Error('Export démarque introuvable.'),{status:404});requireStore(user,run.store_id);requireManage(user,run.store_id);const b=await body(req);return{status:200,data:confirmLossClosingPackImport({exportId:p.exportId,user,reference:b.reference})}}
 return null
}

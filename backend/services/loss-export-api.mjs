import { todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { lossExportRun,lossExportStatus,generateLossClosingPack,confirmLossClosingPackImport } from './loss-export.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>2e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',reject)})}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function requireManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou Directeur d’exploitation'),{status:403})}

export async function handleLossExportApi({req,url,user}){
 const path=url.pathname;let p;
 p=route(path,'/api/stores/:storeId/losses/export-status');if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:lossExportStatus(p.storeId,url.searchParams.get('date')||todayISO())}}
 p=route(path,'/api/stores/:storeId/losses/export');if(p&&req.method==='POST'){requireStore(user,p.storeId);requireManage(user,p.storeId);const b=await body(req);return{status:201,data:generateLossClosingPack({storeId:p.storeId,businessDate:b.businessDate||url.searchParams.get('date')||todayISO(),user})}}
 p=route(path,'/api/loss-exports/:exportId/confirm');if(p&&req.method==='POST'){const run=lossExportRun(p.exportId);if(!run)throw Object.assign(new Error('Export démarque introuvable.'),{status:404});requireStore(user,run.store_id);requireManage(user,run.store_id);const b=await body(req);return{status:200,data:confirmLossClosingPackImport({exportId:p.exportId,user,reference:b.reference})}}
 return null
}

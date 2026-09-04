import { todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { getProductByEan,postLossToDynamics } from './dynamics.mjs';
import { lossConfig,listLossRecords,lossSummary,lossRecord,createLossRecord,approveLossRecord,ensureLossPostable,markLossPosted,updateLossPolicy } from './loss.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>8e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',reject)})}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function requireManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou Directeur d’exploitation'),{status:403})}
function requireDirector(user){if(user.role!=='ops_director')throw Object.assign(new Error('Réservé au Directeur d’exploitation'),{status:403})}

export async function handleLossApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/loss/config'&&req.method==='GET')return{status:200,data:lossConfig()};
 if(path==='/api/loss/policy'&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateLossPolicy({user,evidenceThreshold:b.evidenceThreshold,approvalThreshold:b.approvalThreshold})}}
 p=route(path,'/api/stores/:storeId/losses');if(p){
  requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();
  if(req.method==='GET'){const status=(url.searchParams.get('status')||'ALL').toUpperCase();return{status:200,data:{summary:lossSummary(p.storeId,businessDate),items:listLossRecords(p.storeId,businessDate,status)}}}
  if(req.method==='POST'){
   requireManage(user,p.storeId);const b=await body(req),product=await getProductByEan(String(b.ean||'').trim());if(!product)throw Object.assign(new Error('Article introuvable Dynamics.'),{status:404});
   return{status:201,data:createLossRecord({storeId:p.storeId,businessDate,user,product,reasonCode:b.reasonCode,quantity:b.quantity,unit:b.unit,note:b.note,sourceType:b.sourceType||'MANUAL',sourceId:b.sourceId||null})};
  }
 }
 p=route(path,'/api/losses/:lossId');if(p&&req.method==='GET'){const row=lossRecord(p.lossId);if(!row)throw Object.assign(new Error('Perte introuvable.'),{status:404});requireStore(user,row.store_id);return{status:200,data:row}}
 p=route(path,'/api/losses/:lossId/approve');if(p&&req.method==='POST'){const row=lossRecord(p.lossId);if(!row)throw Object.assign(new Error('Perte introuvable.'),{status:404});requireStore(user,row.store_id);requireDirector(user);return{status:200,data:approveLossRecord({id:p.lossId,user})}}
 p=route(path,'/api/losses/:lossId/post');if(p&&req.method==='POST'){
  const row=lossRecord(p.lossId);if(!row)throw Object.assign(new Error('Perte introuvable.'),{status:404});requireStore(user,row.store_id);requireManage(user,row.store_id);const postable=ensureLossPostable(p.lossId);
  const dynamics=await postLossToDynamics(postable.id,{storeId:postable.store_id,businessDate:postable.business_date,ean:postable.ean,productNumber:postable.product_number,quantity:-Math.abs(Number(postable.quantity)),unit:postable.unit,reasonCode:postable.reason_code,sourceType:postable.source_type,sourceId:postable.source_id});
  return{status:200,data:{dynamics,record:markLossPosted({id:p.lossId,user})}};
 }
 return null;
}

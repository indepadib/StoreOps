import { db,todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { getProductByEan,postLossToDynamics } from './dynamics.mjs';
import { getCashOpeningSnapshot } from './dynamics-cash-opening.mjs';
import { lossConfig,listLossRecords,lossSummary,lossRecord,createLossRecord,approveLossRecord,ensureLossPostable,markLossPosted,updateLossPolicy } from './loss.mjs';
import { cashOpeningConfig,cashOpening,cashOpeningSummary,syncCashOpening,checkCashOpeningLine,updateCashOpeningPolicy } from './cash-opening.mjs';
import { coldChainConfig,coldChainDay,coldChainSummary,ensureColdChainDay,checkColdChainLine,recheckColdChainLine,updateColdProfile } from './cold-chain.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>8e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',reject)})}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function requireManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou Directeur d’exploitation'),{status:403})}
function requireDirector(user){if(user.role!=='ops_director')throw Object.assign(new Error('Réservé au Directeur d’exploitation'),{status:403})}

export async function handleLossApi({req,url,user}){
 const path=url.pathname;let p;

 // Cold chain opening controls share this lightweight route handler to keep server.mjs stable.
 if(path==='/api/cold-chain/config'&&req.method==='GET')return{status:200,data:coldChainConfig()};
 p=route(path,'/api/cold-chain/profiles/:code');if(p&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateColdProfile({code:p.code,user,tempMin:b.tempMin,tempMax:b.tempMax})}}
 p=route(path,'/api/stores/:storeId/cold-chain');if(p&&req.method==='GET'){requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();ensureColdChainDay(p.storeId,businessDate);return{status:200,data:{summary:coldChainSummary(p.storeId,businessDate),day:coldChainDay(p.storeId,businessDate)}}}
 p=route(path,'/api/cold-chain/lines/:lineId/check');if(p&&req.method==='POST'){const row=db.prepare(`SELECT d.store_id FROM cold_chain_lines l JOIN cold_chain_days d ON d.id=l.cold_day_id WHERE l.id=?`).get(p.lineId);if(!row)throw Object.assign(new Error('Zone froid introuvable.'),{status:404});requireStore(user,row.store_id);requireManage(user,row.store_id);const b=await body(req),result=checkColdChainLine({lineId:p.lineId,user,temperature:b.temperature,doorOk:b.doorOk===true,note:b.note||''});return{status:result.issues.length?409:200,data:result}}
 p=route(path,'/api/cold-chain/lines/:lineId/recheck');if(p&&req.method==='POST'){const row=db.prepare(`SELECT d.store_id FROM cold_chain_lines l JOIN cold_chain_days d ON d.id=l.cold_day_id WHERE l.id=?`).get(p.lineId);if(!row)throw Object.assign(new Error('Zone froid introuvable.'),{status:404});requireStore(user,row.store_id);requireManage(user,row.store_id);const b=await body(req),result=recheckColdChainLine({lineId:p.lineId,user,temperature:b.temperature,doorOk:b.doorOk===true,maintenanceSignaled:b.maintenanceSignaled===true,note:b.note||''});return{status:result.issues.length?409:200,data:result}}

 // Cash opening readiness shares this lightweight route handler to keep server.mjs stable.
 if(path==='/api/cash-opening/config'&&req.method==='GET')return{status:200,data:cashOpeningConfig()};
 if(path==='/api/cash-opening/policy'&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateCashOpeningPolicy({user,floatTolerance:b.floatTolerance})}}
 p=route(path,'/api/stores/:storeId/cash-opening');if(p&&req.method==='GET'){
  requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();let sync={ok:true};
  try{const snapshot=await getCashOpeningSnapshot(p.storeId,businessDate);sync={ok:true,opening:syncCashOpening({storeId:p.storeId,businessDate,snapshot})}}
  catch(e){sync={ok:false,error:e.message,code:e.code||'CASH_OPENING_SYNC_FAILED'}}
  return{status:200,data:{summary:cashOpeningSummary(p.storeId,businessDate),opening:cashOpening(p.storeId,businessDate),sync}};
 }
 p=route(path,'/api/stores/:storeId/cash-opening/sync');if(p&&req.method==='POST'){
  requireStore(user,p.storeId);requireManage(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO(),snapshot=await getCashOpeningSnapshot(p.storeId,businessDate),opening=syncCashOpening({storeId:p.storeId,businessDate,snapshot});
  return{status:200,data:{summary:cashOpeningSummary(p.storeId,businessDate),opening,sync:{ok:true,source:snapshot.source||'D365'}}};
 }
 p=route(path,'/api/cash-opening/lines/:lineId/check');if(p&&req.method==='POST'){
  const row=db.prepare(`SELECT o.store_id FROM cash_opening_lines l JOIN cash_openings o ON o.id=l.opening_id WHERE l.id=?`).get(p.lineId);if(!row)throw Object.assign(new Error('Caisse d’ouverture introuvable.'),{status:404});requireStore(user,row.store_id);requireManage(user,row.store_id);const b=await body(req);
  const result=checkCashOpeningLine({lineId:p.lineId,user,cashierName:b.cashierName,declaredFloat:b.declaredFloat,posOk:b.posOk===true,tpeOk:b.tpeOk===true,printerOk:b.printerOk===true,shiftOpened:b.shiftOpened===true,note:b.note||''});
  return{status:result.issues.length?409:200,data:result};
 }

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

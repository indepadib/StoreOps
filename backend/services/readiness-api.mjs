import { db,todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { staffingConfig,staffingDay,staffingSummary,syncStaffingDay,setAttendance,markStaffingOpened,updateStaffingPolicy } from './staffing.mjs';
import { getStaffingSnapshot } from './dynamics-staffing.mjs';
import { cashOpeningConfig,cashOpening,cashOpeningSummary,syncCashOpening,checkCashOpeningLine,markCashOpeningOpened,updateCashOpeningPolicy } from './cash-opening.mjs';
import { getCashOpeningSnapshot } from './dynamics-cash-opening.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400,code:'INVALID_JSON'})}}
const forbidden=(message='Accès interdit')=>({status:403,data:{error:message}});
function director(user){if(user?.role!=='ops_director')throw Object.assign(new Error('Réservé à la Direction.'),{status:403})}
function storeForCashLine(id){return db.prepare(`SELECT o.store_id FROM cash_opening_lines l JOIN cash_openings o ON o.id=l.opening_id WHERE l.id=?`).get(id)?.store_id||null}
function storeForStaffLine(id){return db.prepare(`SELECT d.store_id FROM staffing_lines l JOIN staffing_days d ON d.id=l.staffing_day_id WHERE l.id=?`).get(id)?.store_id||null}

async function loadStaffing(storeId,businessDate,{force=false}={}){
 let day=staffingDay(storeId,businessDate),sync=null;
 if(force){
  try{const snapshot=await getStaffingSnapshot(storeId,businessDate);day=syncStaffingDay({storeId,businessDate,snapshot});sync={ok:true,source:snapshot.source||snapshot.sourceKey||'StoreOps'}}
  catch(error){sync={ok:false,code:error?.code||'STAFFING_SYNC_FAILED',message:error?.message||String(error)}}
 }
 if(!day)sync={ok:false,code:'STAFFING_NOT_SYNCED',message:'Planning non synchronisé pour cette journée.'};
 return{day:day||null,summary:staffingSummary(storeId,businessDate),sync}
}
async function loadCashOpening(storeId,businessDate,{force=false}={}){
 let opening=cashOpening(storeId,businessDate),sync=null;
 if(force){
  try{const snapshot=await getCashOpeningSnapshot(storeId,businessDate);opening=syncCashOpening({storeId,businessDate,snapshot});sync={ok:true,source:snapshot.source||snapshot.sourceKey||'StoreOps'}}
  catch(error){sync={ok:false,code:error?.code||'CASH_OPENING_SYNC_FAILED',message:error?.message||String(error)}}
 }
 if(!opening)sync={ok:false,code:'CASH_OPENING_NOT_SYNCED',message:'Préparation caisses non synchronisée pour cette journée.'};
 return{opening:opening||null,summary:cashOpeningSummary(storeId,businessDate),sync}
}

export async function handleReadinessApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/staffing/config'&&req.method==='GET')return{status:200,data:staffingConfig()};
 if(path==='/api/staffing/policy'&&(req.method==='PUT'||req.method==='PATCH')){director(user);const b=await body(req);return{status:200,data:updateStaffingPolicy({user,requiredManagers:b.requiredManagers,requiredCashiers:b.requiredCashiers,requiredFloor:b.requiredFloor})}}
 p=route(path,'/api/stores/:storeId/staffing');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  const businessDate=url.searchParams.get('date')||todayISO();return{status:200,data:await loadStaffing(p.storeId,businessDate,{force:false})}
 }
 p=route(path,'/api/stores/:storeId/staffing/sync');
 if(p&&req.method==='POST'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  if(!canManageStore(user,p.storeId))return forbidden('Pointage équipe réservé au Responsable magasin ou à la Direction.');
  const businessDate=url.searchParams.get('date')||todayISO();return{status:200,data:await loadStaffing(p.storeId,businessDate,{force:true})}
 }
 p=route(path,'/api/staffing/lines/:lineId/attendance');
 if(p&&req.method==='POST'){
  const storeId=storeForStaffLine(p.lineId);if(!storeId)return{status:404,data:{error:'Collaborateur planning introuvable.'}};
  if(!canAccessStore(user,storeId))return forbidden('Accès interdit à ce magasin.');
  if(!canManageStore(user,storeId))return forbidden('Pointage équipe réservé au Responsable magasin ou à la Direction.');
  const b=await body(req);return{status:200,data:setAttendance({lineId:p.lineId,user,status:b.status,replacementName:b.replacementName||'',note:b.note||''})}
 }
 p=route(path,'/api/stores/:storeId/staffing/open');
 if(p&&req.method==='POST'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  if(!canManageStore(user,p.storeId))return forbidden('Ouverture équipe réservée au Responsable magasin ou à la Direction.');
  return{status:200,data:markStaffingOpened({storeId:p.storeId,businessDate:url.searchParams.get('date')||todayISO(),user})}
 }

 if(path==='/api/cash-opening/config'&&req.method==='GET')return{status:200,data:cashOpeningConfig()};
 if(path==='/api/cash-opening/policy'&&(req.method==='PUT'||req.method==='PATCH')){director(user);const b=await body(req);return{status:200,data:updateCashOpeningPolicy({user,floatTolerance:b.floatTolerance})}}
 p=route(path,'/api/stores/:storeId/cash-opening');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  const businessDate=url.searchParams.get('date')||todayISO();return{status:200,data:await loadCashOpening(p.storeId,businessDate,{force:false})}
 }
 p=route(path,'/api/stores/:storeId/cash-opening/sync');
 if(p&&req.method==='POST'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  if(!canManageStore(user,p.storeId))return forbidden('Préparation caisses réservée au Responsable magasin ou à la Direction.');
  const businessDate=url.searchParams.get('date')||todayISO();return{status:200,data:await loadCashOpening(p.storeId,businessDate,{force:true})}
 }
 p=route(path,'/api/cash-opening/lines/:lineId/check');
 if(p&&req.method==='POST'){
  const storeId=storeForCashLine(p.lineId);if(!storeId)return{status:404,data:{error:'Caisse d’ouverture introuvable.'}};
  if(!canAccessStore(user,storeId))return forbidden('Accès interdit à ce magasin.');
  if(!canManageStore(user,storeId))return forbidden('Préparation caisses réservée au Responsable magasin ou à la Direction.');
  const b=await body(req),result=checkCashOpeningLine({lineId:p.lineId,user,cashierName:b.cashierName,declaredFloat:b.declaredFloat,posOk:b.posOk===true,tpeOk:b.tpeOk===true,printerOk:b.printerOk===true,shiftOpened:b.shiftOpened===true,note:b.note||''});
  return{status:result.issues?.length?409:200,data:result}
 }
 p=route(path,'/api/stores/:storeId/cash-opening/open');
 if(p&&req.method==='POST'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  if(!canManageStore(user,p.storeId))return forbidden('Ouverture caisses réservée au Responsable magasin ou à la Direction.');
  return{status:200,data:markCashOpeningOpened({storeId:p.storeId,businessDate:url.searchParams.get('date')||todayISO(),user})}
 }
 return null
}

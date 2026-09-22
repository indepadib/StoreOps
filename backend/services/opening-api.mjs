import { db,todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { cashOpeningConfig,cashOpening,cashOpeningSummary,syncCashOpening,checkCashOpeningLine,markCashOpeningOpened,updateCashOpeningPolicy } from './cash-opening.mjs';
import { getCashOpeningSnapshot } from './dynamics-cash-opening.mjs';
import { staffingConfig,staffingDay,staffingSummary,syncStaffingDay,setAttendance,markStaffingOpened,updateStaffingPolicy } from './staffing.mjs';
import { getStaffingSnapshot } from './dynamics-staffing.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400,code:'API_INVALID_JSON_BODY'})}}
const forbidden=(message='Accès interdit')=>({status:403,data:{error:message}});
const own=(user,storeId)=>canAccessStore(user,storeId);
const manage=(user,storeId)=>canManageStore(user,storeId);
const director=user=>user?.role==='ops_director';

async function loadCashOpening(storeId,businessDate,{force=false}={}){
 let opening=cashOpening(storeId,businessDate),sync={ok:true,source:opening?.source_key||null,cached:!!opening};
 if(force||!opening){
  try{
   const snapshot=await getCashOpeningSnapshot(storeId,businessDate);
   opening=syncCashOpening({storeId,businessDate,snapshot});
   sync={ok:true,source:snapshot.source||snapshot.sourceKey||null,cached:false}
  }catch(error){
   sync={ok:false,code:error?.code||'CASH_OPENING_SYNC_FAILED',message:error?.message||String(error)};
  }
 }
 return{opening,summary:cashOpeningSummary(storeId,businessDate),sync}
}
async function loadStaffing(storeId,businessDate,{force=false}={}){
 let day=staffingDay(storeId,businessDate),sync={ok:true,source:day?.source_key||null,cached:!!day};
 if(force||!day){
  try{
   const snapshot=await getStaffingSnapshot(storeId,businessDate);
   day=syncStaffingDay({storeId,businessDate,snapshot});
   sync={ok:true,source:snapshot.source||snapshot.sourceKey||null,cached:false}
  }catch(error){
   sync={ok:false,code:error?.code||'STAFFING_SYNC_FAILED',message:error?.message||String(error)};
  }
 }
 return{day,summary:staffingSummary(storeId,businessDate),sync}
}

export async function handleOpeningApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/cash-opening/config'&&req.method==='GET')return{status:200,data:cashOpeningConfig()};
 if(path==='/api/cash-opening/policy'&&(req.method==='PUT'||req.method==='PATCH')){
  if(!director(user))return forbidden('Politique caisse réservée à la Direction.');
  const b=await body(req);return{status:200,data:updateCashOpeningPolicy({user,floatTolerance:b.floatTolerance})}
 }
 p=route(path,'/api/stores/:storeId/cash-opening');
 if(p&&req.method==='GET'){
  if(!own(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  return{status:200,data:await loadCashOpening(p.storeId,url.searchParams.get('date')||todayISO())}
 }
 p=route(path,'/api/stores/:storeId/cash-opening/sync');
 if(p&&req.method==='POST'){
  if(!manage(user,p.storeId))return forbidden('Préparation caisse réservée au Responsable magasin ou à la Direction.');
  return{status:200,data:await loadCashOpening(p.storeId,url.searchParams.get('date')||todayISO(),{force:true})}
 }
 p=route(path,'/api/stores/:storeId/cash-opening/check');
 if(p&&req.method==='POST'){
  if(!manage(user,p.storeId))return forbidden('Contrôle caisse réservé au Responsable magasin ou à la Direction.');
  const businessDate=url.searchParams.get('date')||todayISO(),b=await body(req),tillCode=String(b.tillCode||'').trim();
  if(!tillCode)return{status:400,data:{error:'Code caisse obligatoire.',code:'CASH_OPENING_TILL_REQUIRED'}};
  let opening=cashOpening(p.storeId,businessDate),line=opening?.lines?.find(x=>String(x.till_code)===tillCode)||null;
  if(!line){
   const loaded=await loadCashOpening(p.storeId,businessDate,{force:true});opening=loaded.opening;line=opening?.lines?.find(x=>String(x.till_code)===tillCode)||null;
  }
  if(!line)return{status:404,data:{error:'Caisse introuvable après resynchronisation Dynamics.',code:'CASH_OPENING_TILL_NOT_FOUND'}};
  const result=checkCashOpeningLine({lineId:line.id,user,cashierName:b.cashierName,declaredFloat:b.declaredFloat,posOk:b.posOk===true,tpeOk:b.tpeOk===true,printerOk:b.printerOk===true,shiftOpened:b.shiftOpened===true,note:b.note||''});
  return{status:result.issues?.length?409:200,data:result}
 }
 p=route(path,'/api/cash-opening/lines/:lineId/check');
 if(p&&req.method==='POST'){
  const row=db.prepare(`SELECT o.store_id FROM cash_opening_lines l JOIN cash_openings o ON o.id=l.opening_id WHERE l.id=?`).get(p.lineId);
  if(!row)return{status:404,data:{error:'Cette ligne de caisse n’existe plus. Resynchronise la préparation des caisses.',code:'CASH_OPENING_LINE_STALE'}};
  if(!manage(user,row.store_id))return forbidden('Contrôle caisse réservé au Responsable magasin ou à la Direction.');
  const b=await body(req),result=checkCashOpeningLine({lineId:p.lineId,user,cashierName:b.cashierName,declaredFloat:b.declaredFloat,posOk:b.posOk===true,tpeOk:b.tpeOk===true,printerOk:b.printerOk===true,shiftOpened:b.shiftOpened===true,note:b.note||''});
  return{status:result.issues?.length?409:200,data:result}
 }
 p=route(path,'/api/stores/:storeId/cash-opening/open');
 if(p&&req.method==='POST'){
  if(!manage(user,p.storeId))return forbidden();
  return{status:200,data:markCashOpeningOpened({storeId:p.storeId,businessDate:url.searchParams.get('date')||todayISO(),user})}
 }

 if(path==='/api/staffing/config'&&req.method==='GET')return{status:200,data:staffingConfig()};
 if(path==='/api/staffing/policy'&&(req.method==='PUT'||req.method==='PATCH')){
  if(!director(user))return forbidden('Politique staffing réservée à la Direction.');
  const b=await body(req);return{status:200,data:updateStaffingPolicy({user,requiredManagers:b.requiredManagers,requiredCashiers:b.requiredCashiers,requiredFloor:b.requiredFloor})}
 }
 p=route(path,'/api/stores/:storeId/staffing');
 if(p&&req.method==='GET'){
  if(!own(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  return{status:200,data:await loadStaffing(p.storeId,url.searchParams.get('date')||todayISO())}
 }
 p=route(path,'/api/stores/:storeId/staffing/sync');
 if(p&&req.method==='POST'){
  if(!manage(user,p.storeId))return forbidden('Pointage équipe réservé au Responsable magasin ou à la Direction.');
  return{status:200,data:await loadStaffing(p.storeId,url.searchParams.get('date')||todayISO(),{force:true})}
 }
 p=route(path,'/api/staffing/lines/:lineId/attendance');
 if(p&&req.method==='POST'){
  const row=db.prepare(`SELECT d.store_id FROM staffing_lines l JOIN staffing_days d ON d.id=l.staffing_day_id WHERE l.id=?`).get(p.lineId);
  if(!row)return{status:404,data:{error:'Cette ligne de planning n’existe plus. Resynchronise le planning.',code:'STAFFING_LINE_STALE'}};
  if(!manage(user,row.store_id))return forbidden('Pointage réservé au Responsable magasin ou à la Direction.');
  const b=await body(req);return{status:200,data:setAttendance({lineId:p.lineId,user,status:b.status,replacementName:b.replacementName||'',note:b.note||''})}
 }
 p=route(path,'/api/stores/:storeId/staffing/open');
 if(p&&req.method==='POST'){
  if(!manage(user,p.storeId))return forbidden();
  return{status:200,data:markStaffingOpened({storeId:p.storeId,businessDate:url.searchParams.get('date')||todayISO(),user})}
 }
 return null
}

import { db,todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { staffingConfig,staffingDay,staffingSummary,syncStaffingDay,setAttendance,updateStaffingPolicy } from './staffing.mjs';
import { getStaffingSnapshot } from './dynamics-staffing.mjs';
import { cashOpeningConfig,cashOpening,cashOpeningSummary,syncCashOpening,checkCashOpeningLine,updateCashOpeningPolicy } from './cash-opening.mjs';
import { getCashOpeningSnapshot } from './dynamics-cash-opening.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400,code:'API_INVALID_JSON'})}}
const forbidden=(message='Accès interdit')=>({status:403,data:{error:message}});
const director=user=>!!user&&user.role==='ops_director';

async function ensureStaffing(storeId,businessDate,{force=false}={}){
 let day=staffingDay(storeId,businessDate),sync={source:day?.source_key?'CACHE':'NONE',error:null};
 if(!day||force){
  try{
   const snapshot=await getStaffingSnapshot(storeId,businessDate);
   day=syncStaffingDay({storeId,businessDate,snapshot});
   sync={source:snapshot.source||'StoreOps',sourceKey:snapshot.sourceKey||null,error:null};
  }catch(error){
   sync={source:'UNAVAILABLE',error:{code:error?.code||'STAFFING_SYNC_FAILED',message:error?.message||String(error)}};
  }
 }
 return{day,summary:staffingSummary(storeId,businessDate),sync}
}
async function ensureCashOpening(storeId,businessDate,{force=false}={}){
 let opening=cashOpening(storeId,businessDate),sync={source:opening?.source_key?'CACHE':'NONE',error:null};
 if(!opening||force){
  try{
   const snapshot=await getCashOpeningSnapshot(storeId,businessDate);
   opening=syncCashOpening({storeId,businessDate,snapshot});
   sync={source:snapshot.source||'StoreOps',sourceKey:snapshot.sourceKey||null,error:null};
  }catch(error){
   sync={source:'UNAVAILABLE',error:{code:error?.code||'CASH_OPENING_SYNC_FAILED',message:error?.message||String(error)}};
  }
 }
 return{opening,summary:cashOpeningSummary(storeId,businessDate),sync}
}

export async function handleOpeningControlsApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/staffing/config'&&req.method==='GET')return{status:200,data:staffingConfig()};
 if(path==='/api/cash-opening/config'&&req.method==='GET')return{status:200,data:cashOpeningConfig()};

 p=route(path,'/api/stores/:storeId/staffing');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  const businessDate=url.searchParams.get('date')||todayISO();
  return{status:200,data:await ensureStaffing(p.storeId,businessDate,{force:url.searchParams.get('force')==='1'})}
 }
 p=route(path,'/api/stores/:storeId/staffing/sync');
 if(p&&req.method==='POST'){
  if(!canManageStore(user,p.storeId))return forbidden('Pointage équipe réservé au Responsable magasin ou à la Direction.');
  const businessDate=url.searchParams.get('date')||todayISO();
  return{status:200,data:await ensureStaffing(p.storeId,businessDate,{force:true})}
 }
 p=route(path,'/api/staffing/lines/:lineId/attendance');
 if(p&&req.method==='POST'){
  const row=db.prepare(`SELECT d.store_id FROM staffing_lines l JOIN staffing_days d ON d.id=l.staffing_day_id WHERE l.id=?`).get(p.lineId);
  if(!row)return{status:404,data:{error:'Collaborateur planning introuvable.'}};
  if(!canManageStore(user,row.store_id))return forbidden('Pointage équipe réservé au Responsable magasin ou à la Direction.');
  const b=await body(req);return{status:200,data:setAttendance({lineId:p.lineId,user,status:b.status,replacementName:b.replacementName||'',note:b.note||''})}
 }
 if(path==='/api/staffing/policy'&&(req.method==='PUT'||req.method==='PATCH')){
  if(!director(user))return forbidden('Politique équipe réservée à la Direction.');
  const b=await body(req);return{status:200,data:updateStaffingPolicy({user,requiredManagers:b.requiredManagers,requiredCashiers:b.requiredCashiers,requiredFloor:b.requiredFloor})}
 }

 p=route(path,'/api/stores/:storeId/cash-opening');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  const businessDate=url.searchParams.get('date')||todayISO();
  return{status:200,data:await ensureCashOpening(p.storeId,businessDate,{force:url.searchParams.get('force')==='1'})}
 }
 p=route(path,'/api/stores/:storeId/cash-opening/sync');
 if(p&&req.method==='POST'){
  if(!canManageStore(user,p.storeId))return forbidden('Préparation caisses réservée au Responsable magasin ou à la Direction.');
  const businessDate=url.searchParams.get('date')||todayISO();
  return{status:200,data:await ensureCashOpening(p.storeId,businessDate,{force:true})}
 }
 p=route(path,'/api/cash-opening/lines/:lineId/check');
 if(p&&req.method==='POST'){
  const row=db.prepare(`SELECT o.store_id FROM cash_opening_lines l JOIN cash_openings o ON o.id=l.opening_id WHERE l.id=?`).get(p.lineId);
  if(!row)return{status:404,data:{error:"Caisse d'ouverture introuvable."}};
  if(!canManageStore(user,row.store_id))return forbidden('Contrôle des caisses réservé au Responsable magasin ou à la Direction.');
  const b=await body(req),result=checkCashOpeningLine({lineId:p.lineId,user,cashierName:b.cashierName,declaredFloat:b.declaredFloat,posOk:b.posOk===true,tpeOk:b.tpeOk===true,printerOk:b.printerOk===true,shiftOpened:b.shiftOpened===true,note:b.note||''});
  return{status:result.issues?.length?409:200,data:result}
 }
 if(path==='/api/cash-opening/policy'&&(req.method==='PUT'||req.method==='PATCH')){
  if(!director(user))return forbidden('Politique caisses réservée à la Direction.');
  const b=await body(req);return{status:200,data:updateCashOpeningPolicy({user,floatTolerance:b.floatTolerance})}
 }
 return null
}

import { canAccessStore,canManageStore } from './permissions.mjs';
import { todayISO } from '../db.mjs';
import { staffingConfig,staffingSummary,syncStaffingDay,setAttendance,updateStaffingPolicy } from './staffing.mjs';
import { getStaffingSnapshot } from './dynamics-staffing.mjs';
import { coldChainConfig,coldChainSummary,ensureColdChainDay,checkColdChainLine,recheckColdChainLine,updateColdProfile } from './cold-chain.mjs';
import { cashOpeningConfig,cashOpening,cashOpeningSummary,syncCashOpening,checkCashOpeningLine,updateCashOpeningPolicy } from './cash-opening.mjs';
import { getCashOpeningSnapshot } from './dynamics-cash-opening.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('Requête JSON invalide.'),{status:400,code:'REQUEST_JSON_INVALID'})}}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function requireManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Gestion réservée au Responsable magasin ou à la Direction.'),{status:403})}
function requireDirector(user){if(user?.role!=='ops_director')throw Object.assign(new Error('Configuration réseau réservée à la Direction.'),{status:403})}
function errView(error,source){return{ok:false,source,code:error?.code||'SOURCE_UNAVAILABLE',error:error?.message||String(error),details:error?.details||null}}

async function staffingView(storeId,businessDate,{force=false}={}){
 let sync={ok:true,source:'STOREOPS_SHIFTS'};
 try{
  const snapshot=await getStaffingSnapshot(storeId,businessDate);
  const day=syncStaffingDay({storeId,businessDate,snapshot});
  sync={ok:true,source:snapshot.source||'STOREOPS_SHIFTS',sourceKey:snapshot.sourceKey||null,lines:snapshot.lines?.length||0};
  return{day,summary:staffingSummary(storeId,businessDate),sync}
 }catch(error){
  sync=errView(error,'WORKFORCE');
  return{day:null,summary:staffingSummary(storeId,businessDate),sync,emptyReason:error?.message||'Planning indisponible.'}
 }
}
async function cashOpeningView(storeId,businessDate,{required=false}={}){
 try{
  const snapshot=await getCashOpeningSnapshot(storeId,businessDate),opening=syncCashOpening({storeId,businessDate,snapshot});
  return{opening,summary:cashOpeningSummary(storeId,businessDate),sync:{ok:true,source:snapshot.source||'STOREOPS',sourceKey:snapshot.sourceKey||null,lines:snapshot.lines?.length||0}}
 }catch(error){
  if(required)throw error;
  return{opening:cashOpening(storeId,businessDate),summary:cashOpeningSummary(storeId,businessDate),sync:errView(error,'CASH_OPENING'),emptyReason:error?.message||'Configuration caisses indisponible.'}
 }
}

export async function handleOpeningOperationsApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/staffing/config'&&req.method==='GET')return{status:200,data:staffingConfig()};
 if(path==='/api/staffing/policy'&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateStaffingPolicy({user,requiredManagers:b.requiredManagers,requiredCashiers:b.requiredCashiers,requiredFloor:b.requiredFloor})}}
 p=route(path,'/api/stores/:storeId/staffing');
 if(p&&req.method==='GET'){requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();return{status:200,data:await staffingView(p.storeId,businessDate)}}
 p=route(path,'/api/staffing/lines/:lineId/attendance');
 if(p&&req.method==='POST'){const b=await body(req);const result=setAttendance({lineId:p.lineId,user,status:b.status,replacementName:b.replacementName||'',note:b.note||''});requireManage(user,result.day.store_id);return{status:200,data:result}}

 if(path==='/api/cold-chain/config'&&req.method==='GET')return{status:200,data:coldChainConfig()};
 p=route(path,'/api/stores/:storeId/cold-chain');
 if(p&&req.method==='GET'){requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO(),day=ensureColdChainDay(p.storeId,businessDate);return{status:200,data:{day,summary:coldChainSummary(p.storeId,businessDate),sync:{ok:true,source:'STOREOPS_TERRAIN'}}}}
 p=route(path,'/api/cold-chain/lines/:lineId/check');
 if(p&&req.method==='POST'){const b=await body(req),result=checkColdChainLine({lineId:p.lineId,user,temperature:b.temperature,doorOk:b.doorOk===true,note:b.note||''});requireManage(user,result.day.store_id);return{status:200,data:result}}
 p=route(path,'/api/cold-chain/lines/:lineId/recheck');
 if(p&&req.method==='POST'){const b=await body(req),result=recheckColdChainLine({lineId:p.lineId,user,temperature:b.temperature,doorOk:b.doorOk===true,maintenanceSignaled:b.maintenanceSignaled===true,note:b.note||''});requireManage(user,result.day.store_id);return{status:200,data:result}}
 p=route(path,'/api/cold-chain/profiles/:code');
 if(p&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateColdProfile({code:p.code,user,tempMin:b.tempMin,tempMax:b.tempMax})}}

 if(path==='/api/cash-opening/config'&&req.method==='GET')return{status:200,data:cashOpeningConfig()};
 p=route(path,'/api/stores/:storeId/cash-opening');
 if(p&&req.method==='GET'){requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();return{status:200,data:await cashOpeningView(p.storeId,businessDate)}}
 p=route(path,'/api/stores/:storeId/cash-opening/sync');
 if(p&&req.method==='POST'){requireStore(user,p.storeId);requireManage(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();return{status:200,data:await cashOpeningView(p.storeId,businessDate,{required:true})}}
 p=route(path,'/api/cash-opening/lines/:lineId/check');
 if(p&&req.method==='POST'){const b=await body(req),result=checkCashOpeningLine({lineId:p.lineId,user,cashierName:b.cashierName,declaredFloat:b.declaredFloat,posOk:b.posOk===true,tpeOk:b.tpeOk===true,printerOk:b.printerOk===true,shiftOpened:b.shiftOpened===true,note:b.note||''});requireManage(user,result.opening.store_id);return{status:200,data:result}}
 if(path==='/api/cash-opening/policy'&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateCashOpeningPolicy({user,floatTolerance:b.floatTolerance})}}
 return null
}

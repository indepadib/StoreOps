import { db,todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { workforceConfig,listEmployees,createEmployee,endEmployeeContract,listShifts,createShift,setShiftStatus,listObjectives,createObjective } from './workforce.mjs';
import { handleProcessStudioApi } from './process-studio-api.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
const forbidden=(message='Accès interdit')=>({status:403,data:{error:message}});
function ownStore(user,storeId){return canAccessStore(user,storeId)}
function manageStore(user,storeId){return canManageStore(user,storeId)}
function storeForEmployee(id){return db.prepare(`SELECT store_id FROM employees WHERE id=?`).get(id)?.store_id||null}
function storeForShift(id){return db.prepare(`SELECT store_id FROM work_shifts WHERE id=?`).get(id)?.store_id||null}

export async function handleWorkforceApi({req,url,user}){
 const processResponse=await handleProcessStudioApi({req,url,user});if(processResponse)return processResponse;
 const path=url.pathname;
 if(path==='/api/workforce/config'&&req.method==='GET')return{status:200,data:workforceConfig()};
 let p=route(path,'/api/stores/:storeId/workforce');
 if(p&&req.method==='GET'){
  if(!ownStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  const date=url.searchParams.get('date')||todayISO(),includeEnded=url.searchParams.get('includeEnded')==='1';
  const employees=listEmployees(p.storeId,{includeEnded}),shifts=listShifts(p.storeId,{date}),objectives=listObjectives(p.storeId,{activeOn:date});
  return{status:200,data:{storeId:p.storeId,date,summary:{activeEmployees:employees.filter(x=>x.status==='ACTIVE').length,noticeEmployees:employees.filter(x=>x.status==='NOTICE').length,shifts:shifts.filter(x=>x.status!=='CANCELLED').length,publishedShifts:shifts.filter(x=>x.status==='PUBLISHED').length,activeObjectives:objectives.filter(x=>x.status==='ACTIVE').length},employees,shifts,objectives,config:workforceConfig()}}
 }
 p=route(path,'/api/stores/:storeId/employees');
 if(p&&req.method==='POST'){
  if(!manageStore(user,p.storeId))return forbidden('Gestion équipe réservée au Responsable magasin ou à la Direction.');
  const b=await body(req);return{status:201,data:createEmployee({storeId:p.storeId,user,employeeCode:b.employeeCode,firstName:b.firstName,lastName:b.lastName,roleCode:b.roleCode,contractType:b.contractType,contractStart:b.contractStart,contractEnd:b.contractEnd,email:b.email,phone:b.phone})}
 }
 p=route(path,'/api/employees/:employeeId/end');
 if(p&&req.method==='POST'){
  const storeId=storeForEmployee(p.employeeId);if(!storeId)return{status:404,data:{error:'Employé introuvable.'}};if(!manageStore(user,storeId))return forbidden();
  const b=await body(req);return{status:200,data:endEmployeeContract({employeeId:p.employeeId,user,endDate:b.endDate||todayISO(),reason:b.reason||''})}
 }
 p=route(path,'/api/stores/:storeId/shifts');
 if(p&&req.method==='POST'){
  if(!manageStore(user,p.storeId))return forbidden('Gestion planning réservée au Responsable magasin ou à la Direction.');
  const b=await body(req);return{status:201,data:createShift({storeId:p.storeId,user,employeeId:b.employeeId,shiftDate:b.shiftDate,startTime:b.startTime,endTime:b.endTime,roleCode:b.roleCode,note:b.note||''})}
 }
 p=route(path,'/api/shifts/:shiftId/status');
 if(p&&req.method==='POST'){
  const storeId=storeForShift(p.shiftId);if(!storeId)return{status:404,data:{error:'Shift introuvable.'}};if(!manageStore(user,storeId))return forbidden();
  const b=await body(req);return{status:200,data:setShiftStatus({shiftId:p.shiftId,user,status:b.status})}
 }
 p=route(path,'/api/stores/:storeId/objectives');
 if(p&&req.method==='POST'){
  if(!manageStore(user,p.storeId))return forbidden('Gestion objectifs réservée au Responsable magasin ou à la Direction.');
  const b=await body(req);return{status:201,data:createObjective({storeId:p.storeId,user,employeeId:b.employeeId||null,roleCode:b.roleCode||null,title:b.title,metricCode:b.metricCode||null,targetValue:b.targetValue,unit:b.unit||null,periodStart:b.periodStart,periodEnd:b.periodEnd,note:b.note||''})}
 }
 return null
}

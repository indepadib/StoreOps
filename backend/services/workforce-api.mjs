import { db,todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { workforceConfig,listEmployees,createEmployee,endEmployeeContract,listShifts,createShift,setShiftStatus,listObjectives,createObjective } from './workforce.mjs';
import { handleRuntimeBootstrapApi } from './runtime-bootstrap-api.mjs';
import { handleProcessStudioApi } from './process-studio-api.mjs';
import { handleReplenishmentPolicyApi } from './replenishment-policy-api.mjs';
import { handleReplenishmentRequestApi } from './replenishment-request-api.mjs';
import { handleStoreSettingsApi } from './store-settings-api.mjs';
import { handlePriceHistoryApi } from './price-history-api.mjs';
import { handleAccessManagementApi } from './access-management-api.mjs';
import { deactivateAccountsForEmployee } from './access-management.mjs';
import { handleDevelopmentApi } from './development-api.mjs';
import { handleIntegrationRegistryApi } from './integration-registry-api.mjs';
import { handleTenantProfileApi } from './tenant-profile-api.mjs';
import { handleManagerFastApi } from './manager-fast-api.mjs';
import { staffingConfig,staffingDay,staffingSummary,syncStaffingDay,setAttendance,markStaffingOpened,updateStaffingPolicy } from './staffing.mjs';
import { getStaffingSnapshot } from './dynamics-staffing.mjs';
import { cashOpeningConfig,cashOpening,cashOpeningSummary,syncCashOpening,checkCashOpeningLine,markCashOpeningOpened,updateCashOpeningPolicy } from './cash-opening.mjs';
import { getCashOpeningSnapshot } from './dynamics-cash-opening.mjs';
import { buildPriceCheckContext,executePriceCheck,listPriceChecks } from './price-check.mjs';
import { createIncident,addAction,addEvidence,completeAction,resolveIncident } from './incidents.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
const forbidden=(message='Accès interdit')=>({status:403,data:{error:message}});
function ownStore(user,storeId){return canAccessStore(user,storeId)}
function manageStore(user,storeId){return canManageStore(user,storeId)}
function storeForEmployee(id){return db.prepare(`SELECT store_id FROM employees WHERE id=?`).get(id)?.store_id||null}
function storeForShift(id){return db.prepare(`SELECT store_id FROM work_shifts WHERE id=?`).get(id)?.store_id||null}

export async function handleWorkforceApi({req,url,user}){
 const bootstrapResponse=await handleRuntimeBootstrapApi({req,url,user});if(bootstrapResponse)return bootstrapResponse;
 const managerFastResponse=await handleManagerFastApi({req,url,user});if(managerFastResponse)return managerFastResponse;
 const developmentResponse=await handleDevelopmentApi({req,url,user});if(developmentResponse)return developmentResponse;
 const integrationResponse=await handleIntegrationRegistryApi({req,url,user});if(integrationResponse)return integrationResponse;
 const tenantResponse=await handleTenantProfileApi({req,url,user});if(tenantResponse)return tenantResponse;
 const processResponse=await handleProcessStudioApi({req,url,user});if(processResponse)return processResponse;
 const replenishmentResponse=await handleReplenishmentPolicyApi({req,url,user});if(replenishmentResponse)return replenishmentResponse;
 const requestResponse=await handleReplenishmentRequestApi({req,url,user});if(requestResponse)return requestResponse;
 const storeSettingsResponse=await handleStoreSettingsApi({req,url,user});if(storeSettingsResponse)return storeSettingsResponse;
 const priceHistoryResponse=await handlePriceHistoryApi({req,url,user});if(priceHistoryResponse)return priceHistoryResponse;
 const accessResponse=await handleAccessManagementApi({req,url,user});if(accessResponse)return accessResponse;
 const path=url.pathname;
 if(path==='/api/staffing/config'&&req.method==='GET')return{status:200,data:staffingConfig()};
 if(path==='/api/staffing/policy'&&(req.method==='PUT'||req.method==='PATCH')){
  if(!['ops_director','platform_admin'].includes(String(user.role||'')))return forbidden('Réservé à la Direction.');
  const b=await body(req);return{status:200,data:updateStaffingPolicy({user,requiredManagers:b.requiredManagers,requiredCashiers:b.requiredCashiers,requiredFloor:b.requiredFloor})}
 }
 let p=route(path,'/api/stores/:storeId/staffing');
 if(p&&req.method==='GET'){
  if(!ownStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  const businessDate=url.searchParams.get('date')||todayISO();let day=staffingDay(p.storeId,businessDate),sync={ok:true,source:day?'STOREOPS_CACHE':null};
  if(!day){try{const snapshot=await getStaffingSnapshot(p.storeId,businessDate);day=syncStaffingDay({storeId:p.storeId,businessDate,snapshot});sync={ok:true,source:snapshot.source||'STOREOPS'}}catch(error){sync={ok:false,code:error?.code||'STAFFING_SYNC_FAILED',error:error?.message||String(error)}}}
  return{status:200,data:{day,summary:staffingSummary(p.storeId,businessDate),sync}}
 }
 p=route(path,'/api/stores/:storeId/staffing/sync');
 if(p&&req.method==='POST'){
  if(!manageStore(user,p.storeId))return forbidden('Gestion équipe réservée au Responsable magasin ou à la Direction.');
  const businessDate=url.searchParams.get('date')||todayISO(),snapshot=await getStaffingSnapshot(p.storeId,businessDate),day=syncStaffingDay({storeId:p.storeId,businessDate,snapshot});
  return{status:200,data:{day,summary:staffingSummary(p.storeId,businessDate),sync:{ok:true,source:snapshot.source||'STOREOPS'}}}
 }
 p=route(path,'/api/staffing/lines/:lineId/attendance');
 if(p&&req.method==='POST'){
  const row=db.prepare(`SELECT d.store_id FROM staffing_lines l JOIN staffing_days d ON d.id=l.staffing_day_id WHERE l.id=?`).get(p.lineId);if(!row)return{status:404,data:{error:'Collaborateur planning introuvable.'}};
  if(!manageStore(user,row.store_id))return forbidden('Pointage réservé au Responsable magasin ou à la Direction.');
  const b=await body(req);return{status:200,data:setAttendance({lineId:p.lineId,user,status:b.status,replacementName:b.replacementName||'',note:b.note||''})}
 }
 p=route(path,'/api/stores/:storeId/staffing/open');
 if(p&&req.method==='POST'){if(!manageStore(user,p.storeId))return forbidden();return{status:200,data:markStaffingOpened({storeId:p.storeId,businessDate:url.searchParams.get('date')||todayISO(),user})}}

 if(path==='/api/cash-opening/config'&&req.method==='GET')return{status:200,data:cashOpeningConfig()};
 if(path==='/api/cash-opening/policy'&&(req.method==='PUT'||req.method==='PATCH')){
  if(!['ops_director','platform_admin'].includes(String(user.role||'')))return forbidden('Réservé à la Direction.');
  const b=await body(req);return{status:200,data:updateCashOpeningPolicy({user,floatTolerance:b.floatTolerance})}
 }
 p=route(path,'/api/stores/:storeId/cash-opening');
 if(p&&req.method==='GET'){
  if(!ownStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  const businessDate=url.searchParams.get('date')||todayISO();let opening=cashOpening(p.storeId,businessDate),sync={ok:true,source:opening?'STOREOPS_CACHE':null};
  if(!opening){try{const snapshot=await getCashOpeningSnapshot(p.storeId,businessDate);opening=syncCashOpening({storeId:p.storeId,businessDate,snapshot});sync={ok:true,source:snapshot.source||'STOREOPS'}}catch(error){sync={ok:false,code:error?.code||'CASH_OPENING_SYNC_FAILED',error:error?.message||String(error)}}}
  return{status:200,data:{opening,summary:cashOpeningSummary(p.storeId,businessDate),sync}}
 }
 p=route(path,'/api/stores/:storeId/cash-opening/sync');
 if(p&&req.method==='POST'){
  if(!manageStore(user,p.storeId))return forbidden('Préparation caisses réservée au Responsable magasin ou à la Direction.');
  const businessDate=url.searchParams.get('date')||todayISO(),snapshot=await getCashOpeningSnapshot(p.storeId,businessDate),opening=syncCashOpening({storeId:p.storeId,businessDate,snapshot});
  return{status:200,data:{opening,summary:cashOpeningSummary(p.storeId,businessDate),sync:{ok:true,source:snapshot.source||'STOREOPS'}}}
 }
 p=route(path,'/api/cash-opening/lines/:lineId/check');
 if(p&&req.method==='POST'){
  const row=db.prepare(`SELECT o.store_id FROM cash_opening_lines l JOIN cash_openings o ON o.id=l.opening_id WHERE l.id=?`).get(p.lineId);if(!row)return{status:404,data:{error:'Caisse d’ouverture introuvable.'}};
  if(!manageStore(user,row.store_id))return forbidden('Préparation caisses réservée au Responsable magasin ou à la Direction.');
  const b=await body(req),result=checkCashOpeningLine({lineId:p.lineId,user,cashierName:b.cashierName,declaredFloat:b.declaredFloat,posOk:b.posOk===true,tpeOk:b.tpeOk===true,printerOk:b.printerOk===true,shiftOpened:b.shiftOpened===true,note:b.note||''});return{status:result.issues?.length?409:200,data:result}
 }
 p=route(path,'/api/stores/:storeId/cash-opening/open');
 if(p&&req.method==='POST'){if(!manageStore(user,p.storeId))return forbidden();return{status:200,data:markCashOpeningOpened({storeId:p.storeId,businessDate:url.searchParams.get('date')||todayISO(),user})}}

 p=route(path,'/api/stores/:storeId/price-check/context/:identifier');
 if(p&&req.method==='GET'){
  if(!ownStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  return{status:200,data:await buildPriceCheckContext({storeId:p.storeId,identifier:p.identifier,businessDate:url.searchParams.get('date')||todayISO()})}
 }
 p=route(path,'/api/stores/:storeId/price-checks');
 if(p&&req.method==='GET'){
  if(!ownStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  return{status:200,data:{items:listPriceChecks(p.storeId,url.searchParams.get('date')||todayISO(),url.searchParams.get('limit')||50)}}
 }
 p=route(path,'/api/stores/:storeId/price-check');
 if(p&&req.method==='POST'){
  if(!manageStore(user,p.storeId))return forbidden('Contrôle prix réservé au Responsable magasin ou à la Direction.');
  const b=await body(req),identifier=String(b.identifier||b.ean||'').trim();
  const result=await executePriceCheck({storeId:p.storeId,ean:identifier,businessDate:b.businessDate||todayISO(),observedPrice:b.observedPrice,signageOk:b.signageOk===true,executionOk:b.executionOk===true,user,tolerance:b.tolerance});
  if(result.check.status==='MISMATCH'){
   const inc=createIncident({storeId:p.storeId,user,title:`Écart prix/promo · ${result.context.product.name}`,description:`${result.context.product.productNumber||result.context.ean} · ${result.check.issues.join(' · ')}`,category:'PRICE_PROMO',criticality:'HIGH',blockingLevel:'NONE',sourceType:'PRICE_CHECK',sourceId:result.check.id,requiresEvidence:true});
   addAction({incidentId:inc.id,user,title:'Corriger prix / signalétique puis effectuer un nouveau contrôle',note:`Prix attendu ${result.check.expectedPrice??'—'} DH`});
   return{status:409,data:{error:'Écart prix/promo enregistré.',code:'PRICE_CHECK_MISMATCH',details:result.check.issues,check:result.check}}
  }
  let incidentResolved=null;
  const open=result.context.openIncident;
  if(open){
   if(b.evidenceDataUrl)addEvidence({incidentId:open.id,user,dataUrl:b.evidenceDataUrl,fileName:b.evidenceFileName||'preuve-prix.jpg',caption:b.evidenceCaption||'Preuve après correction prix/promo'});
   const actions=db.prepare(`SELECT id FROM incident_actions WHERE incident_id=? AND status='OPEN'`).all(open.id);
   for(const action of actions)completeAction({incidentId:open.id,actionId:action.id,user,note:'Recontrôle prix conforme.'});
   incidentResolved=resolveIncident({incidentId:open.id,user,resolutionNote:'Correction validée par un nouveau contrôle prix conforme.'})
  }
  return{status:200,data:{...result,incidentResolved}}
 }

  if(path==='/api/workforce/config'&&req.method==='GET')return{status:200,data:workforceConfig()};
 p=route(path,'/api/stores/:storeId/workforce');
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
  const b=await body(req),employee=endEmployeeContract({employeeId:p.employeeId,user,endDate:b.endDate||todayISO(),reason:b.reason||''}),access=deactivateAccountsForEmployee({actor:user,employeeId:p.employeeId,reason:'CONTRACT_ENDED'});return{status:200,data:{...employee,accessDeprovisioning:access}}
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

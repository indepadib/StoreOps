import { db,todayISO } from '../db.mjs';
import { canAccessStore,canManageStore } from './permissions.mjs';
import { getProductByEan,postLossToDynamics,getDynamicsDiagnostics,probeDataEntity } from './dynamics.mjs';
import { getStoreProductByEan,stockIntegrationConfig } from './dynamics-stock.mjs';
import { getSalesPriceAgreementsByItem } from './dynamics-price.mjs';
import { getProductPricing } from './dynamics-promotion.mjs';
import { buildPriceCheckContext,executePriceCheck,listPriceChecks } from './price-check.mjs';
import { createIncident,addAction } from './incidents.mjs';
import { getCashOpeningSnapshot } from './dynamics-cash-opening.mjs';
import { getStaffingSnapshot } from './dynamics-staffing.mjs';
import { lossConfig,listLossRecords,lossSummary,lossRecord,createLossRecord,approveLossRecord,ensureLossPostable,markLossPosted,updateLossPolicy } from './loss.mjs';
import { cashOpeningConfig,cashOpening,cashOpeningSummary,syncCashOpening,checkCashOpeningLine,updateCashOpeningPolicy } from './cash-opening.mjs';
import { coldChainConfig,coldChainDay,coldChainSummary,ensureColdChainDay,checkColdChainLine,recheckColdChainLine,updateColdProfile } from './cold-chain.mjs';
import { staffingConfig,staffingDay,staffingSummary,syncStaffingDay,setAttendance,updateStaffingPolicy } from './staffing.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>8e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',reject)})}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function requireManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou Directeur d’exploitation'),{status:403})}
function requireDirector(user){if(user.role!=='ops_director')throw Object.assign(new Error('Réservé au Directeur d’exploitation'),{status:403})}

export async function handleLossApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/dynamics/diagnostics'&&req.method==='GET'){requireDirector(user);return{status:200,data:await getDynamicsDiagnostics({forceToken:url.searchParams.get('force')==='1'})}}
 if(path==='/api/dynamics/probe'&&req.method==='GET'){requireDirector(user);const entity=url.searchParams.get('entity')||'';return{status:200,data:await probeDataEntity(entity,{top:url.searchParams.get('top')||1,filter:url.searchParams.get('filter')||''})}}
 if(path==='/api/dynamics/stock/config'&&req.method==='GET'){requireDirector(user);return{status:200,data:stockIntegrationConfig()}}
 if(path==='/api/dynamics/sales-price-agreements'&&req.method==='GET'){requireDirector(user);const item=url.searchParams.get('item')||'';return{status:200,data:await getSalesPriceAgreementsByItem(item)}}
 if(path==='/api/dynamics/product-price'&&req.method==='GET'){requireDirector(user);const item=url.searchParams.get('item')||'',businessDate=url.searchParams.get('date')||null,priceGroup=url.searchParams.get('priceGroup')||'Franprix';return{status:200,data:await getProductPricing(item,{businessDate,priceGroup})}}
 p=route(path,'/api/stores/:storeId/products/:ean');if(p&&req.method==='GET'){requireStore(user,p.storeId);const product=await getStoreProductByEan(p.storeId,p.ean);return product?{status:200,data:product}:{status:404,data:{error:'Article introuvable Dynamics'}}}

 // V1.19 — scan EAN, resolve Dynamics price/promotion, execute shelf check.
 p=route(path,'/api/stores/:storeId/price-check/context/:ean');if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:await buildPriceCheckContext({storeId:p.storeId,ean:p.ean,businessDate:url.searchParams.get('date')||todayISO()})}}
 p=route(path,'/api/stores/:storeId/price-checks');if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:{items:listPriceChecks(p.storeId,url.searchParams.get('date')||todayISO(),url.searchParams.get('limit')||50)}}}
 p=route(path,'/api/stores/:storeId/price-check');if(p&&req.method==='POST'){
  requireStore(user,p.storeId);requireManage(user,p.storeId);const b=await body(req),businessDate=b.businessDate||todayISO();
  const result=await executePriceCheck({storeId:p.storeId,ean:b.ean,businessDate,observedPrice:b.observedPrice,signageOk:b.signageOk===true,executionOk:b.executionOk===true,user,tolerance:b.tolerance??0.01});
  if(result.check.status==='MISMATCH'){
   const inc=createIncident({storeId:p.storeId,user,title:`Écart prix/promo · ${result.context.product.name}`,description:result.check.issues.join(' · '),category:'PRICE_PROMO',criticality:'HIGH',blockingLevel:'NONE',sourceType:'PRICE_CHECK',sourceId:result.check.id,assignedTo:user.role==='store_manager'?user.id:null,requiresEvidence:true});
   addAction({incidentId:inc.id,user,title:'Corriger prix / signalétique puis effectuer un nouveau scan de contrôle',note:`EAN ${result.context.ean} · prix Dynamics ${result.check.expectedPrice??'—'}`,assignedTo:user.role==='store_manager'?user.id:null});result.incident=inc;
  }
  return{status:result.check.status==='MISMATCH'?409:200,data:result};
 }

 if(path==='/api/staffing/config'&&req.method==='GET')return{status:200,data:staffingConfig()};
 if(path==='/api/staffing/policy'&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateStaffingPolicy({user,requiredManagers:b.requiredManagers,requiredCashiers:b.requiredCashiers,requiredFloor:b.requiredFloor})}}
 p=route(path,'/api/stores/:storeId/staffing');if(p&&req.method==='GET'){requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();let sync={ok:true};try{const snapshot=await getStaffingSnapshot(p.storeId,businessDate);sync={ok:true,day:syncStaffingDay({storeId:p.storeId,businessDate,snapshot})}}catch(e){sync={ok:false,error:e.message,code:e.code||'STAFFING_SYNC_FAILED'}}return{status:200,data:{summary:staffingSummary(p.storeId,businessDate),day:staffingDay(p.storeId,businessDate),sync}}}
 p=route(path,'/api/stores/:storeId/staffing/sync');if(p&&req.method==='POST'){requireStore(user,p.storeId);requireManage(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO(),snapshot=await getStaffingSnapshot(p.storeId,businessDate),day=syncStaffingDay({storeId:p.storeId,businessDate,snapshot});return{status:200,data:{summary:staffingSummary(p.storeId,businessDate),day,sync:{ok:true,source:snapshot.source||'PLANNING'}}}}
 p=route(path,'/api/staffing/lines/:lineId/attendance');if(p&&req.method==='POST'){const row=db.prepare(`SELECT d.store_id FROM staffing_lines l JOIN staffing_days d ON d.id=l.staffing_day_id WHERE l.id=?`).get(p.lineId);if(!row)throw Object.assign(new Error('Collaborateur planning introuvable.'),{status:404});requireStore(user,row.store_id);requireManage(user,row.store_id);const b=await body(req);return{status:200,data:setAttendance({lineId:p.lineId,user,status:b.status,replacementName:b.replacementName||'',note:b.note||''})}}

 if(path==='/api/cold-chain/config'&&req.method==='GET')return{status:200,data:coldChainConfig()};
 p=route(path,'/api/cold-chain/profiles/:code');if(p&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateColdProfile({code:p.code,user,tempMin:b.tempMin,tempMax:b.tempMax})}}
 p=route(path,'/api/stores/:storeId/cold-chain');if(p&&req.method==='GET'){requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();ensureColdChainDay(p.storeId,businessDate);return{status:200,data:{summary:coldChainSummary(p.storeId,businessDate),day:coldChainDay(p.storeId,businessDate)}}}
 p=route(path,'/api/cold-chain/lines/:lineId/check');if(p&&req.method==='POST'){const row=db.prepare(`SELECT d.store_id FROM cold_chain_lines l JOIN cold_chain_days d ON d.id=l.cold_day_id WHERE l.id=?`).get(p.lineId);if(!row)throw Object.assign(new Error('Zone froid introuvable.'),{status:404});requireStore(user,row.store_id);requireManage(user,row.store_id);const b=await body(req),result=checkColdChainLine({lineId:p.lineId,user,temperature:b.temperature,doorOk:b.doorOk===true,note:b.note||''});return{status:result.issues.length?409:200,data:result}}
 p=route(path,'/api/cold-chain/lines/:lineId/recheck');if(p&&req.method==='POST'){const row=db.prepare(`SELECT d.store_id FROM cold_chain_lines l JOIN cold_chain_days d ON d.id=l.cold_day_id WHERE l.id=?`).get(p.lineId);if(!row)throw Object.assign(new Error('Zone froid introuvable.'),{status:404});requireStore(user,row.store_id);requireManage(user,row.store_id);const b=await body(req),result=recheckColdChainLine({lineId:p.lineId,user,temperature:b.temperature,doorOk:b.doorOk===true,maintenanceSignaled:b.maintenanceSignaled===true,note:b.note||''});return{status:result.issues.length?409:200,data:result}}

 if(path==='/api/cash-opening/config'&&req.method==='GET')return{status:200,data:cashOpeningConfig()};
 if(path==='/api/cash-opening/policy'&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateCashOpeningPolicy({user,floatTolerance:b.floatTolerance})}}
 p=route(path,'/api/stores/:storeId/cash-opening');if(p&&req.method==='GET'){requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();let sync={ok:true};try{const snapshot=await getCashOpeningSnapshot(p.storeId,businessDate);sync={ok:true,opening:syncCashOpening({storeId:p.storeId,businessDate,snapshot})}}catch(e){sync={ok:false,error:e.message,code:e.code||'CASH_OPENING_SYNC_FAILED'}}return{status:200,data:{summary:cashOpeningSummary(p.storeId,businessDate),opening:cashOpening(p.storeId,businessDate),sync}}}
 p=route(path,'/api/stores/:storeId/cash-opening/sync');if(p&&req.method==='POST'){requireStore(user,p.storeId);requireManage(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO(),snapshot=await getCashOpeningSnapshot(p.storeId,businessDate),opening=syncCashOpening({storeId:p.storeId,businessDate,snapshot});return{status:200,data:{summary:cashOpeningSummary(p.storeId,businessDate),opening,sync:{ok:true,source:snapshot.source||'D365'}}}}
 p=route(path,'/api/cash-opening/lines/:lineId/check');if(p&&req.method==='POST'){const row=db.prepare(`SELECT o.store_id FROM cash_opening_lines l JOIN cash_openings o ON o.id=l.opening_id WHERE l.id=?`).get(p.lineId);if(!row)throw Object.assign(new Error('Caisse d’ouverture introuvable.'),{status:404});requireStore(user,row.store_id);requireManage(user,row.store_id);const b=await body(req);const result=checkCashOpeningLine({lineId:p.lineId,user,cashierName:b.cashierName,declaredFloat:b.declaredFloat,posOk:b.posOk===true,tpeOk:b.tpeOk===true,printerOk:b.printerOk===true,shiftOpened:b.shiftOpened===true,note:b.note||''});return{status:result.issues.length?409:200,data:result}}

 if(path==='/api/loss/config'&&req.method==='GET')return{status:200,data:lossConfig()};
 if(path==='/api/loss/policy'&&(req.method==='PUT'||req.method==='PATCH')){requireDirector(user);const b=await body(req);return{status:200,data:updateLossPolicy({user,evidenceThreshold:b.evidenceThreshold,approvalThreshold:b.approvalThreshold})}}
 p=route(path,'/api/stores/:storeId/losses');if(p){requireStore(user,p.storeId);const businessDate=url.searchParams.get('date')||todayISO();if(req.method==='GET'){const status=(url.searchParams.get('status')||'ALL').toUpperCase();return{status:200,data:{summary:lossSummary(p.storeId,businessDate),items:listLossRecords(p.storeId,businessDate,status)}}}if(req.method==='POST'){requireManage(user,p.storeId);const b=await body(req),product=await getProductByEan(String(b.ean||'').trim());if(!product)throw Object.assign(new Error('Article introuvable Dynamics.'),{status:404});return{status:201,data:createLossRecord({storeId:p.storeId,businessDate,user,product,reasonCode:b.reasonCode,quantity:b.quantity,unit:b.unit,note:b.note,sourceType:b.sourceType||'MANUAL',sourceId:b.sourceId||null})}}}
 p=route(path,'/api/losses/:lossId');if(p&&req.method==='GET'){const row=lossRecord(p.lossId);if(!row)throw Object.assign(new Error('Perte introuvable.'),{status:404});requireStore(user,row.store_id);return{status:200,data:row}}
 p=route(path,'/api/losses/:lossId/approve');if(p&&req.method==='POST'){const row=lossRecord(p.lossId);if(!row)throw Object.assign(new Error('Perte introuvable.'),{status:404});requireStore(user,row.store_id);requireDirector(user);return{status:200,data:approveLossRecord({id:p.lossId,user})}}
 p=route(path,'/api/losses/:lossId/post');if(p&&req.method==='POST'){const row=lossRecord(p.lossId);if(!row)throw Object.assign(new Error('Perte introuvable.'),{status:404});requireStore(user,row.store_id);requireManage(user,row.store_id);const postable=ensureLossPostable(p.lossId);const dynamics=await postLossToDynamics(postable.id,{storeId:postable.store_id,businessDate:postable.business_date,ean:postable.ean,productNumber:postable.product_number,quantity:-Math.abs(Number(postable.quantity)),unit:postable.unit,reasonCode:postable.reason_code,sourceType:postable.source_type,sourceId:postable.source_id});return{status:200,data:{dynamics,record:markLossPosted({id:p.lossId,user})}}}
 return null;
}

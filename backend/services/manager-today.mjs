import { db,ensureStoreDay,todayISO } from '../db.mjs';
import { processProgress } from './workflow.mjs';
import { incidentStats,listIncidents } from './incidents.mjs';
import { dlcSummary } from './dlc.mjs';
import { handoverStats,dayCycleMetrics } from './handover.mjs';
import { inventorySummary,listInventorySessions } from './inventory.mjs';
import { commercialSummary,listCommercialControls,syncCommercialControls } from './commercial.mjs';
import { cashClosingSummary } from './cash.mjs';
import { staffingSummary } from './staffing.mjs';
import { coldChainSummary } from './cold-chain.mjs';
import { cashOpeningSummary } from './cash-opening.mjs';
import { lossSummary,listLossRecords } from './loss.mjs';
import { getCommercialChanges } from './dynamics.mjs';
import { getStockSignals } from './stock-signals.mjs';
import { getBusinessPulse } from './business-pulse.mjs';

function receipts(storeId){
 return db.prepare(`SELECT * FROM receipts WHERE store_id=? ORDER BY eta`).all(storeId).map(r=>({...r,lines:db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=?`).all(r.id)}));
}
function qualityRows(storeId){return db.prepare(`SELECT q.*,u.name controlled_by_name FROM quality_controls q JOIN users u ON u.id=q.controlled_by WHERE q.store_id=? ORDER BY q.created_at DESC`).all(storeId)}
function dashboardSnapshot(storeId,businessDate){
 const day=ensureStoreDay(storeId,businessDate),opening=processProgress(day.id,'opening'),closing=processProgress(day.id,'closing'),commercial=commercialSummary(storeId,businessDate),cash=cashClosingSummary(storeId,businessDate),dlc=dlcSummary(storeId),handover=handoverStats(storeId,businessDate),inventory=inventorySummary(storeId),cycle=dayCycleMetrics(day),incidentSummary=incidentStats(storeId),quality=db.prepare(`SELECT COUNT(*) n,COALESCE(SUM(rejected_qty),0) rejected FROM quality_controls WHERE store_id=? AND date(created_at)=?`).get(storeId,businessDate);
 return{day,cycle,handover,inventory,commercial,commercialSync:{ok:true,deferred:true,source:'STOREOPS_LOCAL_SNAPSHOT'},cash,opening,closing,dlc,dlcAtRisk:dlc.expired+dlc.critical+dlc.alert+dlc.watch,incidents:incidentSummary.open,criticalIncidents:incidentSummary.critical,overdueIncidents:incidentSummary.overdue,escalatedIncidents:incidentSummary.escalated,watchIncidents:incidentSummary.watch,qualityControls:quality.n,qualityRejected:quality.rejected,health:Math.max(0,100-incidentSummary.open*6-incidentSummary.escalated*8-dlc.expired*8-dlc.critical*5-handover.blocking*6-commercial.mismatch*5-commercial.pending*2-opening.blockers*4),lastActions:db.prepare(`SELECT a.*,u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.store_id=? ORDER BY a.id DESC LIMIT 12`).all(storeId)};
}

export function managerTodaySnapshot(storeId,businessDate=todayISO()){
 const dashboard=dashboardSnapshot(storeId,businessDate),commercial={summary:commercialSummary(storeId,businessDate),items:listCommercialControls(storeId,businessDate),sync:{ok:true,deferred:true,source:'STOREOPS_LOCAL_SNAPSHOT'}},receiptRows=receipts(storeId),inventoryData={summary:inventorySummary(storeId),items:listInventorySessions(storeId,'ALL')},lossData={summary:lossSummary(storeId,businessDate),items:listLossRecords(storeId,businessDate,'ALL')},incidentData={stats:incidentStats(storeId),items:listIncidents(storeId,'OPEN')},staffData={summary:staffingSummary(storeId,businessDate)},coldData={summary:coldChainSummary(storeId,businessDate)},cashOpenData={summary:cashOpeningSummary(storeId,businessDate)},quality=qualityRows(storeId);
 return{dashboard,commercial,receiptRows,inventoryData,lossData,incidentData,staffData,coldData,cashOpenData,qualityRows:quality,stockData:{source:'DEFERRED',items:[],summary:{total:0,negative:0,outOfStock:0},deferred:true},meta:{mode:'LOCAL_FAST',businessDate,generatedAt:new Date().toISOString(),externalDeferred:['commercial','stock','sales'],requestCountCollapsed:10}};
}

async function refreshCommercial(storeId,businessDate){
 try{const changes=await getCommercialChanges(storeId,businessDate),sync=syncCommercialControls({storeId,businessDate,changes});return{ok:true,...sync}}
 catch(error){return{ok:false,error:error.message,code:error.code||'COMMERCIAL_SYNC_FAILED'}}
}
const settled=(r,fallback)=>r.status==='fulfilled'?r.value:{...fallback,error:r.reason?.message||String(r.reason||'Erreur inconnue')};

export async function managerTodaySignals(storeId,businessDate=todayISO()){
 const commercialPromise=refreshCommercial(storeId,businessDate),stockPromise=getStockSignals(storeId,{businessDate}),pulsePromise=getBusinessPulse(storeId,businessDate);
 const [commercialSyncResult,stockResult,pulseResult]=await Promise.allSettled([commercialPromise,stockPromise,pulsePromise]);
 const commercialSync=settled(commercialSyncResult,{ok:false,code:'COMMERCIAL_SYNC_FAILED'}),stockData=settled(stockResult,{source:'UNAVAILABLE',items:[],summary:{total:0,negative:0,outOfStock:0},unavailable:true}),pulse=settled(pulseResult,{status:'UNAVAILABLE',snapshot:null});
 const commercial={summary:commercialSummary(storeId,businessDate),items:listCommercialControls(storeId,businessDate),sync:commercialSync};
 return{commercial,stockData,pulse,meta:{mode:'EXTERNAL_ENRICHMENT',businessDate,generatedAt:new Date().toISOString(),commercialOk:commercialSync.ok===true,stockReady:!stockData.unavailable,pulseReady:pulse.status==='READY'}};
}

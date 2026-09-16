import { db,todayISO } from '../db.mjs';
import { processProgress } from './workflow.mjs';
import { handoverStats,dayCycleMetrics } from './handover.mjs';
import { inventorySummary } from './inventory.mjs';
import { commercialSummary } from './commercial.mjs';
import { cashClosingSummary } from './cash.mjs';
import { dlcSummary } from './dlc.mjs';
import { incidentStats } from './incidents.mjs';
import { staffingSummary } from './staffing.mjs';
import { coldChainSummary } from './cold-chain.mjs';
import { cashOpeningSummary } from './cash-opening.mjs';
import { lossSummary } from './loss.mjs';

const zeroProgress=()=>({total:0,done:0,percent:0,blockers:0,currentStep:null,currentTaskId:null,currentTitle:null});
const HOME_CACHE_MS=Math.max(500,Math.min(5000,Number(process.env.STOREOPS_MANAGER_HOME_CACHE_MS)||2500));
const homeCache=new Map();

function readStoreDay(storeId,businessDate){
 const row=db.prepare(`SELECT * FROM store_days WHERE store_id=? AND business_date=?`).get(storeId,businessDate);
 if(row)return{...row,persisted:true};
 return{id:null,store_id:storeId,business_date:businessDate,opening_status:'NOT_STARTED',closing_status:'NOT_STARTED',opening_owner_id:null,closing_owner_id:null,opening_started_at:null,closing_started_at:null,opened_at:null,closed_at:null,handover_reviewed_at:null,handover_reviewed_by:null,persisted:false};
}
function process(day,group){return day?.id?processProgress(day.id,group):zeroProgress()}
function receiptSummary(storeId,businessDate){
 const receipts=db.prepare(`SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN status!='POSTED' THEN 1 ELSE 0 END),0) active,COALESCE(SUM(CASE WHEN status!='POSTED' AND eta<? THEN 1 ELSE 0 END),0) overdue FROM receipts WHERE store_id=?`).get(businessDate,storeId);
 const lines=db.prepare(`SELECT COUNT(*) pending FROM receipt_lines l JOIN receipts r ON r.id=l.receipt_id WHERE r.store_id=? AND r.status!='POSTED' AND l.quality_control_id IS NULL`).get(storeId);
 return{activeReceipts:Number(receipts.active||0),totalReceipts:Number(receipts.total||0),overdue:Number(receipts.overdue||0),pendingLines:Number(lines.pending||0)}
}
function qualitySummary(storeId,businessDate){
 const row=db.prepare(`SELECT COUNT(*) controls,COALESCE(SUM(CASE WHEN decision!='ACCEPT' THEN 1 ELSE 0 END),0) nonConform,COALESCE(SUM(CASE WHEN temperature_status='NOK' THEN 1 ELSE 0 END),0) temperatureNok,COALESCE(SUM(rejected_qty),0) rejected FROM quality_controls WHERE store_id=? AND date(created_at)=?`).get(storeId,businessDate);
 return{controls:Number(row.controls||0),nonConform:Number(row.nonConform||0),temperatureNok:Number(row.temperatureNok||0),rejected:Number(row.rejected||0)}
}
function computeManagerHomeFast(storeId,businessDate){
 const day=readStoreDay(storeId,businessDate),opening=process(day,'opening'),closing=process(day,'closing'),commercial=commercialSummary(storeId,businessDate),cash=cashClosingSummary(storeId,businessDate),dlc=dlcSummary(storeId),handover=handoverStats(storeId,businessDate),inventory=inventorySummary(storeId),incidents=incidentStats(storeId),staff=staffingSummary(storeId,businessDate),cold=coldChainSummary(storeId,businessDate),cashOpen=cashOpeningSummary(storeId,businessDate),loss=lossSummary(storeId,businessDate),receipts=receiptSummary(storeId,businessDate),quality=qualitySummary(storeId,businessDate),cycle=dayCycleMetrics(day);
 const health=Math.max(0,100-incidents.open*6-incidents.escalated*8-dlc.expired*8-dlc.critical*5-handover.blocking*6-commercial.mismatch*5-commercial.pending*2-opening.blockers*4);
 return{status:'READY',source:'STOREOPS_LOCAL',generatedAt:new Date().toISOString(),storeId,businessDate,dashboard:{day,cycle,handover,inventory,commercial,cash,opening,closing,dlc,dlcAtRisk:dlc.expired+dlc.critical+dlc.alert+dlc.watch,incidents:incidents.open,criticalIncidents:incidents.critical,overdueIncidents:incidents.overdue,escalatedIncidents:incidents.escalated,watchIncidents:incidents.watch,qualityControls:quality.controls,qualityRejected:quality.rejected,health,lastActions:db.prepare(`SELECT a.*,u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.store_id=? ORDER BY a.id DESC LIMIT 6`).all(storeId)},staff,cold,cashOpen,loss,receipts,quality,diagnostics:{externalCalls:0,readOnly:true,storeDayPersisted:!!day.persisted,cache:'MISS'}}
}

export function getManagerHomeFast(storeId,businessDate=todayISO(),{force=false}={}){
 const key=`${storeId}:${businessDate}`,now=Date.now(),cached=homeCache.get(key);
 if(!force&&cached&&now<cached.expiresAt)return{...cached.value,diagnostics:{...cached.value.diagnostics,cache:'HIT'}};
 const value=computeManagerHomeFast(storeId,businessDate);
 homeCache.set(key,{value,expiresAt:now+HOME_CACHE_MS});
 return value
}

export function invalidateManagerHomeFast(storeId,businessDate=null){
 if(businessDate)return homeCache.delete(`${storeId}:${businessDate}`);
 for(const key of homeCache.keys())if(key.startsWith(`${storeId}:`))homeCache.delete(key)
}

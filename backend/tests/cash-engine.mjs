process.env.D365_MODE='simulated';
process.env.STOREOPS_DB=process.env.STOREOPS_DB||'/tmp/storeops-cash-engine.db';
process.env.STOREOPS_MEDIA_DIR=process.env.STOREOPS_MEDIA_DIR||'/tmp/storeops-cash-media';

const { db,ensureStoreDay }=await import('../db.mjs');
const { getCashClosingSnapshot }=await import('../services/dynamics.mjs');
const { cashConfig,syncCashClosing,countCashLine,finalizeCashClosing,cashClosingSummary }=await import('../services/cash.mjs');

function ok(v,m){if(!v)throw new Error(m)}
const user=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
const day=ensureStoreDay('val-fleuri');
const cfg=cashConfig();
ok(Number(cfg.policy.tolerance_dh)===1,'cash tolerance default failed');
ok(Number(cfg.policy.recount_threshold_dh)===5,'cash recount default failed');
ok(Number(cfg.policy.evidence_threshold_dh)===20,'cash evidence threshold default failed');

const snapshot=await getCashClosingSnapshot('val-fleuri',day.business_date);
let closing=syncCashClosing({storeId:'val-fleuri',businessDate:day.business_date,snapshot});
ok(closing.lines.length===3,'Dynamics cash snapshot must create 3 shifts');
ok(closing.metrics.expectedSales===10500,'expected sales aggregate failed');
ok(closing.metrics.expectedCash===3900,'expected cash aggregate failed');
ok(closing.metrics.expectedCard===6200,'expected card aggregate failed');

const [l1,l2,l3]=closing.lines;
closing=countCashLine({lineId:l1.id,user,declaredCash:l1.expected_cash,cardSettlement:l1.expected_card,statementOk:true});
ok(closing.lines.find(x=>x.id===l1.id).status==='COUNTED','conform shift should be counted directly');

let reasonBlocked=false;
try{countCashLine({lineId:l2.id,user,declaredCash:l2.expected_cash-2,cardSettlement:l2.expected_card,statementOk:true})}catch(e){reasonBlocked=e.status===409}
ok(reasonBlocked,'small variance must require a reason');
closing=countCashLine({lineId:l2.id,user,declaredCash:l2.expected_cash-2,cardSettlement:l2.expected_card,statementOk:true,reasonCode:'CASH_HANDLING',note:'Écart justifié'});
ok(closing.lines.find(x=>x.id===l2.id).status==='COUNTED','small justified variance should be counted');

closing=countCashLine({lineId:l3.id,user,declaredCash:l3.expected_cash-25,cardSettlement:l3.expected_card+5,statementOk:true,reasonCode:'CASH_HANDLING',note:'Recomptage requis'});
ok(closing.lines.find(x=>x.id===l3.id).status==='RECOUNT','large variance must trigger recount');
closing=countCashLine({lineId:l3.id,user,declaredCash:l3.expected_cash-25,cardSettlement:l3.expected_card+5,statementOk:true,recount:true});
const finalLine=closing.lines.find(x=>x.id===l3.id);
ok(finalLine.status==='COUNTED'&&finalLine.final_cash_variance===-25&&finalLine.final_card_variance===5,'recount final variances failed');

const result=finalizeCashClosing({closingId:closing.id,user});
ok(result.closing.status==='READY','cash closing must become READY');
ok(result.varianceLines.length===2,'two variance shifts expected');
const cashIncidents=db.prepare(`SELECT * FROM incidents WHERE source_type='CASH_SHIFT' AND status='OPEN' ORDER BY criticality`).all();
ok(cashIncidents.length===2,'variance shifts must create incidents');
ok(cashIncidents.some(i=>i.criticality==='CRITICAL'&&i.requires_evidence===1),'large cash variance must require evidence');
ok(cashIncidents.every(i=>i.blocking_level==='STORE_CLOSING'),'cash variance incidents must block store closing');

const task=db.prepare(`SELECT t.* FROM tasks t WHERE t.store_day_id=? AND t.group_name='closing' AND t.step_order=3`).get(day.id);
ok(task.status==='COMPLETED','cash module must auto-complete closing cash task');
const taskValues=JSON.parse(task.value_json||'{}');
ok(taskValues.especes_attendues===3900&&taskValues.especes_declarees===3873,'cash task aggregate values failed');
ok(taskValues.tpe_systeme===6200&&taskValues.tpe_cloture===6205,'card task aggregate values failed');

const summary=cashClosingSummary('val-fleuri',day.business_date);
ok(summary.status==='READY'&&summary.blocking===0,'cash closing summary readiness failed');
console.log('StoreOps V1.9 cash closing engine tests passed');

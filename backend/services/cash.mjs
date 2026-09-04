import { db,uid,audit,todayISO } from '../db.mjs';
import { createIncident,addAction } from './incidents.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS cash_policies(
 id TEXT PRIMARY KEY,
 tolerance_dh REAL NOT NULL DEFAULT 1,
 recount_threshold_dh REAL NOT NULL DEFAULT 5,
 evidence_threshold_dh REAL NOT NULL DEFAULT 20,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cash_closings(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 source_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'COUNTING' CHECK(status IN ('COUNTING','REVIEW','READY','CLOSED')),
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_by TEXT NULL REFERENCES users(id),
 reviewed_at TEXT NULL,
 closed_by TEXT NULL REFERENCES users(id),
 closed_at TEXT NULL,
 UNIQUE(store_id,business_date)
);
CREATE TABLE IF NOT EXISTS cash_closing_lines(
 id TEXT PRIMARY KEY,
 closing_id TEXT NOT NULL REFERENCES cash_closings(id) ON DELETE CASCADE,
 till_code TEXT NOT NULL,
 shift_id TEXT NOT NULL,
 cashier_name TEXT NULL,
 expected_sales REAL NOT NULL DEFAULT 0,
 expected_cash REAL NOT NULL DEFAULT 0,
 expected_card REAL NOT NULL DEFAULT 0,
 expected_other REAL NOT NULL DEFAULT 0,
 declared_cash REAL NULL,
 card_settlement REAL NULL,
 statement_ok INTEGER NULL,
 cash_variance REAL NULL,
 card_variance REAL NULL,
 requires_recount INTEGER NOT NULL DEFAULT 0,
 recount_cash REAL NULL,
 recount_card REAL NULL,
 final_cash REAL NULL,
 final_card REAL NULL,
 final_cash_variance REAL NULL,
 final_card_variance REAL NULL,
 reason_code TEXT NULL,
 note TEXT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RECOUNT','COUNTED')),
 counted_by TEXT NULL REFERENCES users(id),
 counted_at TEXT NULL,
 UNIQUE(closing_id,shift_id)
);
CREATE INDEX IF NOT EXISTS ix_cash_closing_store_date ON cash_closings(store_id,business_date,status);
CREATE INDEX IF NOT EXISTS ix_cash_closing_lines ON cash_closing_lines(closing_id,status);
`);
db.prepare(`INSERT OR IGNORE INTO cash_policies(id,tolerance_dh,recount_threshold_dh,evidence_threshold_dh) VALUES('default',1,5,20)`).run();

export const CASH_REASON_CODES=[
 {code:'COUNT_ERROR',label:'Erreur de comptage'},
 {code:'CHANGE_FLOAT',label:'Écart de fond de caisse / monnaie'},
 {code:'CARD_SETTLEMENT',label:'Écart de remise TPE'},
 {code:'REFUND',label:'Remboursement / annulation'},
 {code:'SHIFT_TIMING',label:'Décalage de shift / synchronisation'},
 {code:'CASH_HANDLING',label:'Erreur manipulation espèces'},
 {code:'OTHER',label:'Autre'}
];
const round=v=>Math.round(Number(v||0)*100)/100;
function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
export function cashPolicy(){return db.prepare(`SELECT * FROM cash_policies WHERE id='default'`).get()}
export function cashConfig(){return{reasons:CASH_REASON_CODES,policy:cashPolicy()}}
function hydrateLine(row){return row?{...row,counted_by_name:userName(row.counted_by),max_variance:Math.max(Math.abs(Number(row.final_cash_variance??row.cash_variance??0)),Math.abs(Number(row.final_card_variance??row.card_variance??0)))}:null}
function hydrateClosing(row){
 if(!row)return null;
 const lines=db.prepare(`SELECT * FROM cash_closing_lines WHERE closing_id=? ORDER BY till_code,shift_id`).all(row.id).map(hydrateLine);
 const final=lines.filter(x=>x.status==='COUNTED'),sum=k=>round(lines.reduce((s,x)=>s+Number(x[k]||0),0)),sumFinal=k=>round(final.reduce((s,x)=>s+Number(x[k]||0),0));
 return{...row,reviewed_by_name:userName(row.reviewed_by),closed_by_name:userName(row.closed_by),lines,metrics:{lines:lines.length,counted:final.length,pending:lines.filter(x=>x.status==='PENDING').length,recounts:lines.filter(x=>x.status==='RECOUNT').length,expectedSales:sum('expected_sales'),expectedCash:sum('expected_cash'),expectedCard:sum('expected_card'),expectedOther:sum('expected_other'),finalCash:sumFinal('final_cash'),finalCard:sumFinal('final_card'),cashVariance:sumFinal('final_cash_variance'),cardVariance:sumFinal('final_card_variance')}};
}
export function cashClosing(storeId,businessDate=todayISO()){
 return hydrateClosing(db.prepare(`SELECT * FROM cash_closings WHERE store_id=? AND business_date=?`).get(storeId,businessDate));
}
export function cashClosingById(id){return hydrateClosing(db.prepare(`SELECT * FROM cash_closings WHERE id=?`).get(id))}
export function syncCashClosing({storeId,businessDate=todayISO(),snapshot}){
 if(!snapshot?.sourceKey||!Array.isArray(snapshot.lines))throw Object.assign(new Error('Snapshot clôture Dynamics invalide.'),{status:502});
 let closing=db.prepare(`SELECT * FROM cash_closings WHERE store_id=? AND business_date=?`).get(storeId,businessDate);
 if(!closing){const id=uid('cash');db.prepare(`INSERT INTO cash_closings(id,store_id,business_date,source_key,status) VALUES(?,?,?,?,'COUNTING')`).run(id,storeId,businessDate,snapshot.sourceKey);closing=db.prepare(`SELECT * FROM cash_closings WHERE id=?`).get(id)}
 const stmt=db.prepare(`INSERT OR IGNORE INTO cash_closing_lines(id,closing_id,till_code,shift_id,cashier_name,expected_sales,expected_cash,expected_card,expected_other) VALUES(?,?,?,?,?,?,?,?,?)`);
 for(const l of snapshot.lines){if(!l.shiftId||!l.tillCode)continue;stmt.run(uid('cashl'),closing.id,l.tillCode,l.shiftId,l.cashierName||null,round(l.expectedSales),round(l.expectedCash),round(l.expectedCard),round(l.expectedOther))}
 return cashClosingById(closing.id);
}
function reasonValid(code){return !code||CASH_REASON_CODES.some(x=>x.code===code)}
export function countCashLine({lineId,user,declaredCash,cardSettlement,statementOk,reasonCode=null,note='',recount=false}){
 const row=db.prepare(`SELECT l.*,c.store_id,c.business_date,c.status closing_status FROM cash_closing_lines l JOIN cash_closings c ON c.id=l.closing_id WHERE l.id=?`).get(lineId);if(!row)throw Object.assign(new Error('Shift caisse introuvable.'),{status:404});
 if(!['COUNTING','REVIEW'].includes(row.closing_status))throw Object.assign(new Error('Cette clôture caisse n’est plus modifiable.'),{status:409});
 if(!reasonValid(reasonCode))throw Object.assign(new Error('Motif d’écart invalide.'),{status:400});
 const cash=Number(declaredCash),card=Number(cardSettlement);if(!Number.isFinite(cash)||cash<0||!Number.isFinite(card)||card<0)throw Object.assign(new Error('Montants espèces/TPE invalides.'),{status:400});
 const policy=cashPolicy();
 if(recount){
  if(!row.requires_recount)throw Object.assign(new Error('Ce shift ne nécessite pas de recomptage.'),{status:409});
  const cashVar=round(cash-Number(row.expected_cash)),cardVar=round(card-Number(row.expected_card)),finalReason=reasonCode||row.reason_code||null;
  if((cashVar!==0||cardVar!==0)&&!finalReason)throw Object.assign(new Error('Un motif est obligatoire pour tout écart final.'),{status:409});
  if(statementOk!==true)throw Object.assign(new Error('Le statement / shift Dynamics doit être contrôlé avant validation.'),{status:409});
  db.prepare(`UPDATE cash_closing_lines SET recount_cash=?,recount_card=?,final_cash=?,final_card=?,final_cash_variance=?,final_card_variance=?,statement_ok=1,requires_recount=0,reason_code=?,note=?,status='COUNTED',counted_by=?,counted_at=CURRENT_TIMESTAMP WHERE id=?`).run(cash,card,cash,card,cashVar,cardVar,finalReason,note||row.note||null,user.id,lineId);
  audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:'CASH_SHIFT_RECOUNTED',entityType:'CASH_SHIFT',entityId:lineId,details:{cash,card,cashVariance:cashVar,cardVariance:cardVar,reasonCode:finalReason}});
 }else{
  if(row.declared_cash!=null)throw Object.assign(new Error('Le premier comptage existe déjà. Utilise le recomptage.'),{status:409});
  const cashVar=round(cash-Number(row.expected_cash)),cardVar=round(card-Number(row.expected_card)),max=Math.max(Math.abs(cashVar),Math.abs(cardVar)),needs=max>=Number(policy.recount_threshold_dh)||statementOk!==true;
  if(!needs&&(cashVar!==0||cardVar!==0)&&!reasonCode)throw Object.assign(new Error('Un motif est obligatoire pour tout écart.'),{status:409});
  db.prepare(`UPDATE cash_closing_lines SET declared_cash=?,card_settlement=?,statement_ok=?,cash_variance=?,card_variance=?,requires_recount=?,final_cash=?,final_card=?,final_cash_variance=?,final_card_variance=?,reason_code=?,note=?,status=?,counted_by=?,counted_at=CURRENT_TIMESTAMP WHERE id=?`).run(cash,card,statementOk===true?1:0,cashVar,cardVar,needs?1:0,needs?null:cash,needs?null:card,needs?null:cashVar,needs?null:cardVar,reasonCode||null,note||null,needs?'RECOUNT':'COUNTED',user.id,lineId);
  audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:needs?'CASH_SHIFT_RECOUNT_REQUIRED':'CASH_SHIFT_COUNTED',entityType:'CASH_SHIFT',entityId:lineId,details:{cash,card,cashVariance:cashVar,cardVariance:cardVar,statementOk:statementOk===true,requiresRecount:needs,reasonCode}});
 }
 db.prepare(`UPDATE cash_closings SET status='REVIEW' WHERE id=? AND status='COUNTING'`).run(row.closing_id);
 return cashClosingById(row.closing_id);
}
function completeClosingTask(closing,user){
 const day=db.prepare(`SELECT id FROM store_days WHERE store_id=? AND business_date=?`).get(closing.store_id,closing.business_date);if(!day)return;
 const task=db.prepare(`SELECT * FROM tasks WHERE store_day_id=? AND group_name='closing' AND step_order=3`).get(day.id);if(!task)return;
 const values={ca_commercial:closing.metrics.expectedSales,ca_comptable:closing.metrics.expectedSales,especes_attendues:closing.metrics.expectedCash,especes_declarees:closing.metrics.finalCash,tpe_systeme:closing.metrics.expectedCard,tpe_cloture:closing.metrics.finalCard,statement:true};
 for(const [code,value] of Object.entries(values)){const f=db.prepare(`SELECT id FROM task_fields WHERE task_id=? AND code=?`).get(task.id,code);if(f)db.prepare(`UPDATE task_fields SET value_json=?,is_nonconform=0 WHERE id=?`).run(JSON.stringify(value),f.id)}
 db.prepare(`UPDATE tasks SET value_json=?,status='COMPLETED',completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(JSON.stringify(values),user.id,task.id);
 audit({storeId:closing.store_id,businessDate:closing.business_date,userId:user.id,action:'CASH_TASK_AUTO_COMPLETED',entityType:'TASK',entityId:task.id,details:{cashClosingId:closing.id,values}});
}
export function finalizeCashClosing({closingId,user}){
 const closing=cashClosingById(closingId);if(!closing)throw Object.assign(new Error('Clôture caisse introuvable.'),{status:404});if(!['COUNTING','REVIEW'].includes(closing.status))throw Object.assign(new Error('Clôture caisse déjà finalisée.'),{status:409});
 if(!closing.lines.length)throw Object.assign(new Error('Aucun shift caisse à rapprocher.'),{status:409});
 if(closing.metrics.pending||closing.metrics.recounts)throw Object.assign(new Error(`${closing.metrics.pending+closing.metrics.recounts} shift(s) restent à compter ou recomptabiliser.`),{status:409});
 const policy=cashPolicy(),tolerance=Number(policy.tolerance_dh),evidence=Number(policy.evidence_threshold_dh),varianceLines=closing.lines.filter(x=>Math.max(Math.abs(Number(x.final_cash_variance||0)),Math.abs(Number(x.final_card_variance||0)))>tolerance);
 for(const line of varianceLines){
  const existing=db.prepare(`SELECT id FROM incidents WHERE source_type='CASH_SHIFT' AND source_id=? AND status='OPEN'`).get(line.id);if(existing)continue;
  const max=Math.max(Math.abs(Number(line.final_cash_variance||0)),Math.abs(Number(line.final_card_variance||0))),needsEvidence=max>=evidence;
  const inc=createIncident({storeId:closing.store_id,user,title:`Écart caisse · ${line.till_code} / ${line.shift_id}`,description:`Espèces attendues ${round(line.expected_cash)} DH · finales ${round(line.final_cash)} DH · écart ${round(line.final_cash_variance)} DH · TPE attendu ${round(line.expected_card)} DH · clôturé ${round(line.final_card)} DH · écart ${round(line.final_card_variance)} DH · motif ${line.reason_code||'—'}`,category:'CASH',criticality:needsEvidence?'CRITICAL':'HIGH',blockingLevel:'STORE_CLOSING',sourceType:'CASH_SHIFT',sourceId:line.id,assignedTo:user.role==='store_manager'?user.id:null,requiresEvidence:needsEvidence});
  addAction({incidentId:inc.id,user,title:'Analyser, justifier et régulariser l’écart caisse',note:line.note||'',assignedTo:user.role==='store_manager'?user.id:null});
 }
 db.prepare(`UPDATE cash_closings SET status='READY',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,closingId);
 const ready=cashClosingById(closingId);completeClosingTask(ready,user);
 audit({storeId:ready.store_id,businessDate:ready.business_date,userId:user.id,action:'CASH_CLOSING_READY',entityType:'CASH_CLOSING',entityId:closingId,details:{metrics:ready.metrics,varianceLines:varianceLines.length}});
 return{closing:ready,varianceLines};
}
export function markCashClosingClosed({closingId,user}){
 const closing=cashClosingById(closingId);if(!closing)throw Object.assign(new Error('Clôture caisse introuvable.'),{status:404});if(closing.status!=='READY')throw Object.assign(new Error('La clôture caisse doit être validée avant fermeture.'),{status:409});
 const open=db.prepare(`SELECT COUNT(*) n FROM incidents WHERE store_id=? AND status='OPEN' AND source_type='CASH_SHIFT' AND source_id IN (SELECT id FROM cash_closing_lines WHERE closing_id=?)`).get(closing.store_id,closingId).n;if(open)throw Object.assign(new Error(`${open} incident(s) caisse restent ouverts.`),{status:409});
 db.prepare(`UPDATE cash_closings SET status='CLOSED',closed_by=?,closed_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,closingId);audit({storeId:closing.store_id,businessDate:closing.business_date,userId:user.id,action:'CASH_CLOSING_CLOSED',entityType:'CASH_CLOSING',entityId:closingId});return cashClosingById(closingId);
}
export function cashClosingSummary(storeId,businessDate=todayISO()){
 const c=cashClosing(storeId,businessDate);if(!c)return{exists:false,status:'NOT_STARTED',lines:0,pending:0,recounts:0,varianceLines:0,blocking:1};
 const tolerance=Number(cashPolicy().tolerance_dh),varianceLines=c.lines.filter(x=>x.status==='COUNTED'&&Math.max(Math.abs(Number(x.final_cash_variance||0)),Math.abs(Number(x.final_card_variance||0)))>tolerance).length;
 return{exists:true,id:c.id,status:c.status,lines:c.metrics.lines,pending:c.metrics.pending,recounts:c.metrics.recounts,varianceLines,expectedSales:c.metrics.expectedSales,cashVariance:c.metrics.cashVariance,cardVariance:c.metrics.cardVariance,blocking:['READY','CLOSED'].includes(c.status)?0:1};
}
export function updateCashPolicy({user,tolerance,recountThreshold,evidenceThreshold}){
 const t=Number(tolerance),r=Number(recountThreshold),e=Number(evidenceThreshold);if(!Number.isFinite(t)||!Number.isFinite(r)||!Number.isFinite(e)||t<0||r<t||e<r)throw Object.assign(new Error('Seuils invalides : preuve ≥ recomptage ≥ tolérance ≥ 0.'),{status:400});
 db.prepare(`UPDATE cash_policies SET tolerance_dh=?,recount_threshold_dh=?,evidence_threshold_dh=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(t,r,e,user.id);for(const st of db.prepare(`SELECT id FROM stores WHERE active=1`).all())audit({storeId:st.id,userId:user.id,action:'CASH_POLICY_UPDATED',entityType:'CASH_POLICY',entityId:'default',details:{tolerance:t,recountThreshold:r,evidenceThreshold:e}});return cashPolicy();
}

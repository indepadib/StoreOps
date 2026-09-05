process.env.STOREOPS_DB=process.env.STOREOPS_DB||'/tmp/storeops-manual-cash-fallback.db';
const {db,ensureStoreDay}=await import('../db.mjs');
const {validateProcess}=await import('../services/workflow.mjs');
function ok(v,m){if(!v)throw new Error(m)}
const date='2026-09-05',day=ensureStoreDay('val-fleuri',date),user=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
db.prepare(`UPDATE store_days SET opening_status='OPENED',closing_status='IN_PROGRESS',handover_reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).run(day.id);
// No dedicated cash_closing row exists: the mandatory generic closing task must remain the fallback.
const before=db.prepare(`SELECT COUNT(*) n FROM cash_closings WHERE store_id='val-fleuri' AND business_date=?`).get(date).n;
ok(before===0,'test requires no dedicated cash closing snapshot');
// An incomplete manual closing task must still block through normal process progress.
let blocked=false;try{validateProcess({storeDay:db.prepare(`SELECT * FROM store_days WHERE id=?`).get(day.id),user,group:'closing'})}catch(e){blocked=e.status===409}ok(blocked,'closing must remain blocked while mandatory tasks are incomplete');
// Complete every mandatory closing control, including the generic cash-control step.
db.prepare(`UPDATE tasks SET status='COMPLETED',completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE store_day_id=? AND group_name='closing'`).run(user.id,day.id);
const result=validateProcess({storeDay:db.prepare(`SELECT * FROM store_days WHERE id=?`).get(day.id),user,group:'closing'});
ok(result.done===result.total,'manual closing fallback should validate after all mandatory tasks are complete');
const closed=db.prepare(`SELECT closing_status FROM store_days WHERE id=?`).get(day.id);
ok(closed.closing_status==='CLOSED','store day must close without a dedicated D365 cash snapshot');
console.log('StoreOps manual cash-closing fallback tests passed');

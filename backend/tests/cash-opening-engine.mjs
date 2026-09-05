process.env.STOREOPS_DB=process.env.STOREOPS_DB||'/tmp/storeops-cash-opening-test.db';
const {db,ensureStoreDay}=await import('../db.mjs');
const {syncCashOpening,cashOpeningSummary,checkCashOpeningLine,updateCashOpeningPolicy}=await import('../services/cash-opening.mjs');
const {validateProcess}=await import('../services/workflow.mjs');
function ok(v,m){if(!v)throw new Error(m)}
const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get(),director=db.prepare(`SELECT * FROM users WHERE id='u-ops'`).get(),date=new Date().toISOString().slice(0,10),day=ensureStoreDay('val-fleuri',date);
db.prepare(`UPDATE tasks SET status='COMPLETED',completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE store_day_id=? AND group_name='opening' AND step_order<7`).run(manager.id,day.id);
const snapshot={sourceKey:`OPEN-CASH-val-fleuri-${date}`,lines:[{tillCode:'C01',shiftId:'VF-OPEN-C01',expectedFloat:500},{tillCode:'C02',shiftId:'VF-OPEN-C02',expectedFloat:500},{tillCode:'C03',shiftId:'VF-OPEN-C03',expectedFloat:500}]};
let opening=syncCashOpening({storeId:'val-fleuri',businessDate:date,snapshot});
ok(opening.lines.length===3&&cashOpeningSummary('val-fleuri',date).blocking===3,'cash opening snapshot failed');
let blocked=false;try{validateProcess({storeDay:day,user:manager,group:'opening'})}catch(e){blocked=e.status===409&&Number(e.details?.cashOpeningBlocking)===3}ok(blocked,'store opening must be blocked before till readiness');
let r=checkCashOpeningLine({lineId:opening.lines[0].id,user:manager,cashierName:'Sara',declaredFloat:450,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true});
ok(r.line.status==='MISMATCH'&&r.issues.length===1&&r.opening.status==='PREPARING','cash opening float mismatch rule failed');
r=checkCashOpeningLine({lineId:opening.lines[0].id,user:manager,cashierName:'Sara',declaredFloat:500,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true});ok(r.line.status==='READY','cash opening correction failed');
for(const [i,line] of opening.lines.slice(1).entries()){r=checkCashOpeningLine({lineId:line.id,user:manager,cashierName:`Caissier ${i+2}`,declaredFloat:500,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true})}
opening=r.opening;ok(opening.status==='READY'&&opening.metrics.ready===3&&cashOpeningSummary('val-fleuri',date).blocking===0,'cash opening readiness failed');
const task=db.prepare(`SELECT * FROM tasks WHERE store_day_id=? AND group_name='opening' AND step_order=7`).get(day.id);ok(task.status==='COMPLETED','opening cash task must auto-complete');
const progress=validateProcess({storeDay:day,user:manager,group:'opening'});ok(progress.done===progress.total,'opening must validate after all tills are ready');
opening=(await import('../services/cash-opening.mjs')).cashOpening('val-fleuri',date);ok(opening.status==='OPENED','cash opening must become OPENED with store opening');
let locked=false;try{checkCashOpeningLine({lineId:opening.lines[0].id,user:manager,cashierName:'Sara',declaredFloat:500,posOk:true,tpeOk:true,printerOk:true,shiftOpened:true})}catch(e){locked=e.status===409}ok(locked,'cash opening must lock after store opening');
let policy=updateCashOpeningPolicy({user:director,floatTolerance:0.5});ok(Number(policy.float_tolerance_dh)===0.5,'cash opening policy update failed');
console.log('StoreOps V1.11 cash opening readiness engine tests passed');

process.env.STOREOPS_DB=process.env.STOREOPS_DB||'/tmp/storeops-staffing-test.db';
const {db,ensureStoreDay}=await import('../db.mjs');
const {syncStaffingDay,staffingSummary,setAttendance,updateStaffingPolicy}=await import('../services/staffing.mjs');
function ok(v,m){if(!v)throw new Error(m)}
const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get(),director=db.prepare(`SELECT * FROM users WHERE id='u-ops'`).get(),date=new Date().toISOString().slice(0,10),day=ensureStoreDay('val-fleuri',date);
const snapshot={sourceKey:`STAFFING-val-fleuri-${date}`,lines:[{employeeRef:'MGR',employeeName:'Manager',roleCode:'MANAGER',roleLabel:'Responsable ouverture',scheduledStart:'07:30'},{employeeRef:'C1',employeeName:'Caisse 1',roleCode:'CASHIER',roleLabel:'Caisse',scheduledStart:'07:45'},{employeeRef:'C2',employeeName:'Caisse 2',roleCode:'CASHIER',roleLabel:'Caisse',scheduledStart:'08:00'},{employeeRef:'F1',employeeName:'Surface 1',roleCode:'FLOOR',roleLabel:'Surface',scheduledStart:'07:30'}]};
let s=syncStaffingDay({storeId:'val-fleuri',businessDate:date,snapshot});ok(s.lines.length===4&&staffingSummary('val-fleuri',date).blocking===4,'staffing sync failed');
const by=r=>s.lines.find(x=>x.role_code===r),mgr=by('MANAGER'),floor=by('FLOOR'),cash=s.lines.filter(x=>x.role_code==='CASHIER');
setAttendance({lineId:mgr.id,user:manager,status:'ABSENT',note:'absence'});setAttendance({lineId:cash[0].id,user:manager,status:'PRESENT'});setAttendance({lineId:cash[1].id,user:manager,status:'ABSENT'});s=setAttendance({lineId:floor.id,user:manager,status:'PRESENT'}).day;ok(!s.metrics.coverageOk&&s.metrics.gaps.managers===1,'missing manager must block');
s=setAttendance({lineId:mgr.id,user:manager,status:'REPLACED',replacementName:'Yassine'}).day;ok(s.status==='READY'&&s.metrics.coverageOk&&s.metrics.replaced===1,'replacement must restore coverage');
const task=db.prepare(`SELECT * FROM tasks WHERE store_day_id=? AND group_name='opening' AND step_order=1`).get(day.id);ok(task.status==='COMPLETED','staffing must auto-complete opening step 1');
let p=updateStaffingPolicy({user:director,requiredManagers:1,requiredCashiers:2,requiredFloor:1});ok(Number(p.required_cashiers)===2,'staffing policy update failed');ok(staffingSummary('val-fleuri',date).coverageOk===false,'higher cashier minimum must recalc coverage');
updateStaffingPolicy({user:director,requiredManagers:1,requiredCashiers:1,requiredFloor:1});
console.log('StoreOps V1.13 staffing readiness engine tests passed');

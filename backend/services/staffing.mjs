import { db,uid,audit,todayISO } from '../db.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS staffing_policies(
 id TEXT PRIMARY KEY,
 required_managers INTEGER NOT NULL DEFAULT 1,
 required_cashiers INTEGER NOT NULL DEFAULT 1,
 required_floor INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS staffing_days(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 source_key TEXT NULL,
 status TEXT NOT NULL DEFAULT 'PREPARING' CHECK(status IN ('PREPARING','READY','OPENED')),
 synced_at TEXT NULL,
 ready_by TEXT NULL REFERENCES users(id),
 ready_at TEXT NULL,
 opened_at TEXT NULL,
 UNIQUE(store_id,business_date)
);
CREATE TABLE IF NOT EXISTS staffing_lines(
 id TEXT PRIMARY KEY,
 staffing_day_id TEXT NOT NULL REFERENCES staffing_days(id) ON DELETE CASCADE,
 employee_ref TEXT NOT NULL,
 employee_name TEXT NOT NULL,
 role_code TEXT NOT NULL CHECK(role_code IN ('MANAGER','CASHIER','FLOOR','OTHER')),
 role_label TEXT NOT NULL,
 scheduled_start TEXT NULL,
 attendance_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(attendance_status IN ('PENDING','PRESENT','ABSENT','REPLACED')),
 replacement_name TEXT NULL,
 note TEXT NULL,
 checked_by TEXT NULL REFERENCES users(id),
 checked_at TEXT NULL,
 UNIQUE(staffing_day_id,employee_ref)
);
CREATE INDEX IF NOT EXISTS ix_staffing_store_date ON staffing_days(store_id,business_date,status);
`);
db.prepare(`INSERT OR IGNORE INTO staffing_policies(id,required_managers,required_cashiers,required_floor) VALUES('default',1,1,1)`).run();
function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
export function staffingPolicy(){return db.prepare(`SELECT * FROM staffing_policies WHERE id='default'`).get()}
export function staffingConfig(){return{policy:staffingPolicy(),statuses:[{code:'PRESENT',label:'Présent'},{code:'ABSENT',label:'Absent'},{code:'REPLACED',label:'Remplacé'}],roles:[{code:'MANAGER',label:'Responsable ouverture'},{code:'CASHIER',label:'Caisse'},{code:'FLOOR',label:'Surface de vente'},{code:'OTHER',label:'Autre'}]}}
function hydrate(row){if(!row)return null;const lines=db.prepare(`SELECT * FROM staffing_lines WHERE staffing_day_id=? ORDER BY CASE role_code WHEN 'MANAGER' THEN 0 WHEN 'CASHIER' THEN 1 WHEN 'FLOOR' THEN 2 ELSE 3 END,scheduled_start,employee_name`).all(row.id).map(x=>({...x,checked_by_name:userName(x.checked_by)})),policy=staffingPolicy(),coverage={MANAGER:0,CASHIER:0,FLOOR:0,OTHER:0};for(const x of lines)if(['PRESENT','REPLACED'].includes(x.attendance_status))coverage[x.role_code]=(coverage[x.role_code]||0)+1;const pending=lines.filter(x=>x.attendance_status==='PENDING').length,absent=lines.filter(x=>x.attendance_status==='ABSENT').length,replaced=lines.filter(x=>x.attendance_status==='REPLACED').length,gaps={managers:Math.max(0,Number(policy.required_managers)-coverage.MANAGER),cashiers:Math.max(0,Number(policy.required_cashiers)-coverage.CASHIER),floor:Math.max(0,Number(policy.required_floor)-coverage.FLOOR)};return{...row,ready_by_name:userName(row.ready_by),lines,metrics:{lines:lines.length,pending,absent,replaced,present:lines.filter(x=>x.attendance_status==='PRESENT').length,coverage,gaps,coverageOk:gaps.managers+gaps.cashiers+gaps.floor===0}}}
export function staffingDay(storeId,businessDate=todayISO()){return hydrate(db.prepare(`SELECT * FROM staffing_days WHERE store_id=? AND business_date=?`).get(storeId,businessDate))}
export function staffingSummary(storeId,businessDate=todayISO()){const d=staffingDay(storeId,businessDate);if(!d)return{status:'NOT_STARTED',lines:0,pending:0,absent:0,replaced:0,present:0,coverage:{MANAGER:0,CASHIER:0,FLOOR:0},gaps:{managers:1,cashiers:1,floor:1},coverageOk:false,blocking:1};const m=d.metrics,block=d.status==='OPENED'?0:(m.pending>0||!m.coverageOk?Math.max(1,m.pending+m.gaps.managers+m.gaps.cashiers+m.gaps.floor):0);return{status:d.status,...m,blocking:block}}
export function syncStaffingDay({storeId,businessDate=todayISO(),snapshot}){if(!snapshot?.lines?.length)throw Object.assign(new Error('Planning équipe vide.'),{status:409});let day=db.prepare(`SELECT * FROM staffing_days WHERE store_id=? AND business_date=?`).get(storeId,businessDate);if(!day){const id=uid('staff');db.prepare(`INSERT INTO staffing_days(id,store_id,business_date,source_key,status,synced_at) VALUES(?,?,?,?,'PREPARING',CURRENT_TIMESTAMP)`).run(id,storeId,businessDate,snapshot.sourceKey||null);day=db.prepare(`SELECT * FROM staffing_days WHERE id=?`).get(id)}else if(day.status!=='OPENED')db.prepare(`UPDATE staffing_days SET source_key=?,synced_at=CURRENT_TIMESTAMP WHERE id=?`).run(snapshot.sourceKey||day.source_key,day.id);const ins=db.prepare(`INSERT OR IGNORE INTO staffing_lines(id,staffing_day_id,employee_ref,employee_name,role_code,role_label,scheduled_start) VALUES(?,?,?,?,?,?,?)`),upd=db.prepare(`UPDATE staffing_lines SET employee_name=?,role_code=?,role_label=?,scheduled_start=? WHERE staffing_day_id=? AND employee_ref=? AND attendance_status='PENDING'`);for(const x of snapshot.lines){const role=['MANAGER','CASHIER','FLOOR','OTHER'].includes(x.roleCode)?x.roleCode:'OTHER';ins.run(uid('staffl'),day.id,String(x.employeeRef),String(x.employeeName),role,String(x.roleLabel||role),x.scheduledStart||null);upd.run(String(x.employeeName),role,String(x.roleLabel||role),x.scheduledStart||null,day.id,String(x.employeeRef))}audit({storeId,businessDate,userId:null,action:'STAFFING_SYNCED',entityType:'STAFFING_DAY',entityId:day.id,details:{sourceKey:snapshot.sourceKey||null,lines:snapshot.lines.length}});return staffingDay(storeId,businessDate)}
function autoCompleteTask(day,user){const storeDay=db.prepare(`SELECT id FROM store_days WHERE store_id=? AND business_date=?`).get(day.store_id,day.business_date);if(!storeDay)return;const task=db.prepare(`SELECT * FROM tasks WHERE store_day_id=? AND group_name='opening' AND step_order=1`).get(storeDay.id);if(!task)return;const absences=day.lines.filter(x=>['ABSENT','REPLACED'].includes(x.attendance_status)).map(x=>x.attendance_status==='REPLACED'?`${x.employee_name} remplacé par ${x.replacement_name}`:`${x.employee_name} absent`).join(' · '),values={responsable_present:day.metrics.coverage.MANAGER>0,caissier_present:day.metrics.coverage.CASHIER>0,absence_note:absences||'RAS'};for(const [code,value] of Object.entries(values)){const f=db.prepare(`SELECT id FROM task_fields WHERE task_id=? AND code=?`).get(task.id,code);if(f)db.prepare(`UPDATE task_fields SET value_json=?,is_nonconform=0 WHERE id=?`).run(JSON.stringify(value),f.id)}db.prepare(`UPDATE tasks SET value_json=?,status='COMPLETED',completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(JSON.stringify(values),user.id,task.id);audit({storeId:day.store_id,businessDate:day.business_date,userId:user.id,action:'STAFFING_TASK_AUTO_COMPLETED',entityType:'TASK',entityId:task.id,details:{staffingDayId:day.id}})}
function refresh(dayId,user){let d=hydrate(db.prepare(`SELECT * FROM staffing_days WHERE id=?`).get(dayId));if(d.lines.length&&d.metrics.pending===0&&d.metrics.coverageOk){db.prepare(`UPDATE staffing_days SET status='READY',ready_by=?,ready_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,dayId);d=hydrate(db.prepare(`SELECT * FROM staffing_days WHERE id=?`).get(dayId));autoCompleteTask(d,user);audit({storeId:d.store_id,businessDate:d.business_date,userId:user.id,action:'STAFFING_READY',entityType:'STAFFING_DAY',entityId:d.id});return d}db.prepare(`UPDATE staffing_days SET status='PREPARING',ready_by=NULL,ready_at=NULL WHERE id=?`).run(dayId);return hydrate(db.prepare(`SELECT * FROM staffing_days WHERE id=?`).get(dayId))}
export function setAttendance({lineId,user,status,replacementName='',note=''}){const row=db.prepare(`SELECT l.*,d.store_id,d.business_date,d.status day_status FROM staffing_lines l JOIN staffing_days d ON d.id=l.staffing_day_id WHERE l.id=?`).get(lineId);if(!row)throw Object.assign(new Error('Collaborateur planning introuvable.'),{status:404});if(row.day_status==='OPENED')throw Object.assign(new Error('Le pointage d’ouverture est verrouillé après ouverture magasin.'),{status:409});if(!['PRESENT','ABSENT','REPLACED'].includes(status))throw Object.assign(new Error('Statut de présence invalide.'),{status:400});if(status==='REPLACED'&&!String(replacementName||'').trim())throw Object.assign(new Error('Nom du remplaçant obligatoire.'),{status:400});db.prepare(`UPDATE staffing_lines SET attendance_status=?,replacement_name=?,note=?,checked_by=?,checked_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,status==='REPLACED'?String(replacementName).trim():null,note||null,user.id,lineId);audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:'STAFFING_ATTENDANCE_SET',entityType:'STAFFING_LINE',entityId:lineId,details:{employeeRef:row.employee_ref,status,replacementName:status==='REPLACED'?replacementName:null,note}});const day=refresh(row.staffing_day_id,user);return{day,line:day.lines.find(x=>x.id===lineId)}}
export function markStaffingOpened({storeId,businessDate=todayISO(),user}){const d=staffingDay(storeId,businessDate);if(!d)throw Object.assign(new Error('Pointage équipe introuvable.'),{status:404});if(d.status!=='READY')throw Object.assign(new Error('La couverture équipe doit être conforme avant ouverture.'),{status:409});db.prepare(`UPDATE staffing_days SET status='OPENED',opened_at=CURRENT_TIMESTAMP WHERE id=?`).run(d.id);audit({storeId,businessDate,userId:user.id,action:'STAFFING_OPENED',entityType:'STAFFING_DAY',entityId:d.id});return staffingDay(storeId,businessDate)}
export function updateStaffingPolicy({user,requiredManagers,requiredCashiers,requiredFloor}){const m=Number(requiredManagers),c=Number(requiredCashiers),f=Number(requiredFloor);if(![m,c,f].every(Number.isInteger)||m<1||c<1||f<0||m>5||c>20||f>20)throw Object.assign(new Error('Couverture minimale invalide.'),{status:400});db.prepare(`UPDATE staffing_policies SET required_managers=?,required_cashiers=?,required_floor=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(m,c,f,user.id);for(const st of db.prepare(`SELECT id FROM stores WHERE active=1`).all())audit({storeId:st.id,userId:user.id,action:'STAFFING_POLICY_UPDATED',entityType:'STAFFING_POLICY',entityId:'default',details:{requiredManagers:m,requiredCashiers:c,requiredFloor:f}});return staffingPolicy()}

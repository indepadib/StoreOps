import { db,uid,audit,todayISO } from '../db.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS employees(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 employee_code TEXT NOT NULL,
 first_name TEXT NOT NULL,
 last_name TEXT NOT NULL DEFAULT '',
 display_name TEXT NOT NULL,
 role_code TEXT NOT NULL CHECK(role_code IN ('MANAGER','CASHIER','FLOOR','OTHER')),
 contract_type TEXT NOT NULL DEFAULT 'CDI',
 contract_start TEXT NOT NULL,
 contract_end TEXT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','NOTICE','ENDED')),
 email TEXT NULL,
 phone TEXT NULL,
 created_by TEXT NULL REFERENCES users(id),
 ended_by TEXT NULL REFERENCES users(id),
 end_reason TEXT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ended_at TEXT NULL,
 UNIQUE(store_id,employee_code)
);
CREATE TABLE IF NOT EXISTS work_shifts(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 employee_id TEXT NOT NULL REFERENCES employees(id),
 shift_date TEXT NOT NULL,
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 role_code TEXT NOT NULL CHECK(role_code IN ('MANAGER','CASHIER','FLOOR','OTHER')),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','CANCELLED')),
 note TEXT NULL,
 created_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS employee_objectives(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 employee_id TEXT NULL REFERENCES employees(id),
 role_code TEXT NULL,
 title TEXT NOT NULL,
 metric_code TEXT NULL,
 target_value REAL NULL,
 progress_value REAL NULL,
 unit TEXT NULL,
 period_start TEXT NOT NULL,
 period_end TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','CANCELLED')),
 note TEXT NULL,
 created_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_employees_store_status ON employees(store_id,status,display_name);
CREATE INDEX IF NOT EXISTS ix_shifts_store_date ON work_shifts(store_id,shift_date,status,start_time);
CREATE INDEX IF NOT EXISTS ix_objectives_store_period ON employee_objectives(store_id,period_start,period_end,status);
`);

const ROLES=new Set(['MANAGER','CASHIER','FLOOR','OTHER']);
const CONTRACTS=new Set(['CDI','CDD','INTERIM','STAGE','PRESTATAIRE','OTHER']);
const isoDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null;
const hhmm=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''))?String(v):null;
const clean=v=>String(v??'').trim();
const role=v=>ROLES.has(String(v||'').toUpperCase())?String(v).toUpperCase():'OTHER';
function employeeName(first,last){return [clean(first),clean(last)].filter(Boolean).join(' ').trim()}
function assertDateRange(start,end,label='Période'){if(!start||!end||start>end)throw Object.assign(new Error(`${label} invalide.`),{status:400,code:'WORKFORCE_DATE_RANGE_INVALID'})}
function employeeRow(id){return db.prepare(`SELECT * FROM employees WHERE id=?`).get(id)}
function shiftRow(id){return db.prepare(`SELECT s.*,e.display_name employee_name,e.employee_code FROM work_shifts s JOIN employees e ON e.id=s.employee_id WHERE s.id=?`).get(id)}
function objectiveRow(id){return db.prepare(`SELECT o.*,e.display_name employee_name FROM employee_objectives o LEFT JOIN employees e ON e.id=o.employee_id WHERE o.id=?`).get(id)}

export function workforceConfig(){return{
 roles:[{code:'MANAGER',label:'Responsable'},{code:'CASHIER',label:'Caisse'},{code:'FLOOR',label:'Surface'},{code:'OTHER',label:'Autre'}],
 contractTypes:[...CONTRACTS],
 shiftStatuses:['DRAFT','PUBLISHED','CANCELLED'],
 objectiveStatuses:['ACTIVE','COMPLETED','CANCELLED']
}}

export function listEmployees(storeId,{includeEnded=false}={}){
 return db.prepare(`SELECT * FROM employees WHERE store_id=? ${includeEnded?'':"AND status!='ENDED'"} ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'NOTICE' THEN 1 ELSE 2 END,display_name`).all(storeId)
}

export function createEmployee({storeId,user,employeeCode,firstName,lastName='',roleCode='OTHER',contractType='CDI',contractStart=todayISO(),contractEnd=null,email=null,phone=null}){
 const code=clean(employeeCode),first=clean(firstName),last=clean(lastName),display=employeeName(first,last),start=isoDate(contractStart),end=contractEnd?isoDate(contractEnd):null,ctype=String(contractType||'CDI').toUpperCase();
 if(!code||!first||!display)throw Object.assign(new Error('Matricule et prénom sont obligatoires.'),{status:400,code:'EMPLOYEE_REQUIRED_FIELDS'});
 if(!start||contractEnd&&!end||end&&end<start)throw Object.assign(new Error('Dates de contrat invalides.'),{status:400,code:'EMPLOYEE_CONTRACT_INVALID'});
 if(!CONTRACTS.has(ctype))throw Object.assign(new Error('Type de contrat invalide.'),{status:400,code:'EMPLOYEE_CONTRACT_TYPE_INVALID'});
 const id=uid('emp');
 try{db.prepare(`INSERT INTO employees(id,store_id,employee_code,first_name,last_name,display_name,role_code,contract_type,contract_start,contract_end,email,phone,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,storeId,code,first,last,display,role(roleCode),ctype,start,end,clean(email)||null,clean(phone)||null,user?.id||null)}catch(error){if(String(error?.message||'').includes('UNIQUE'))throw Object.assign(new Error('Ce matricule existe déjà dans ce magasin.'),{status:409,code:'EMPLOYEE_CODE_EXISTS'});throw error}
 audit({storeId,userId:user?.id||null,action:'EMPLOYEE_CREATED',entityType:'EMPLOYEE',entityId:id,details:{employeeCode:code,displayName:display,roleCode:role(roleCode),contractType:ctype,contractStart:start,contractEnd:end}});
 return employeeRow(id)
}

export function updateEmployee({employeeId,user,firstName,lastName,roleCode,contractType,contractEnd,email,phone,status}){
 const current=employeeRow(employeeId);if(!current)throw Object.assign(new Error('Employé introuvable.'),{status:404,code:'EMPLOYEE_NOT_FOUND'});
 const first=firstName===undefined?current.first_name:clean(firstName),last=lastName===undefined?current.last_name:clean(lastName),display=employeeName(first,last);if(!first)throw Object.assign(new Error('Prénom obligatoire.'),{status:400});
 const ctype=contractType===undefined?current.contract_type:String(contractType).toUpperCase();if(!CONTRACTS.has(ctype))throw Object.assign(new Error('Type de contrat invalide.'),{status:400});
 const end=contractEnd===undefined?current.contract_end:(contractEnd?isoDate(contractEnd):null);if(contractEnd&& !end || end&&end<current.contract_start)throw Object.assign(new Error('Fin de contrat invalide.'),{status:400});
 const nextStatus=status===undefined?current.status:String(status).toUpperCase();if(!['ACTIVE','NOTICE'].includes(nextStatus)&&nextStatus!=='ENDED')throw Object.assign(new Error('Statut employé invalide.'),{status:400});
 db.prepare(`UPDATE employees SET first_name=?,last_name=?,display_name=?,role_code=?,contract_type=?,contract_end=?,email=?,phone=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(first,last,display,role(roleCode===undefined?current.role_code:roleCode),ctype,end,email===undefined?current.email:clean(email)||null,phone===undefined?current.phone:clean(phone)||null,nextStatus,employeeId);
 audit({storeId:current.store_id,userId:user?.id||null,action:'EMPLOYEE_UPDATED',entityType:'EMPLOYEE',entityId:employeeId,details:{displayName:display,status:nextStatus}});return employeeRow(employeeId)
}

export function endEmployeeContract({employeeId,user,endDate=todayISO(),reason=''}){
 const row=employeeRow(employeeId);if(!row)throw Object.assign(new Error('Employé introuvable.'),{status:404,code:'EMPLOYEE_NOT_FOUND'});const end=isoDate(endDate);if(!end||end<row.contract_start)throw Object.assign(new Error('Date de fin de contrat invalide.'),{status:400});
 db.prepare(`UPDATE employees SET contract_end=?,status='ENDED',ended_by=?,end_reason=?,ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(end,user?.id||null,clean(reason)||null,employeeId);
 db.prepare(`UPDATE work_shifts SET status='CANCELLED',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE employee_id=? AND shift_date>? AND status!='CANCELLED'`).run(user?.id||null,employeeId,end);
 audit({storeId:row.store_id,userId:user?.id||null,action:'EMPLOYEE_CONTRACT_ENDED',entityType:'EMPLOYEE',entityId:employeeId,details:{endDate:end,reason:clean(reason)||null}});return employeeRow(employeeId)
}

function employeeEligibleForDate(emp,date){if(!emp||emp.status==='ENDED'&&emp.contract_end&&emp.contract_end<date)return false;if(emp.contract_start>date)return false;if(emp.contract_end&&emp.contract_end<date)return false;return true}
function overlaps(storeId,employeeId,date,start,end,excludeId=null){return db.prepare(`SELECT id,start_time,end_time FROM work_shifts WHERE store_id=? AND employee_id=? AND shift_date=? AND status!='CANCELLED' ${excludeId?'AND id<>?':''} AND start_time<? AND end_time>? LIMIT 1`).get(...(excludeId?[storeId,employeeId,date,excludeId,end,start]:[storeId,employeeId,date,end,start]))}

export function listShifts(storeId,{date=null,from=null,to=null,status=null}={}){
 const where=['s.store_id=?'],args=[storeId];if(date){where.push('s.shift_date=?');args.push(date)}else{if(from){where.push('s.shift_date>=?');args.push(from)}if(to){where.push('s.shift_date<=?');args.push(to)}}if(status){where.push('s.status=?');args.push(status)}
 return db.prepare(`SELECT s.*,e.display_name employee_name,e.employee_code,e.contract_end,e.status employee_status FROM work_shifts s JOIN employees e ON e.id=s.employee_id WHERE ${where.join(' AND ')} ORDER BY s.shift_date,s.start_time,e.display_name`).all(...args)
}

export function createShift({storeId,user,employeeId,shiftDate,startTime,endTime,roleCode=null,note=''}){
 const emp=employeeRow(employeeId),date=isoDate(shiftDate),start=hhmm(startTime),end=hhmm(endTime);if(!emp||emp.store_id!==storeId)throw Object.assign(new Error('Employé introuvable dans ce magasin.'),{status:404,code:'SHIFT_EMPLOYEE_NOT_FOUND'});if(!date||!start||!end||start>=end)throw Object.assign(new Error('Date ou horaires du shift invalides.'),{status:400,code:'SHIFT_TIME_INVALID'});if(!employeeEligibleForDate(emp,date))throw Object.assign(new Error('Le contrat de cet employé ne couvre pas cette date.'),{status:409,code:'SHIFT_OUTSIDE_CONTRACT'});const conflict=overlaps(storeId,employeeId,date,start,end);if(conflict)throw Object.assign(new Error(`Shift en conflit avec ${conflict.start_time}–${conflict.end_time}.`),{status:409,code:'SHIFT_OVERLAP',details:{conflictId:conflict.id}});
 const id=uid('shift');db.prepare(`INSERT INTO work_shifts(id,store_id,employee_id,shift_date,start_time,end_time,role_code,status,note,created_by) VALUES(?,?,?,?,?,?,?,'DRAFT',?,?)`).run(id,storeId,employeeId,date,start,end,role(roleCode||emp.role_code),clean(note)||null,user?.id||null);audit({storeId,businessDate:date,userId:user?.id||null,action:'SHIFT_CREATED',entityType:'SHIFT',entityId:id,details:{employeeId,start,end,roleCode:role(roleCode||emp.role_code)}});return shiftRow(id)
}

export function setShiftStatus({shiftId,user,status}){const row=shiftRow(shiftId);if(!row)throw Object.assign(new Error('Shift introuvable.'),{status:404,code:'SHIFT_NOT_FOUND'});const next=String(status||'').toUpperCase();if(!['PUBLISHED','CANCELLED','DRAFT'].includes(next))throw Object.assign(new Error('Statut shift invalide.'),{status:400});if(next==='PUBLISHED'){const emp=employeeRow(row.employee_id);if(!employeeEligibleForDate(emp,row.shift_date))throw Object.assign(new Error('Le contrat de cet employé ne couvre plus ce shift.'),{status:409,code:'SHIFT_OUTSIDE_CONTRACT'});const conflict=overlaps(row.store_id,row.employee_id,row.shift_date,row.start_time,row.end_time,row.id);if(conflict)throw Object.assign(new Error('Ce shift chevauche un autre shift actif.'),{status:409,code:'SHIFT_OVERLAP'})}
 db.prepare(`UPDATE work_shifts SET status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(next,user?.id||null,shiftId);audit({storeId:row.store_id,businessDate:row.shift_date,userId:user?.id||null,action:`SHIFT_${next}`,entityType:'SHIFT',entityId:shiftId,details:{employeeId:row.employee_id}});return shiftRow(shiftId)}

export function duplicateShiftDay({storeId,user,fromDate,toDate}){const from=isoDate(fromDate),to=isoDate(toDate);if(!from||!to)throw Object.assign(new Error('Dates invalides.'),{status:400});const source=listShifts(storeId,{date:from,status:'PUBLISHED'});let created=0,skipped=0;for(const s of source){try{createShift({storeId,user,employeeId:s.employee_id,shiftDate:to,startTime:s.start_time,endTime:s.end_time,roleCode:s.role_code,note:s.note||''});created++}catch{skipped++}}audit({storeId,businessDate:to,userId:user?.id||null,action:'SHIFT_DAY_DUPLICATED',entityType:'SHIFT_DAY',entityId:`${from}->${to}`,details:{created,skipped}});return{fromDate:from,toDate:to,created,skipped,items:listShifts(storeId,{date:to})}}

export function staffingSnapshotFromPublishedShifts(storeId,businessDate=todayISO()){
 const rows=listShifts(storeId,{date:businessDate,status:'PUBLISHED'}).filter(x=>employeeEligibleForDate({status:x.employee_status,contract_start:'0000-01-01',contract_end:x.contract_end},businessDate));
 return{sourceKey:`STOREOPS-SHIFTS-${storeId}-${businessDate}`,source:'STOREOPS_SHIFTS',storeId,businessDate,lines:rows.map(x=>({employeeRef:x.employee_code||x.employee_id,employeeName:x.employee_name,roleCode:x.role_code,roleLabel:{MANAGER:'Responsable',CASHIER:'Caisse',FLOOR:'Surface de vente',OTHER:'Autre'}[x.role_code]||x.role_code,scheduledStart:x.start_time,scheduledEnd:x.end_time,shiftId:x.id}))}
}

export function listObjectives(storeId,{employeeId=null,activeOn=null}={}){const where=['o.store_id=?'],args=[storeId];if(employeeId){where.push('o.employee_id=?');args.push(employeeId)}if(activeOn){where.push("o.status='ACTIVE' AND o.period_start<=? AND o.period_end>=?");args.push(activeOn,activeOn)}return db.prepare(`SELECT o.*,e.display_name employee_name FROM employee_objectives o LEFT JOIN employees e ON e.id=o.employee_id WHERE ${where.join(' AND ')} ORDER BY o.period_end,o.title`).all(...args)}

export function createObjective({storeId,user,employeeId=null,roleCode=null,title,metricCode=null,targetValue=null,unit=null,periodStart,periodEnd,note=''}){const start=isoDate(periodStart),end=isoDate(periodEnd);assertDateRange(start,end,'Période objectif');if(!clean(title))throw Object.assign(new Error('Titre objectif obligatoire.'),{status:400});if(employeeId){const emp=employeeRow(employeeId);if(!emp||emp.store_id!==storeId)throw Object.assign(new Error('Employé introuvable dans ce magasin.'),{status:404})}const id=uid('obj');const target=targetValue===null||targetValue===undefined||targetValue===''?null:Number(targetValue);if(target!==null&&!Number.isFinite(target))throw Object.assign(new Error('Cible invalide.'),{status:400});db.prepare(`INSERT INTO employee_objectives(id,store_id,employee_id,role_code,title,metric_code,target_value,unit,period_start,period_end,note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,storeId,employeeId,roleCode?role(roleCode):null,clean(title),clean(metricCode)||null,target,clean(unit)||null,start,end,clean(note)||null,user?.id||null);audit({storeId,userId:user?.id||null,action:'OBJECTIVE_CREATED',entityType:'OBJECTIVE',entityId:id,details:{employeeId,roleCode:roleCode?role(roleCode):null,title:clean(title),targetValue:target,periodStart:start,periodEnd:end}});return objectiveRow(id)}

export function updateObjectiveProgress({objectiveId,user,progressValue,status=null}){const row=objectiveRow(objectiveId);if(!row)throw Object.assign(new Error('Objectif introuvable.'),{status:404,code:'OBJECTIVE_NOT_FOUND'});const progress=progressValue===null||progressValue===undefined||progressValue===''?null:Number(progressValue);if(progress!==null&&!Number.isFinite(progress))throw Object.assign(new Error('Progression invalide.'),{status:400});let next=status?String(status).toUpperCase():row.status;if(!['ACTIVE','COMPLETED','CANCELLED'].includes(next))throw Object.assign(new Error('Statut objectif invalide.'),{status:400});if(row.target_value!==null&&progress!==null&&progress>=Number(row.target_value)&&next==='ACTIVE')next='COMPLETED';db.prepare(`UPDATE employee_objectives SET progress_value=?,status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(progress,next,user?.id||null,objectiveId);audit({storeId:row.store_id,userId:user?.id||null,action:'OBJECTIVE_UPDATED',entityType:'OBJECTIVE',entityId:objectiveId,details:{progressValue:progress,status:next}});return objectiveRow(objectiveId)}

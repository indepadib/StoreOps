import { db,uid,audit,todayISO } from '../db.mjs';
import { createIncident,addAction,incidentById } from './incidents.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS cold_chain_profiles(
 code TEXT PRIMARY KEY,
 label TEXT NOT NULL,
 device_code TEXT NOT NULL,
 temp_min REAL NOT NULL,
 temp_max REAL NOT NULL,
 step_order INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cold_chain_days(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PREPARING' CHECK(status IN ('PREPARING','READY','OPENED')),
 ready_by TEXT NULL REFERENCES users(id),
 ready_at TEXT NULL,
 opened_at TEXT NULL,
 UNIQUE(store_id,business_date)
);
CREATE TABLE IF NOT EXISTS cold_chain_lines(
 id TEXT PRIMARY KEY,
 cold_day_id TEXT NOT NULL REFERENCES cold_chain_days(id) ON DELETE CASCADE,
 profile_code TEXT NOT NULL REFERENCES cold_chain_profiles(code),
 device_code TEXT NOT NULL,
 first_temp REAL NULL,
 second_temp REAL NULL,
 door_ok INTEGER NULL,
 maintenance_signaled INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','MISMATCH','READY')),
 note TEXT NULL,
 incident_id TEXT NULL REFERENCES incidents(id),
 checked_by TEXT NULL REFERENCES users(id),
 checked_at TEXT NULL,
 rechecked_by TEXT NULL REFERENCES users(id),
 rechecked_at TEXT NULL,
 UNIQUE(cold_day_id,profile_code)
);
CREATE INDEX IF NOT EXISTS ix_cold_day_store_date ON cold_chain_days(store_id,business_date,status);
`);
const defaults=[
 ['COLD_ROOM_POS','Chambre froide positive','CF+01',0,4,1],
 ['FRESH_DISPLAY','Meubles frais / PLS','MF+01',0,4,2],
 ['FROZEN_DISPLAY','Surgelés','SG-01',-30,-18,3]
];
const ins=db.prepare(`INSERT OR IGNORE INTO cold_chain_profiles(code,label,device_code,temp_min,temp_max,step_order) VALUES(?,?,?,?,?,?)`);for(const x of defaults)ins.run(...x);
function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
function profile(code){return db.prepare(`SELECT * FROM cold_chain_profiles WHERE code=? AND active=1`).get(code)}
export function coldChainConfig(){return{profiles:db.prepare(`SELECT * FROM cold_chain_profiles WHERE active=1 ORDER BY step_order`).all()}}
function hydrateLine(row){if(!row)return null;const p=profile(row.profile_code),incident=row.incident_id?incidentById(row.incident_id):null;return{...row,profile:p,checked_by_name:userName(row.checked_by),rechecked_by_name:userName(row.rechecked_by),incident}}
function hydrateDay(row){if(!row)return null;const lines=db.prepare(`SELECT * FROM cold_chain_lines WHERE cold_day_id=? ORDER BY rowid`).all(row.id).map(hydrateLine);return{...row,ready_by_name:userName(row.ready_by),lines,metrics:{lines:lines.length,ready:lines.filter(x=>x.status==='READY').length,pending:lines.filter(x=>x.status==='PENDING').length,mismatch:lines.filter(x=>x.status==='MISMATCH').length,openIncidents:lines.filter(x=>x.incident?.status==='OPEN').length}}}
export function coldChainDay(storeId,businessDate=todayISO()){return hydrateDay(db.prepare(`SELECT * FROM cold_chain_days WHERE store_id=? AND business_date=?`).get(storeId,businessDate))}
export function coldChainSummary(storeId,businessDate=todayISO()){const d=coldChainDay(storeId,businessDate);if(!d)return{status:'NOT_STARTED',lines:0,ready:0,pending:0,mismatch:0,openIncidents:0,blocking:1};return{status:d.status,...d.metrics,blocking:['READY','OPENED'].includes(d.status)?0:Math.max(1,d.metrics.pending+d.metrics.mismatch)}}
export function ensureColdChainDay(storeId,businessDate=todayISO()){
 let day=db.prepare(`SELECT * FROM cold_chain_days WHERE store_id=? AND business_date=?`).get(storeId,businessDate);if(!day){const id=uid('cold');db.prepare(`INSERT INTO cold_chain_days(id,store_id,business_date) VALUES(?,?,?)`).run(id,storeId,businessDate);day=db.prepare(`SELECT * FROM cold_chain_days WHERE id=?`).get(id)}
 const stmt=db.prepare(`INSERT OR IGNORE INTO cold_chain_lines(id,cold_day_id,profile_code,device_code) VALUES(?,?,?,?)`);for(const p of db.prepare(`SELECT * FROM cold_chain_profiles WHERE active=1 ORDER BY step_order`).all())stmt.run(uid('coldl'),day.id,p.code,p.device_code);return coldChainDay(storeId,businessDate)
}
function inRange(temp,p){return Number(temp)>=Number(p.temp_min)&&Number(temp)<=Number(p.temp_max)}
function autoCompleteColdTask(day,user){const storeDay=db.prepare(`SELECT id FROM store_days WHERE store_id=? AND business_date=?`).get(day.store_id,day.business_date);if(!storeDay)return;const task=db.prepare(`SELECT * FROM tasks WHERE store_day_id=? AND group_name='opening' AND step_order=4`).get(storeDay.id);if(!task)return;const pos=day.lines.find(x=>x.profile_code==='COLD_ROOM_POS'),neg=day.lines.find(x=>x.profile_code==='FROZEN_DISPLAY'),values={froid_positif:Number(pos?.second_temp??pos?.first_temp??0),froid_negatif:Number(neg?.second_temp??neg?.first_temp??-18)};for(const [code,value] of Object.entries(values)){const f=db.prepare(`SELECT id FROM task_fields WHERE task_id=? AND code=?`).get(task.id,code);if(f)db.prepare(`UPDATE task_fields SET value_json=?,is_nonconform=0 WHERE id=?`).run(JSON.stringify(value),f.id)}db.prepare(`UPDATE tasks SET value_json=?,status='COMPLETED',completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(JSON.stringify(values),user.id,task.id);audit({storeId:day.store_id,businessDate:day.business_date,userId:user.id,action:'COLD_CHAIN_TASK_AUTO_COMPLETED',entityType:'TASK',entityId:task.id,details:{coldDayId:day.id}})}
function refreshDay(dayId,user){let d=hydrateDay(db.prepare(`SELECT * FROM cold_chain_days WHERE id=?`).get(dayId));if(d.lines.length&&d.lines.every(x=>x.status==='READY')){db.prepare(`UPDATE cold_chain_days SET status='READY',ready_by=?,ready_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,dayId);d=hydrateDay(db.prepare(`SELECT * FROM cold_chain_days WHERE id=?`).get(dayId));autoCompleteColdTask(d,user);audit({storeId:d.store_id,businessDate:d.business_date,userId:user.id,action:'COLD_CHAIN_READY',entityType:'COLD_CHAIN_DAY',entityId:d.id});return d}db.prepare(`UPDATE cold_chain_days SET status='PREPARING',ready_by=NULL,ready_at=NULL WHERE id=?`).run(dayId);return hydrateDay(db.prepare(`SELECT * FROM cold_chain_days WHERE id=?`).get(dayId))}
function ensureIncident({row,p,user,temp,doorOk,note}){let inc=row.incident_id?incidentById(row.incident_id):null;if(inc&&inc.status==='OPEN')return inc;inc=createIncident({storeId:row.store_id,user,title:`Chaîne du froid · ${p.label}`,description:`Relevé ${Number(temp).toFixed(1)}°C · attendu ${p.temp_min} à ${p.temp_max}°C${doorOk?'':' · porte/fermeture non conforme'}`,category:'COLD',criticality:'CRITICAL',blockingLevel:'STORE_OPENING',sourceType:'COLD_CHAIN_LINE',sourceId:row.id,assignedTo:user.role==='store_manager'?user.id:null,requiresEvidence:true});addAction({incidentId:inc.id,user,title:'Contrôler porte / alimentation / groupe froid, attendre stabilisation, refaire un relevé et signaler la maintenance si nécessaire',note:note||'',assignedTo:user.role==='store_manager'?user.id:null});db.prepare(`UPDATE cold_chain_lines SET incident_id=? WHERE id=?`).run(inc.id,row.id);return incidentById(inc.id)}
export function checkColdChainLine({lineId,user,temperature,doorOk,note=''}){const row=db.prepare(`SELECT l.*,d.store_id,d.business_date,d.status day_status FROM cold_chain_lines l JOIN cold_chain_days d ON d.id=l.cold_day_id WHERE l.id=?`).get(lineId);if(!row)throw Object.assign(new Error('Zone froid introuvable.'),{status:404});if(row.day_status==='OPENED')throw Object.assign(new Error('Le contrôle froid d’ouverture est verrouillé après ouverture.'),{status:409});const p=profile(row.profile_code),temp=Number(temperature);if(!Number.isFinite(temp))throw Object.assign(new Error('Température obligatoire.'),{status:400});const issues=[];if(!inRange(temp,p))issues.push(`Température ${temp.toFixed(1)}°C hors tolérance ${p.temp_min} à ${p.temp_max}°C.`);if(doorOk!==true)issues.push('Porte / fermeture non conforme.');const st=issues.length?'MISMATCH':'READY';db.prepare(`UPDATE cold_chain_lines SET first_temp=?,door_ok=?,status=?,note=?,checked_by=?,checked_at=CURRENT_TIMESTAMP WHERE id=?`).run(temp,doorOk?1:0,st,note||null,user.id,lineId);if(issues.length)ensureIncident({row:{...row,store_id:row.store_id},p,user,temp,doorOk,note});audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:issues.length?'COLD_CHAIN_MISMATCH':'COLD_CHAIN_READY',entityType:'COLD_CHAIN_LINE',entityId:lineId,details:{temperature:temp,doorOk,issues}});const day=refreshDay(row.cold_day_id,user);return{day,line:day.lines.find(x=>x.id===lineId),issues}}
export function recheckColdChainLine({lineId,user,temperature,doorOk,maintenanceSignaled=false,note=''}){const row=db.prepare(`SELECT l.*,d.store_id,d.business_date,d.status day_status FROM cold_chain_lines l JOIN cold_chain_days d ON d.id=l.cold_day_id WHERE l.id=?`).get(lineId);if(!row)throw Object.assign(new Error('Zone froid introuvable.'),{status:404});if(row.day_status==='OPENED')throw Object.assign(new Error('Le contrôle froid d’ouverture est verrouillé après ouverture.'),{status:409});if(row.first_temp==null)throw Object.assign(new Error('Un premier relevé est requis avant recontrôle.'),{status:409});const p=profile(row.profile_code),temp=Number(temperature);if(!Number.isFinite(temp))throw Object.assign(new Error('Température de recontrôle obligatoire.'),{status:400});const issues=[];if(!inRange(temp,p))issues.push(`Recontrôle ${temp.toFixed(1)}°C hors tolérance ${p.temp_min} à ${p.temp_max}°C.`);if(doorOk!==true)issues.push('Porte / fermeture toujours non conforme.');const st=issues.length?'MISMATCH':'READY';db.prepare(`UPDATE cold_chain_lines SET second_temp=?,door_ok=?,maintenance_signaled=?,status=?,note=?,rechecked_by=?,rechecked_at=CURRENT_TIMESTAMP WHERE id=?`).run(temp,doorOk?1:0,maintenanceSignaled?1:0,st,note||row.note||null,user.id,lineId);if(issues.length)ensureIncident({row:{...row,store_id:row.store_id},p,user,temp,doorOk,note});audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:issues.length?'COLD_CHAIN_RECHECK_MISMATCH':'COLD_CHAIN_RECHECK_READY',entityType:'COLD_CHAIN_LINE',entityId:lineId,details:{temperature:temp,doorOk,maintenanceSignaled,issues}});const day=refreshDay(row.cold_day_id,user);return{day,line:day.lines.find(x=>x.id===lineId),issues}}
export function markColdChainOpened({storeId,businessDate=todayISO(),user}){const d=coldChainDay(storeId,businessDate);if(!d)throw Object.assign(new Error('Contrôle froid introuvable.'),{status:404});if(d.status!=='READY')throw Object.assign(new Error('Toutes les zones froid doivent être conformes avant ouverture.'),{status:409});db.prepare(`UPDATE cold_chain_days SET status='OPENED',opened_at=CURRENT_TIMESTAMP WHERE id=?`).run(d.id);audit({storeId,businessDate,userId:user.id,action:'COLD_CHAIN_OPENED',entityType:'COLD_CHAIN_DAY',entityId:d.id});return coldChainDay(storeId,businessDate)}
export function updateColdProfile({code,user,tempMin,tempMax}){const min=Number(tempMin),max=Number(tempMax);if(!Number.isFinite(min)||!Number.isFinite(max)||min>=max)throw Object.assign(new Error('Plage température invalide.'),{status:400});const p=profile(code);if(!p)throw Object.assign(new Error('Zone froid inconnue.'),{status:404});db.prepare(`UPDATE cold_chain_profiles SET temp_min=?,temp_max=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE code=?`).run(min,max,user.id,code);for(const st of db.prepare(`SELECT id FROM stores WHERE active=1`).all())audit({storeId:st.id,userId:user.id,action:'COLD_CHAIN_PROFILE_UPDATED',entityType:'COLD_CHAIN_PROFILE',entityId:code,details:{tempMin:min,tempMax:max}});return profile(code)}

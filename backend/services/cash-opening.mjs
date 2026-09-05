import { db,uid,audit,todayISO } from '../db.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS cash_opening_policies(
 id TEXT PRIMARY KEY,
 float_tolerance_dh REAL NOT NULL DEFAULT 0.01,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cash_openings(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 source_key TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PREPARING' CHECK(status IN ('PREPARING','READY','OPENED')),
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ready_by TEXT NULL REFERENCES users(id),
 ready_at TEXT NULL,
 opened_at TEXT NULL,
 UNIQUE(store_id,business_date)
);
CREATE TABLE IF NOT EXISTS cash_opening_lines(
 id TEXT PRIMARY KEY,
 opening_id TEXT NOT NULL REFERENCES cash_openings(id) ON DELETE CASCADE,
 till_code TEXT NOT NULL,
 shift_id TEXT NOT NULL,
 expected_float REAL NOT NULL DEFAULT 0,
 cashier_name TEXT NULL,
 declared_float REAL NULL,
 pos_ok INTEGER NULL,
 tpe_ok INTEGER NULL,
 printer_ok INTEGER NULL,
 shift_opened INTEGER NULL,
 float_variance REAL NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','MISMATCH','READY')),
 note TEXT NULL,
 checked_by TEXT NULL REFERENCES users(id),
 checked_at TEXT NULL,
 UNIQUE(opening_id,till_code),
 UNIQUE(opening_id,shift_id)
);
CREATE INDEX IF NOT EXISTS ix_cash_opening_store_date ON cash_openings(store_id,business_date,status);
`);
db.prepare(`INSERT OR IGNORE INTO cash_opening_policies(id,float_tolerance_dh) VALUES('default',0.01)`).run();
const round=v=>Math.round(Number(v||0)*100)/100;
function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
export function cashOpeningPolicy(){return db.prepare(`SELECT * FROM cash_opening_policies WHERE id='default'`).get()}
export function cashOpeningConfig(){return{policy:cashOpeningPolicy()}}
function hydrateLine(row){return row?{...row,checked_by_name:userName(row.checked_by)}:null}
function hydrate(row){
 if(!row)return null;const lines=db.prepare(`SELECT * FROM cash_opening_lines WHERE opening_id=? ORDER BY till_code`).all(row.id).map(hydrateLine),ready=lines.filter(x=>x.status==='READY').length;
 return{...row,ready_by_name:userName(row.ready_by),lines,metrics:{lines:lines.length,ready,pending:lines.filter(x=>x.status==='PENDING').length,mismatch:lines.filter(x=>x.status==='MISMATCH').length,expectedFloat:round(lines.reduce((s,x)=>s+Number(x.expected_float||0),0)),declaredFloat:round(lines.reduce((s,x)=>s+Number(x.declared_float||0),0)),floatVariance:round(lines.reduce((s,x)=>s+Number(x.float_variance||0),0))}};
}
export function cashOpening(storeId,businessDate=todayISO()){return hydrate(db.prepare(`SELECT * FROM cash_openings WHERE store_id=? AND business_date=?`).get(storeId,businessDate))}
export function cashOpeningById(id){return hydrate(db.prepare(`SELECT * FROM cash_openings WHERE id=?`).get(id))}
export function cashOpeningSummary(storeId,businessDate=todayISO()){
 const o=cashOpening(storeId,businessDate);if(!o)return{status:'NOT_STARTED',lines:0,ready:0,pending:0,mismatch:0,blocking:1,expectedFloat:0,declaredFloat:0,floatVariance:0};
 return{status:o.status,...o.metrics,blocking:['READY','OPENED'].includes(o.status)?0:Math.max(1,o.metrics.pending+o.metrics.mismatch)};
}
export function syncCashOpening({storeId,businessDate=todayISO(),snapshot}){
 if(!snapshot?.sourceKey||!Array.isArray(snapshot.lines))throw Object.assign(new Error('Snapshot préparation caisses Dynamics invalide.'),{status:502});
 let opening=db.prepare(`SELECT * FROM cash_openings WHERE store_id=? AND business_date=?`).get(storeId,businessDate);
 if(!opening){const id=uid('cashopen');db.prepare(`INSERT INTO cash_openings(id,store_id,business_date,source_key,status) VALUES(?,?,?,?,'PREPARING')`).run(id,storeId,businessDate,snapshot.sourceKey);opening=db.prepare(`SELECT * FROM cash_openings WHERE id=?`).get(id)}
 const stmt=db.prepare(`INSERT OR IGNORE INTO cash_opening_lines(id,opening_id,till_code,shift_id,expected_float) VALUES(?,?,?,?,?)`);
 for(const l of snapshot.lines||[]){if(!l.tillCode||!l.shiftId)continue;stmt.run(uid('cashol'),opening.id,String(l.tillCode),String(l.shiftId),round(l.expectedFloat||0))}
 db.prepare(`UPDATE cash_openings SET synced_at=CURRENT_TIMESTAMP WHERE id=?`).run(opening.id);return cashOpeningById(opening.id);
}
function autoCompleteOpeningTask(opening,user){
 const day=db.prepare(`SELECT id FROM store_days WHERE store_id=? AND business_date=?`).get(opening.store_id,opening.business_date);if(!day)return;
 const task=db.prepare(`SELECT * FROM tasks WHERE store_day_id=? AND group_name='opening' AND step_order=7`).get(day.id);if(!task)return;
 const values={affectation:true,fonds:true,shifts:true};
 for(const [code,value] of Object.entries(values)){const f=db.prepare(`SELECT id FROM task_fields WHERE task_id=? AND code=?`).get(task.id,code);if(f)db.prepare(`UPDATE task_fields SET value_json=?,is_nonconform=0 WHERE id=?`).run(JSON.stringify(value),f.id)}
 db.prepare(`UPDATE tasks SET value_json=?,status='COMPLETED',completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(JSON.stringify(values),user.id,task.id);
 audit({storeId:opening.store_id,businessDate:opening.business_date,userId:user.id,action:'CASH_OPENING_TASK_AUTO_COMPLETED',entityType:'TASK',entityId:task.id,details:{cashOpeningId:opening.id}});
}
function refreshOpeningStatus(openingId,user){
 const o=cashOpeningById(openingId);if(!o)return null;
 if(o.lines.length&&o.metrics.ready===o.lines.length){db.prepare(`UPDATE cash_openings SET status='READY',ready_by=?,ready_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,openingId);const ready=cashOpeningById(openingId);autoCompleteOpeningTask(ready,user);audit({storeId:ready.store_id,businessDate:ready.business_date,userId:user.id,action:'CASH_OPENING_READY',entityType:'CASH_OPENING',entityId:openingId,details:{metrics:ready.metrics}});return ready}
 db.prepare(`UPDATE cash_openings SET status='PREPARING',ready_by=NULL,ready_at=NULL WHERE id=?`).run(openingId);return cashOpeningById(openingId);
}
export function checkCashOpeningLine({lineId,user,cashierName,declaredFloat,posOk,tpeOk,printerOk,shiftOpened,note=''}){
 const row=db.prepare(`SELECT l.*,o.store_id,o.business_date,o.status opening_status FROM cash_opening_lines l JOIN cash_openings o ON o.id=l.opening_id WHERE l.id=?`).get(lineId);if(!row)throw Object.assign(new Error('Caisse d’ouverture introuvable.'),{status:404});
 if(row.opening_status==='OPENED')throw Object.assign(new Error('La préparation des caisses est verrouillée après ouverture magasin.'),{status:409});
 if(!String(cashierName||'').trim())throw Object.assign(new Error('Caissier obligatoire.'),{status:400});
 const declared=Number(declaredFloat);if(!Number.isFinite(declared)||declared<0)throw Object.assign(new Error('Fond de caisse déclaré invalide.'),{status:400});
 const variance=round(declared-Number(row.expected_float||0)),tol=Number(cashOpeningPolicy().float_tolerance_dh||0.01),issues=[];
 if(Math.abs(variance)>tol)issues.push(`Fond déclaré ${declared.toFixed(2)} DH ≠ attendu ${Number(row.expected_float).toFixed(2)} DH.`);
 if(posOk!==true)issues.push('POS non opérationnel.');if(tpeOk!==true)issues.push('TPE non opérationnel.');if(printerOk!==true)issues.push('Imprimante ticket non opérationnelle.');if(shiftOpened!==true)issues.push('Shift Dynamics non ouvert.');
 const status=issues.length?'MISMATCH':'READY';
 db.prepare(`UPDATE cash_opening_lines SET cashier_name=?,declared_float=?,pos_ok=?,tpe_ok=?,printer_ok=?,shift_opened=?,float_variance=?,status=?,note=?,checked_by=?,checked_at=CURRENT_TIMESTAMP WHERE id=?`).run(String(cashierName).trim(),declared,posOk?1:0,tpeOk?1:0,printerOk?1:0,shiftOpened?1:0,variance,status,note||null,user.id,lineId);
 audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:issues.length?'CASH_OPENING_LINE_MISMATCH':'CASH_OPENING_LINE_READY',entityType:'CASH_OPENING_LINE',entityId:lineId,details:{tillCode:row.till_code,shiftId:row.shift_id,cashierName,declaredFloat:declared,expectedFloat:row.expected_float,variance,posOk,tpeOk,printerOk,shiftOpened,issues}});
 const opening=refreshOpeningStatus(row.opening_id,user);return{opening,line:opening.lines.find(x=>x.id===lineId),issues};
}
export function markCashOpeningOpened({storeId,businessDate=todayISO(),user}){const o=cashOpening(storeId,businessDate);if(!o)throw Object.assign(new Error('Préparation caisses introuvable.'),{status:404});if(o.status!=='READY')throw Object.assign(new Error('Les caisses doivent être prêtes avant ouverture.'),{status:409});db.prepare(`UPDATE cash_openings SET status='OPENED',opened_at=CURRENT_TIMESTAMP WHERE id=?`).run(o.id);audit({storeId,businessDate,userId:user.id,action:'CASH_OPENING_OPENED',entityType:'CASH_OPENING',entityId:o.id});return cashOpeningById(o.id)}
export function updateCashOpeningPolicy({user,floatTolerance}){const t=Number(floatTolerance);if(!Number.isFinite(t)||t<0||t>10)throw Object.assign(new Error('Tolérance fond de caisse invalide (0 à 10 DH).'),{status:400});db.prepare(`UPDATE cash_opening_policies SET float_tolerance_dh=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(t,user.id);for(const st of db.prepare(`SELECT id FROM stores WHERE active=1`).all())audit({storeId:st.id,userId:user.id,action:'CASH_OPENING_POLICY_UPDATED',entityType:'CASH_OPENING_POLICY',entityId:'default',details:{floatTolerance:t}});return cashOpeningPolicy()}

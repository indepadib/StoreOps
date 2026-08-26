import { db, uid, audit, todayISO } from '../db.mjs';

// Safe V1.4.4 migration for existing prototype databases.
db.exec(`
CREATE TABLE IF NOT EXISTS handover_items (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  source_business_date TEXT NOT NULL,
  target_business_date TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  category TEXT NOT NULL DEFAULT 'OPERATIONS',
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  blocking_opening INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED','CANCELLED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_by TEXT NULL REFERENCES users(id),
  acknowledged_at TEXT NULL,
  resolved_by TEXT NULL REFERENCES users(id),
  resolved_at TEXT NULL,
  resolution_note TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_handover_store_target ON handover_items(store_id,target_business_date,status,priority);
`);

function ensureColumn(table,column,definition){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all();
  if(!cols.some(c=>c.name===column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('store_days','opening_started_at','TEXT NULL');
ensureColumn('store_days','closing_started_at','TEXT NULL');
ensureColumn('store_days','handover_reviewed_at','TEXT NULL');
ensureColumn('store_days','handover_reviewed_by','TEXT NULL');

function addDaysISO(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function hydrate(row){
  if(!row)return null;
  const creator=db.prepare(`SELECT name FROM users WHERE id=?`).get(row.created_by)?.name||null;
  const ack=row.acknowledged_by?db.prepare(`SELECT name FROM users WHERE id=?`).get(row.acknowledged_by)?.name:null;
  const resolver=row.resolved_by?db.prepare(`SELECT name FROM users WHERE id=?`).get(row.resolved_by)?.name:null;
  return {...row,created_by_name:creator,acknowledged_by_name:ack,resolved_by_name:resolver};
}
export function createHandover({storeId,businessDate=todayISO(),user,title,description='',category='OPERATIONS',priority='NORMAL',blockingOpening=false,targetDate=null}){
  if(!title?.trim())throw Object.assign(new Error('Sujet de passation obligatoire.'),{status:400});
  const allowedPriority=['LOW','NORMAL','HIGH','CRITICAL'];if(!allowedPriority.includes(priority))priority='NORMAL';
  const id=uid('ho'),target=targetDate||addDaysISO(businessDate,1);
  db.prepare(`INSERT INTO handover_items(id,store_id,source_business_date,target_business_date,title,description,category,priority,blocking_opening,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,'OPEN',?)`)
    .run(id,storeId,businessDate,target,title.trim(),description||null,category||'OPERATIONS',priority,blockingOpening?1:0,user.id);
  audit({storeId,businessDate,userId:user.id,action:'HANDOVER_CREATED',entityType:'HANDOVER',entityId:id,details:{title,category,priority,targetDate:target,blockingOpening:!!blockingOpening}});
  return hydrate(db.prepare(`SELECT * FROM handover_items WHERE id=?`).get(id));
}
export function listHandover(storeId,{businessDate=todayISO(),status='ACTIVE'}={}){
  let rows;
  if(status==='ALL') rows=db.prepare(`SELECT * FROM handover_items WHERE store_id=? ORDER BY target_business_date DESC,created_at DESC`).all(storeId);
  else rows=db.prepare(`SELECT * FROM handover_items WHERE store_id=? AND target_business_date<=? AND status IN ('OPEN','ACKNOWLEDGED') ORDER BY CASE priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,target_business_date,created_at`).all(storeId,businessDate);
  return rows.map(hydrate);
}
export function acknowledgeHandover({id,user}){
  const row=db.prepare(`SELECT * FROM handover_items WHERE id=?`).get(id);if(!row)throw Object.assign(new Error('Passation introuvable.'),{status:404});
  if(row.status==='RESOLVED'||row.status==='CANCELLED')return hydrate(row);
  db.prepare(`UPDATE handover_items SET status='ACKNOWLEDGED',acknowledged_by=?,acknowledged_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,id);
  audit({storeId:row.store_id,userId:user.id,action:'HANDOVER_ACKNOWLEDGED',entityType:'HANDOVER',entityId:id,details:{sourceDate:row.source_business_date,targetDate:row.target_business_date}});
  return hydrate(db.prepare(`SELECT * FROM handover_items WHERE id=?`).get(id));
}
export function resolveHandover({id,user,note=''}){
  const row=db.prepare(`SELECT * FROM handover_items WHERE id=?`).get(id);if(!row)throw Object.assign(new Error('Passation introuvable.'),{status:404});
  if(row.status==='RESOLVED')return hydrate(row);
  db.prepare(`UPDATE handover_items SET status='RESOLVED',resolved_by=?,resolved_at=CURRENT_TIMESTAMP,resolution_note=? WHERE id=?`).run(user.id,note||null,id);
  audit({storeId:row.store_id,userId:user.id,action:'HANDOVER_RESOLVED',entityType:'HANDOVER',entityId:id,details:{note}});
  return hydrate(db.prepare(`SELECT * FROM handover_items WHERE id=?`).get(id));
}
export function reviewClosingHandover({storeDay,user}){
  db.prepare(`UPDATE store_days SET handover_reviewed_at=CURRENT_TIMESTAMP,handover_reviewed_by=? WHERE id=?`).run(user.id,storeDay.id);
  audit({storeId:storeDay.store_id,businessDate:storeDay.business_date,userId:user.id,action:'HANDOVER_REVIEWED',entityType:'STORE_DAY',entityId:storeDay.id});
  return db.prepare(`SELECT * FROM store_days WHERE id=?`).get(storeDay.id);
}
export function handoverStats(storeId,businessDate=todayISO()){
  const rows=listHandover(storeId,{businessDate});
  return {pending:rows.length,critical:rows.filter(x=>x.priority==='CRITICAL').length,high:rows.filter(x=>['HIGH','CRITICAL'].includes(x.priority)).length,blocking:rows.filter(x=>x.blocking_opening&&x.status!=='RESOLVED').length,unacknowledged:rows.filter(x=>x.status==='OPEN').length};
}
export function blockingHandoverCount(storeId,businessDate=todayISO()){
  return db.prepare(`SELECT COUNT(*) n FROM handover_items WHERE store_id=? AND target_business_date<=? AND blocking_opening=1 AND status!='RESOLVED' AND status!='CANCELLED'`).get(storeId,businessDate).n;
}
export function dayCycleMetrics(storeDay){
  const minutes=(a,b)=>{if(!a||!b)return null;return Math.max(0,Math.round((new Date(String(b).replace(' ','T')+'Z')-new Date(String(a).replace(' ','T')+'Z'))/60000))};
  return {openingDurationMinutes:minutes(storeDay.opening_started_at,storeDay.opened_at),closingDurationMinutes:minutes(storeDay.closing_started_at,storeDay.closed_at),handoverReviewed:!!storeDay.handover_reviewed_at};
}

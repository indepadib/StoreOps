import { db } from '../db.mjs';

const PILOT_STORE_ID='val-fleuri';
const PILOT_MANAGER_ID='u-vf';

function ensureColumn(table,column,definition){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all();
  if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn('users','dynamics_email','TEXT NULL');

db.exec(`
CREATE TABLE IF NOT EXISTS store_terminals(
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  till_code TEXT NOT NULL,
  label TEXT NOT NULL,
  tpe_mode TEXT NOT NULL CHECK(tpe_mode IN ('INTEGRATED','MANUAL','NONE')),
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(store_id,till_code)
);
`);

// Val Fleuri is the first operational StoreOps pilot.
db.prepare(`UPDATE stores SET opening_time='08:00',closing_time='23:00',active=1 WHERE id=?`).run(PILOT_STORE_ID);
db.prepare(`UPDATE users SET name='Ayoub Nachiti',role='store_manager',store_id=?,active=1 WHERE id=?`).run(PILOT_STORE_ID,PILOT_MANAGER_ID);

const appEmail=String(process.env.STOREOPS_VF_MANAGER_EMAIL||'').trim().toLowerCase();
const dynamicsEmail=String(process.env.STOREOPS_VF_D365_EMAIL||'').trim().toLowerCase();
if(appEmail)db.prepare(`UPDATE users SET email=? WHERE id=?`).run(appEmail,PILOT_MANAGER_ID);
if(dynamicsEmail)db.prepare(`UPDATE users SET dynamics_email=? WHERE id=?`).run(dynamicsEmail,PILOT_MANAGER_ID);

const terminal=db.prepare(`INSERT INTO store_terminals(id,store_id,till_code,label,tpe_mode,active)
VALUES(?,?,?,?,?,1)
ON CONFLICT(store_id,till_code) DO UPDATE SET label=excluded.label,tpe_mode=excluded.tpe_mode,active=1`);
terminal.run('vf-c01',PILOT_STORE_ID,'C01','Caisse 1','INTEGRATED');
terminal.run('vf-c02',PILOT_STORE_ID,'C02','Caisse 2','MANUAL');

export function storeTerminals(storeId){
  return db.prepare(`SELECT id,store_id,till_code,label,tpe_mode,active FROM store_terminals WHERE store_id=? AND active=1 ORDER BY till_code`).all(storeId);
}

export function storeOperatingProfile(storeId){
  const store=db.prepare(`SELECT id,name,code,opening_time,closing_time,active FROM stores WHERE id=?`).get(storeId);
  if(!store)return null;
  const manager=db.prepare(`SELECT id,name,role,store_id,dynamics_email FROM users WHERE role='store_manager' AND store_id=? AND active=1 ORDER BY id LIMIT 1`).get(storeId)||null;
  return {store,manager,terminals:storeTerminals(storeId),pilot:storeId===PILOT_STORE_ID};
}

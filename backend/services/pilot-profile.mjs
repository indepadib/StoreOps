import { db } from '../db.mjs';

const PILOT_STORE_ID='val-fleuri';
const PILOT_MANAGER_ID='u-vf';
const OPS_DIRECTOR_ID='u-ops';

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
  expected_float REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(store_id,till_code)
);
`);
ensureColumn('store_terminals','expected_float','REAL NOT NULL DEFAULT 0');

// Val Fleuri is the first operational StoreOps pilot.
db.prepare(`UPDATE stores SET opening_time='08:00',closing_time='23:00',active=1 WHERE id=?`).run(PILOT_STORE_ID);
db.prepare(`UPDATE users SET name='Ayoub Nachiti',role='store_manager',store_id=?,active=1 WHERE id=?`).run(PILOT_STORE_ID,PILOT_MANAGER_ID);
db.prepare(`UPDATE users SET name=?,role='ops_director',store_id=NULL,active=1 WHERE id=?`).run(String(process.env.STOREOPS_OPS_DIRECTOR_NAME||'Mourad').trim()||'Mourad',OPS_DIRECTOR_ID);

const appEmail=String(process.env.STOREOPS_VF_MANAGER_EMAIL||'').trim().toLowerCase();
const dynamicsEmail=String(process.env.STOREOPS_VF_D365_EMAIL||'').trim().toLowerCase();
const opsEmail=String(process.env.STOREOPS_OPS_DIRECTOR_EMAIL||'').trim().toLowerCase();
if(appEmail)db.prepare(`UPDATE users SET email=? WHERE id=?`).run(appEmail,PILOT_MANAGER_ID);
if(dynamicsEmail)db.prepare(`UPDATE users SET dynamics_email=? WHERE id=?`).run(dynamicsEmail,PILOT_MANAGER_ID);
if(opsEmail)db.prepare(`UPDATE users SET email=? WHERE id=?`).run(opsEmail,OPS_DIRECTOR_ID);

const terminal=db.prepare(`INSERT INTO store_terminals(id,store_id,till_code,label,tpe_mode,expected_float,active)
VALUES(?,?,?,?,?,?,1)
ON CONFLICT(store_id,till_code) DO UPDATE SET label=excluded.label,tpe_mode=excluded.tpe_mode,expected_float=excluded.expected_float,active=1`);
terminal.run('vf-c01',PILOT_STORE_ID,'C01','Caisse 1','INTEGRATED',1000);
terminal.run('vf-c02',PILOT_STORE_ID,'C02','Caisse 2','MANUAL',1000);

export function storeTerminals(storeId){
  return db.prepare(`SELECT id,store_id,till_code,label,tpe_mode,expected_float,active FROM store_terminals WHERE store_id=? AND active=1 ORDER BY till_code`).all(storeId);
}

export function storeOperatingProfile(storeId){
  const store=db.prepare(`SELECT id,name,code,opening_time,closing_time,active FROM stores WHERE id=?`).get(storeId);
  if(!store)return null;
  const manager=db.prepare(`SELECT id,name,role,store_id,dynamics_email FROM users WHERE role='store_manager' AND store_id=? AND active=1 ORDER BY id LIMIT 1`).get(storeId)||null;
  return {store,manager,terminals:storeTerminals(storeId),pilot:storeId===PILOT_STORE_ID};
}

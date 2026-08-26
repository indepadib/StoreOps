import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.STOREOPS_DB || new URL('./storeops.db', import.meta.url).pathname;
mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  opening_time TEXT NOT NULL DEFAULT '08:00',
  closing_time TEXT NOT NULL DEFAULT '22:00',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('store_manager','ops_director','employee')),
  store_id TEXT NULL REFERENCES stores(id)
);
CREATE TABLE IF NOT EXISTS store_days (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  business_date TEXT NOT NULL,
  opening_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  closing_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  opening_owner_id TEXT NULL REFERENCES users(id),
  closing_owner_id TEXT NULL REFERENCES users(id),
  opened_at TEXT NULL,
  closed_at TEXT NULL,
  UNIQUE(store_id,business_date)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  store_day_id TEXT NOT NULL REFERENCES store_days(id),
  group_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  criticality TEXT NOT NULL DEFAULT 'LOW',
  blocking_level TEXT NOT NULL DEFAULT 'NONE',
  status TEXT NOT NULL DEFAULT 'OPEN',
  assigned_role TEXT NULL,
  value_json TEXT NULL,
  completed_by TEXT NULL REFERENCES users(id),
  completed_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL REFERENCES stores(id),
  business_date TEXT NOT NULL,
  user_id TEXT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dlc_records (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  ean TEXT NOT NULL,
  product_name TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  quantity REAL NOT NULL CHECK(quantity >= 0),
  zone TEXT NOT NULL,
  lot_ref TEXT NULL,
  comment TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  ack_stage TEXT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quality_controls (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  context TEXT NOT NULL,
  po_number TEXT NULL,
  ean TEXT NOT NULL,
  product_name TEXT NOT NULL,
  ordered_qty REAL NULL,
  delivered_qty REAL NOT NULL,
  accepted_qty REAL NOT NULL,
  rejected_qty REAL NOT NULL,
  temperature REAL NULL,
  packaging_status TEXT NOT NULL DEFAULT 'NA',
  appearance_status TEXT NOT NULL DEFAULT 'NA',
  expiry_date TEXT NULL,
  lot_ref TEXT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('ACCEPT','PARTIAL','REJECT')),
  comment TEXT NULL,
  controlled_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ABS((accepted_qty + rejected_qty) - delivered_qty) < 0.0001)
);
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  po_number TEXT NOT NULL UNIQUE,
  vendor TEXT NOT NULL,
  eta TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'EXPECTED',
  posted_at TEXT NULL
);
CREATE TABLE IF NOT EXISTS receipt_lines (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(id),
  ean TEXT NOT NULL,
  product_name TEXT NOT NULL,
  ordered_qty REAL NOT NULL,
  delivered_qty REAL NULL,
  accepted_qty REAL NULL,
  rejected_qty REAL NULL,
  quality_control_id TEXT NULL REFERENCES quality_controls(id),
  temperature_required INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  criticality TEXT NOT NULL,
  blocking_level TEXT NOT NULL DEFAULT 'NONE',
  status TEXT NOT NULL DEFAULT 'OPEN',
  source_type TEXT NULL,
  source_id TEXT NULL,
  created_by TEXT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT NULL
);
`);

const stores = [
  ['val-fleuri','Val Fleuri','VF'],
  ['trefle','Trèfle','TR'],
  ['zeraoui','Zeraoui','ZE'],
  ['sindibad','Sindibad','SI'],
  ['carita','Carita','CA']
];
const insStore = db.prepare(`INSERT OR IGNORE INTO stores(id,name,code) VALUES(?,?,?)`);
for (const s of stores) insStore.run(...s);

const users = [
  ['u-vf','Responsable Val Fleuri','store_manager','val-fleuri'],
  ['u-tr','Responsable Trèfle','store_manager','trefle'],
  ['u-ze','Responsable Zeraoui','store_manager','zeraoui'],
  ['u-si','Responsable Sindibad','store_manager','sindibad'],
  ['u-ca','Responsable Carita','store_manager','carita'],
  ['u-ops','Directeur Exploitation','ops_director',null],
  ['u-emp-vf','Employé Val Fleuri','employee','val-fleuri']
];
const insUser = db.prepare(`INSERT OR IGNORE INTO users(id,name,role,store_id) VALUES(?,?,?,?)`);
for (const u of users) insUser.run(...u);

export function todayISO(){ return new Date().toISOString().slice(0,10); }
export function uid(prefix='id'){ return `${prefix}_${crypto.randomUUID()}`; }

export function ensureStoreDay(storeId, businessDate=todayISO()){
  const id = `${storeId}_${businessDate}`;
  db.prepare(`INSERT OR IGNORE INTO store_days(id,store_id,business_date) VALUES(?,?,?)`).run(id,storeId,businessDate);
  const existingTasks = db.prepare(`SELECT COUNT(*) n FROM tasks WHERE store_day_id=?`).get(id).n;
  if (!existingTasks) seedOpeningClosingTasks(id);
  return db.prepare(`SELECT * FROM store_days WHERE id=?`).get(id);
}

function seedOpeningClosingTasks(storeDayId){
  const tasks = [
    ['opening','Équipe présente et responsable identifié','HIGH','MEDIUM','PROCESS'],
    ['opening','Sécurité des accès et issues de secours','HIGH','CRITICAL','STORE_OPENING'],
    ['opening','Réseau, POS, TPE, imprimantes et balances','HIGH','HIGH','PROCESS'],
    ['opening','Températures froid positif et négatif','HIGH','CRITICAL','STORE_OPENING'],
    ['opening','Rayons, fraîcheur, remplissage et FEFO','NORMAL','MEDIUM','PROCESS'],
    ['opening','Prix, promotions et nouveaux balisages du jour','HIGH','HIGH','PROCESS'],
    ['opening','Affectation caissiers, fonds et shifts ouverts','HIGH','CRITICAL','STORE_OPENING'],
    ['closing','Tour commerce et remise en état','NORMAL','MEDIUM','PROCESS'],
    ['closing','DLC critiques, frais et températures fin de journée','HIGH','HIGH','PROCESS'],
    ['closing','Clôture shifts, espèces, TPE et statement','HIGH','CRITICAL','STORE_CLOSING'],
    ['closing','Réceptions postées et anomalies stock traitées','NORMAL','HIGH','PROCESS'],
    ['closing','Technique, éclairage et équipements sécurisés','NORMAL','MEDIUM','PROCESS'],
    ['closing','Portes, alarme, réserve et accès sécurisés','HIGH','CRITICAL','STORE_CLOSING']
  ];
  const stmt=db.prepare(`INSERT INTO tasks(id,store_day_id,group_name,title,priority,criticality,blocking_level) VALUES(?,?,?,?,?,?,?)`);
  for(const [group,title,p,c,b] of tasks) stmt.run(uid('task'),storeDayId,group,title,p,c,b);
}

export function audit({storeId,businessDate=todayISO(),userId,action,entityType,entityId,details={}}){
  db.prepare(`INSERT INTO audit_log(store_id,business_date,user_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)`)
    .run(storeId,businessDate,userId||null,action,entityType,entityId,JSON.stringify(details));
}

export function seedReceipts(){
  const n = db.prepare(`SELECT COUNT(*) n FROM receipts`).get().n;
  if(n) return;
  const r1='rcpt_vf_10482';
  db.prepare(`INSERT INTO receipts(id,store_id,po_number,vendor,eta) VALUES(?,?,?,?,?)`).run(r1,'val-fleuri','PO-10482','Centrale Frais','10:30');
  const line=db.prepare(`INSERT INTO receipt_lines(id,receipt_id,ean,product_name,ordered_qty,temperature_required) VALUES(?,?,?,?,?,?)`);
  line.run(uid('rl'),r1,'6111040001111','Lait frais entier 1L',24,1);
  line.run(uid('rl'),r1,'3274080005003','Yaourt nature 4x110g',36,1);
  line.run(uid('rl'),r1,'3017620422003','Nutella 750g',12,0);
  const r2='rcpt_tr_20411';
  db.prepare(`INSERT INTO receipts(id,store_id,po_number,vendor,eta) VALUES(?,?,?,?,?)`).run(r2,'trefle','PO-20411','Fournisseur Épicerie','14:00');
  line.run(uid('rl'),r2,'3017620422003','Nutella 750g',18,0);
}
seedReceipts();

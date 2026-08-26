import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.STOREOPS_DB || new URL('./storeops.db', import.meta.url).pathname;
mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

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
  email TEXT NULL UNIQUE,
  entra_oid TEXT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('store_manager','ops_director','employee')),
  store_id TEXT NULL REFERENCES stores(id),
  active INTEGER NOT NULL DEFAULT 1
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
  step_order INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS task_fields (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  input_type TEXT NOT NULL CHECK(input_type IN ('BOOLEAN','NUMBER','TEXT','SELECT','MONEY')),
  required INTEGER NOT NULL DEFAULT 1,
  unit TEXT NULL,
  min_value REAL NULL,
  max_value REAL NULL,
  options_json TEXT NULL,
  fail_when_json TEXT NULL,
  value_json TEXT NULL,
  is_nonconform INTEGER NOT NULL DEFAULT 0,
  UNIQUE(task_id,code)
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
CREATE TABLE IF NOT EXISTS quality_profiles (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  temperature_required INTEGER NOT NULL DEFAULT 0,
  temp_min REAL NULL,
  temp_max REAL NULL,
  packaging_required INTEGER NOT NULL DEFAULT 1,
  appearance_required INTEGER NOT NULL DEFAULT 0,
  expiry_required INTEGER NOT NULL DEFAULT 0,
  lot_required INTEGER NOT NULL DEFAULT 0,
  photo_on_nonconform INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS quality_controls (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id),
  context TEXT NOT NULL,
  po_number TEXT NULL,
  ean TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT NULL,
  ordered_qty REAL NULL,
  delivered_qty REAL NOT NULL,
  accepted_qty REAL NOT NULL,
  rejected_qty REAL NOT NULL,
  temperature REAL NULL,
  temperature_status TEXT NULL,
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
  category TEXT NULL,
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
CREATE INDEX IF NOT EXISTS ix_audit_store_date ON audit_log(store_id,business_date,created_at);
CREATE INDEX IF NOT EXISTS ix_dlc_store_expiry ON dlc_records(store_id,status,expiry_date);
CREATE INDEX IF NOT EXISTS ix_quality_store_date ON quality_controls(store_id,created_at);
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
  ['u-vf','Responsable Val Fleuri',null,null,'store_manager','val-fleuri'],
  ['u-tr','Responsable Trèfle',null,null,'store_manager','trefle'],
  ['u-ze','Responsable Zeraoui',null,null,'store_manager','zeraoui'],
  ['u-si','Responsable Sindibad',null,null,'store_manager','sindibad'],
  ['u-ca','Responsable Carita',null,null,'store_manager','carita'],
  ['u-ops','Directeur Exploitation',null,null,'ops_director',null],
  ['u-emp-vf','Employé Val Fleuri',null,null,'employee','val-fleuri']
];
const insUser = db.prepare(`INSERT OR IGNORE INTO users(id,name,email,entra_oid,role,store_id) VALUES(?,?,?,?,?,?)`);
for (const u of users) insUser.run(...u);

const profiles=[
  ['qp-frais','Frais','Produits frais',1,0,4,1,1,1,0,1],
  ['qp-surgele','Surgelé','Produits surgelés',1,-30,-18,1,1,1,0,1],
  ['qp-fl','F&L','Fruits & légumes',0,null,null,1,1,0,0,1],
  ['qp-epicerie','Épicerie','Épicerie',0,null,null,1,0,1,0,1],
  ['qp-default','Autre','Contrôle standard',0,null,null,1,0,0,0,1]
];
const qp=db.prepare(`INSERT OR IGNORE INTO quality_profiles(id,category,label,temperature_required,temp_min,temp_max,packaging_required,appearance_required,expiry_required,lot_required,photo_on_nonconform) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
for(const p of profiles) qp.run(...p);

export function todayISO(){ return new Date().toISOString().slice(0,10); }
export function uid(prefix='id'){ return `${prefix}_${crypto.randomUUID()}`; }

export function ensureStoreDay(storeId, businessDate=todayISO()){
  const id = `${storeId}_${businessDate}`;
  db.prepare(`INSERT OR IGNORE INTO store_days(id,store_id,business_date) VALUES(?,?,?)`).run(id,storeId,businessDate);
  const existingTasks = db.prepare(`SELECT COUNT(*) n FROM tasks WHERE store_day_id=?`).get(id).n;
  if (!existingTasks) seedOpeningClosingTasks(id);
  return db.prepare(`SELECT * FROM store_days WHERE id=?`).get(id);
}

function addField(taskId,code,label,type,{required=1,unit=null,min=null,max=null,options=null,failWhen=null}={}){
  db.prepare(`INSERT OR IGNORE INTO task_fields(id,task_id,code,label,input_type,required,unit,min_value,max_value,options_json,fail_when_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uid('tf'),taskId,code,label,type,required,unit,min,max,options?JSON.stringify(options):null,failWhen?JSON.stringify(failWhen):null);
}

function seedOpeningClosingTasks(storeDayId){
  const defs = [
    ['opening',1,'Équipe et prise de poste','Présences, responsable d’ouverture et capacité minimale à ouvrir.','HIGH','MEDIUM','PROCESS'],
    ['opening',2,'Sécurité des accès','Contrôle physique des accès, issues et caméras.','HIGH','CRITICAL','STORE_OPENING'],
    ['opening',3,'Technique & équipements','Réseau, POS, TPE, imprimantes et balances.','HIGH','HIGH','PROCESS'],
    ['opening',4,'Chaîne du froid','Relevés chiffrés froid positif et négatif.','HIGH','CRITICAL','STORE_OPENING'],
    ['opening',5,'Surface de vente','Propreté, remplissage, fraîcheur et FEFO.','NORMAL','MEDIUM','PROCESS'],
    ['opening',6,'Prix, promos & nouveautés','Tous les changements commerciaux du jour sont exécutés.','HIGH','HIGH','PROCESS'],
    ['opening',7,'Caisses prêtes','Affectation, fonds et shifts opérationnels.','HIGH','CRITICAL','STORE_OPENING'],
    ['closing',1,'Tour commerce','Surface remise en état et clients sortis.','NORMAL','MEDIUM','PROCESS'],
    ['closing',2,'DLC, frais & froid','DLC critiques traitées et températures de fin de journée.','HIGH','HIGH','PROCESS'],
    ['closing',3,'Clôture caisses','Shifts, espèces, TPE, CA et statement rapprochés.','HIGH','CRITICAL','STORE_CLOSING'],
    ['closing',4,'Stock & réceptions','Réceptions postées et anomalies stock identifiées.','NORMAL','HIGH','PROCESS'],
    ['closing',5,'Technique','Équipements et éclairage mis en sécurité.','NORMAL','MEDIUM','PROCESS'],
    ['closing',6,'Sécurité finale','Portes, alarme, réserve et accès sécurisés.','HIGH','CRITICAL','STORE_CLOSING']
  ];
  const stmt=db.prepare(`INSERT INTO tasks(id,store_day_id,group_name,step_order,title,description,priority,criticality,blocking_level) VALUES(?,?,?,?,?,?,?,?,?)`);
  const taskIds={};
  for(const [group,order,title,desc,p,c,b] of defs){const id=uid('task');stmt.run(id,storeDayId,group,order,title,desc,p,c,b);taskIds[`${group}:${order}`]=id}

  let t=taskIds['opening:1']; addField(t,'responsable_present','Responsable d’ouverture présent','BOOLEAN'); addField(t,'caissier_present','Au moins un caissier présent','BOOLEAN'); addField(t,'absence_note','Absences / retards / remplacements','TEXT',{required:0});
  t=taskIds['opening:2']; addField(t,'porte_principale','Porte principale sécurisée','BOOLEAN'); addField(t,'porte_secondaire','Porte secondaire sécurisée','BOOLEAN'); addField(t,'issue_secours','Issue de secours accessible','BOOLEAN'); addField(t,'cameras','Caméras opérationnelles','BOOLEAN');
  t=taskIds['opening:3']; addField(t,'reseau','Réseau opérationnel','BOOLEAN'); addField(t,'pos','POS opérationnels','BOOLEAN'); addField(t,'tpe','TPE opérationnels','BOOLEAN'); addField(t,'imprimantes','Imprimantes tickets opérationnelles','BOOLEAN'); addField(t,'balances','Balances opérationnelles','BOOLEAN');
  t=taskIds['opening:4']; addField(t,'froid_positif','Température froid positif','NUMBER',{unit:'°C',min:0,max:4}); addField(t,'froid_negatif','Température surgelés','NUMBER',{unit:'°C',min:-30,max:-18});
  t=taskIds['opening:5']; addField(t,'proprete','Propreté conforme','BOOLEAN'); addField(t,'rayons','Rayons remplis','BOOLEAN'); addField(t,'fraicheur','Fraîcheur F&L conforme','BOOLEAN'); addField(t,'fefo','Rotation FEFO réalisée','BOOLEAN');
  t=taskIds['opening:6']; addField(t,'prix','Changements de prix traités','BOOLEAN'); addField(t,'promos','Promotions installées / retirées','BOOLEAN'); addField(t,'nouveaux','Nouveaux articles balisés et mis en rayon','BOOLEAN');
  t=taskIds['opening:7']; addField(t,'affectation','Caissiers affectés aux caisses','BOOLEAN'); addField(t,'fonds','Fonds de caisse déclarés','BOOLEAN'); addField(t,'shifts','Shifts Dynamics ouverts','BOOLEAN');

  t=taskIds['closing:1']; addField(t,'clients_sortis','Tous les clients sont sortis','BOOLEAN'); addField(t,'surface','Surface remise en état','BOOLEAN'); addField(t,'promos_expirees','Promotions expirées retirées','BOOLEAN');
  t=taskIds['closing:2']; addField(t,'dlc','DLC critiques traitées','BOOLEAN'); addField(t,'temp_pos','Température froid positif','NUMBER',{unit:'°C',min:0,max:4}); addField(t,'temp_neg','Température surgelés','NUMBER',{unit:'°C',min:-30,max:-18});
  t=taskIds['closing:3']; addField(t,'ca_commercial','CA commercial','MONEY',{unit:'DH'}); addField(t,'ca_comptable','CA comptable','MONEY',{unit:'DH'}); addField(t,'especes_attendues','Espèces attendues','MONEY',{unit:'DH'}); addField(t,'especes_declarees','Espèces déclarées','MONEY',{unit:'DH'}); addField(t,'tpe_systeme','TPE système','MONEY',{unit:'DH'}); addField(t,'tpe_cloture','TPE clôturé','MONEY',{unit:'DH'}); addField(t,'statement','Statement Dynamics contrôlé','BOOLEAN');
  t=taskIds['closing:4']; addField(t,'receptions','Toutes les réceptions physiques sont postées','BOOLEAN'); addField(t,'stocks_negatifs','Stocks négatifs contrôlés','BOOLEAN');
  t=taskIds['closing:5']; addField(t,'postes','Postes / équipements sécurisés','BOOLEAN'); addField(t,'eclairage','Éclairage hors zones nécessaires','BOOLEAN');
  t=taskIds['closing:6']; addField(t,'portes','Toutes les portes sécurisées','BOOLEAN'); addField(t,'alarme','Alarme activée','BOOLEAN'); addField(t,'reserve','Réserve sécurisée','BOOLEAN'); addField(t,'transmission','Transmission au lendemain','TEXT',{required:0});
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
  const line=db.prepare(`INSERT INTO receipt_lines(id,receipt_id,ean,product_name,category,ordered_qty,temperature_required) VALUES(?,?,?,?,?,?,?)`);
  line.run(uid('rl'),r1,'6111040001111','Lait frais entier 1L','Frais',24,1);
  line.run(uid('rl'),r1,'3274080005003','Yaourt nature 4x110g','Frais',36,1);
  line.run(uid('rl'),r1,'3017620422003','Nutella 750g','Épicerie',12,0);
  const r2='rcpt_tr_20411';
  db.prepare(`INSERT INTO receipts(id,store_id,po_number,vendor,eta) VALUES(?,?,?,?,?)`).run(r2,'trefle','PO-20411','Fournisseur Épicerie','14:00');
  line.run(uid('rl'),r2,'3017620422003','Nutella 750g','Épicerie',18,0);
}
seedReceipts();

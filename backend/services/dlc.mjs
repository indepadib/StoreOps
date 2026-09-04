import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { db, uid, audit, todayISO } from '../db.mjs';
import { createLossRecord } from './loss.mjs';

const MEDIA_DIR=process.env.STOREOPS_MEDIA_DIR||join(dirname(process.env.STOREOPS_DB||new URL('../storeops.db',import.meta.url).pathname),'media');
mkdirSync(MEDIA_DIR,{recursive:true});

const DEFAULT_THRESHOLDS=[
 ['Fruits & Légumes',0,1,2],['Boucherie',0,1,2],['Volaille',0,1,2],['Poissonnerie',0,0,1],
 ['Charcuterie / Traiteur',0,1,3],['Fromagerie coupe',1,2,5],['Crémerie / PLS',1,3,7],
 ['Boulangerie / Pâtisserie',0,1,2],['Surgelés',7,15,30],['Épicerie salée',15,30,60],
 ['Épicerie sucrée',15,30,60],['Boissons',15,30,60],['Droguerie / Hygiène-Beauté',15,30,60]
];
export const DLC_FAMILIES={
 'Fruits & Légumes':['Fruits frais','Légumes frais','Herbes aromatiques','4ème gamme (prédécoupé)','Fruits secs / oléagineux'],
 'Boucherie':['Viande bovine','Viande ovine','Viande hachée','Abats','Préparations bouchères'],
 'Volaille':['Poulet entier','Découpes de volaille','Dinde','Volaille marinée / panée'],
 'Poissonnerie':['Poissons frais entiers','Filets et découpes','Crustacés','Coquillages','Poissons préparés / marinés'],
 'Charcuterie / Traiteur':['Charcuterie sèche','Charcuterie cuite','Charcuterie de volaille','Salades traiteur','Plats cuisinés traiteur','Olives et condiments'],
 'Fromagerie coupe':['Pâtes pressées cuites','Pâtes pressées non cuites','Pâtes molles','Pâtes persillées','Fromages frais / chèvre'],
 'Crémerie / PLS':['Lait frais','Yaourts et desserts lactés','Beurre et crème','Fromages préemballés','Œufs','Jus frais / PLS boissons'],
 'Boulangerie / Pâtisserie':['Pain','Viennoiserie','Pâtisserie fraîche','Panification préemballée'],
 'Surgelés':['Légumes surgelés','Viandes / volailles surgelées','Poissons surgelés','Plats cuisinés surgelés','Glaces et desserts glacés','Panification surgelée'],
 'Épicerie salée':['Conserves','Pâtes / riz / semoule','Huiles et condiments','Sauces','Apéritif salé','Épices'],
 'Épicerie sucrée':['Biscuits et gâteaux','Chocolat et confiserie','Petit-déjeuner (céréales, confitures)','Sucre / farine / aides pâtisserie','Compotes et desserts ambiants'],
 'Boissons':['Eaux','Boissons gazeuses','Jus de fruits ambiants','Boissons chaudes (thé, café)','Sirops'],
 'Droguerie / Hygiène-Beauté':['Produits d’entretien','Hygiène corporelle','Papier / ouate','Bébé','Insecticides']
};
export const DLC_ACTIONS=[
 {code:'WITHDRAW_SHELF',label:'Retrait rayon',removesStock:false,proof:false},
 {code:'MARKDOWN',label:'Démarque',removesStock:false,proof:false},
 {code:'SHORT_DATE_PROMO',label:'Mise en avant DLC courte',removesStock:false,proof:false},
 {code:'DESTROY',label:'Destruction (PV établi)',removesStock:true,proof:true},
 {code:'RETURN_SUPPLIER',label:'Retour fournisseur',removesStock:true,proof:true},
 {code:'DONATE',label:'Don / valorisation',removesStock:true,proof:true},
 {code:'FEFO_ROTATE',label:'Rotation FEFO',removesStock:false,proof:false},
 {code:'QUALITY_REVIEW',label:'Isolement / décision qualité',removesStock:false,proof:true},
 {code:'NO_ACTION',label:'Aucune (conforme)',removesStock:false,proof:false}
];

db.exec(`
CREATE TABLE IF NOT EXISTS dlc_thresholds(
 department TEXT PRIMARY KEY,
 critical_days INTEGER NOT NULL,
 alert_days INTEGER NOT NULL,
 watch_days INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dlc_treatments(
 id TEXT PRIMARY KEY,
 dlc_id TEXT NOT NULL REFERENCES dlc_records(id) ON DELETE CASCADE,
 action_type TEXT NOT NULL,
 quantity REAL NOT NULL DEFAULT 0,
 quantity_before REAL NOT NULL,
 quantity_after REAL NOT NULL,
 note TEXT NULL,
 performed_by TEXT NOT NULL REFERENCES users(id),
 performed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dlc_evidence(
 id TEXT PRIMARY KEY,
 dlc_id TEXT NOT NULL REFERENCES dlc_records(id) ON DELETE CASCADE,
 treatment_id TEXT NULL REFERENCES dlc_treatments(id) ON DELETE CASCADE,
 file_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 storage_key TEXT NOT NULL UNIQUE,
 caption TEXT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_dlc_treatments_record ON dlc_treatments(dlc_id,performed_at);
CREATE INDEX IF NOT EXISTS ix_dlc_evidence_record ON dlc_evidence(dlc_id,created_at);
`);
function ensureColumn(table,column,definition){const cols=db.prepare(`PRAGMA table_info(${table})`).all();if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)}
ensureColumn('dlc_records','expiry_type',"TEXT NOT NULL DEFAULT 'DLC'");
ensureColumn('dlc_records','department','TEXT NULL');
ensureColumn('dlc_records','family','TEXT NULL');
ensureColumn('dlc_records','unit',"TEXT NOT NULL DEFAULT 'pièce'");
ensureColumn('dlc_records','original_quantity','REAL NULL');
ensureColumn('dlc_records','remaining_quantity','REAL NULL');
ensureColumn('dlc_records','operational_state',"TEXT NOT NULL DEFAULT 'SELLABLE'");
ensureColumn('dlc_records','source_type',"TEXT NOT NULL DEFAULT 'MANUAL'");
ensureColumn('dlc_records','last_control_at','TEXT NULL');
ensureColumn('dlc_records','next_control_at','TEXT NULL');
ensureColumn('dlc_records','closed_by','TEXT NULL');
ensureColumn('dlc_records','closed_at','TEXT NULL');
ensureColumn('dlc_records','product_number','TEXT NULL');
ensureColumn('dlc_records','category','TEXT NULL');
ensureColumn('dlc_records','unit_retail_value','REAL NULL');
db.exec(`UPDATE dlc_records SET original_quantity=quantity WHERE original_quantity IS NULL;UPDATE dlc_records SET remaining_quantity=quantity WHERE remaining_quantity IS NULL;UPDATE dlc_records SET last_control_at=created_at WHERE last_control_at IS NULL;`);
const ins=db.prepare(`INSERT OR IGNORE INTO dlc_thresholds(department,critical_days,alert_days,watch_days) VALUES(?,?,?,?)`);
for(const x of DEFAULT_THRESHOLDS)ins.run(...x);

function daysRemaining(date){const end=new Date(date+'T23:59:59');return Math.floor((end-new Date())/86400000)}
function thresholdFor(department){return db.prepare(`SELECT * FROM dlc_thresholds WHERE department=? AND active=1`).get(department)||{department:'Défaut',critical_days:1,alert_days:3,watch_days:7}}
export function evaluateDlc(record){
 const d=daysRemaining(record.expiry_date),t=thresholdFor(record.department);
 let stage;
 if(d<0)stage=record.expiry_type==='DDM'?'DDM_PASSED':'EXPIRED';
 else if(d<=t.critical_days)stage='CRITICAL';
 else if(d<=t.alert_days)stage='ALERT';
 else if(d<=t.watch_days)stage='WATCH';
 else stage='CONFORM';
 const map={
  EXPIRED:{label:'PÉRIMÉ',severity:'CRITICAL',action:'Retrait immédiat du rayon · isolement · destruction/retour/don selon décision, avec preuve.',dueHours:0},
  DDM_PASSED:{label:'DDM DÉPASSÉE',severity:'CRITICAL',action:'Isoler le lot et appliquer la décision qualité définie par l’enseigne.',dueHours:0},
  CRITICAL:{label:'CRITIQUE',severity:'CRITICAL',action:'Traitement le jour même : retrait/démarque/disposition selon décision du responsable.',dueHours:4},
  ALERT:{label:'ALERTE',severity:'HIGH',action:'Démarque ou mise en avant DLC courte · contrôle quotidien jusqu’à écoulement.',dueHours:24},
  WATCH:{label:'À SURVEILLER',severity:'MEDIUM',action:'Rotation FEFO · avancer le lot en facing · recontrôler.',dueHours:48},
  CONFORM:{label:'CONFORME',severity:'LOW',action:'Aucune action corrective · poursuite du contrôle périodique.',dueHours:168}
 };
 const allowedActions={
  EXPIRED:['WITHDRAW_SHELF','DESTROY','RETURN_SUPPLIER','DONATE','QUALITY_REVIEW'],
  DDM_PASSED:['QUALITY_REVIEW','WITHDRAW_SHELF','DESTROY','RETURN_SUPPLIER','DONATE'],
  CRITICAL:['WITHDRAW_SHELF','MARKDOWN','SHORT_DATE_PROMO','DESTROY','RETURN_SUPPLIER','DONATE','QUALITY_REVIEW'],
  ALERT:['MARKDOWN','SHORT_DATE_PROMO','FEFO_ROTATE','WITHDRAW_SHELF','RETURN_SUPPLIER'],
  WATCH:['FEFO_ROTATE','MARKDOWN','SHORT_DATE_PROMO','NO_ACTION'],
  CONFORM:['NO_ACTION','FEFO_ROTATE']
 }[stage]||[];
 return{stage,daysRemaining:d,threshold:t,allowedActions,...map[stage]};
}
function nextControl(stage){const h={EXPIRED:0,DDM_PASSED:0,CRITICAL:4,ALERT:24,WATCH:48,CONFORM:168}[stage]??24;return new Date(Date.now()+h*3600000).toISOString()}
function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
function hydrate(row){
 if(!row)return null;const risk=evaluateDlc(row);
 const treatments=db.prepare(`SELECT t.*,u.name performed_by_name FROM dlc_treatments t LEFT JOIN users u ON u.id=t.performed_by WHERE t.dlc_id=? ORDER BY t.performed_at DESC`).all(row.id);
 const evidence=db.prepare(`SELECT e.*,u.name created_by_name FROM dlc_evidence e LEFT JOIN users u ON u.id=e.created_by WHERE e.dlc_id=? ORDER BY e.created_at DESC`).all(row.id).map(e=>({...e,url:`/api/dlc-media/${e.id}`}));
 const overdue=row.status==='ACTIVE'&&row.next_control_at&&new Date(row.next_control_at)<new Date();
 const latest=treatments[0]?.action_type||null,remaining=Number(row.remaining_quantity??row.quantity??0),partialDisposal=['DESTROY','RETURN_SUPPLIER','DONATE'].includes(latest)&&remaining>0;
 const satisfied={
  EXPIRED:row.operational_state==='DISPOSED',
  DDM_PASSED:['ISOLATED','DISPOSED'].includes(row.operational_state)&&['QUALITY_REVIEW','WITHDRAW_SHELF','DESTROY','RETURN_SUPPLIER','DONATE'].includes(latest),
  CRITICAL:!partialDisposal&&['SHORT_DATE','ISOLATED','DISPOSED'].includes(row.operational_state)&&['MARKDOWN','SHORT_DATE_PROMO','WITHDRAW_SHELF','QUALITY_REVIEW','DESTROY','RETURN_SUPPLIER','DONATE'].includes(latest),
  ALERT:!partialDisposal&&['SHORT_DATE','FEFO','ISOLATED','DISPOSED'].includes(row.operational_state)&&['MARKDOWN','SHORT_DATE_PROMO','FEFO_ROTATE','WITHDRAW_SHELF','RETURN_SUPPLIER'].includes(latest),
  WATCH:['FEFO','SHORT_DATE','ISOLATED','DISPOSED'].includes(row.operational_state)&&['FEFO_ROTATE','MARKDOWN','SHORT_DATE_PROMO','NO_ACTION'].includes(latest),
  CONFORM:true
 }[risk.stage]??false;
 const pending=row.status==='ACTIVE'&&(!satisfied||overdue)&&risk.stage!=='CONFORM';
 return{...row,quantity:Number(row.remaining_quantity??row.quantity??0),remaining_quantity:Number(row.remaining_quantity??row.quantity??0),original_quantity:Number(row.original_quantity??row.quantity??0),created_by_name:userName(row.created_by),closed_by_name:userName(row.closed_by),risk,treatments,evidence,pending_action:pending,action_satisfied:satisfied,overdue_control:overdue};
}
export function dlcConfig(){return{departments:db.prepare(`SELECT * FROM dlc_thresholds WHERE active=1 ORDER BY rowid`).all().map(x=>({...x,families:DLC_FAMILIES[x.department]||[]})),units:['kg','g','L','pièce','barquette','colis'],expiryTypes:[{code:'DLC',label:'DLC'},{code:'DDM',label:'DDM'}],actions:DLC_ACTIONS}}
export function listDlc(storeId,status='ACTIVE'){const rows=status==='ALL'?db.prepare(`SELECT * FROM dlc_records WHERE store_id=? ORDER BY expiry_date,created_at DESC`).all(storeId):db.prepare(`SELECT * FROM dlc_records WHERE store_id=? AND status=? ORDER BY expiry_date,created_at DESC`).all(storeId,status);return rows.map(hydrate).sort((a,b)=>riskRank(a.risk.stage)-riskRank(b.risk.stage)||a.risk.daysRemaining-b.risk.daysRemaining)}
function riskRank(s){return({EXPIRED:0,DDM_PASSED:0,CRITICAL:1,ALERT:2,WATCH:3,CONFORM:4}[s]??9)}
export function dlcSummary(storeId){const rows=listDlc(storeId,'ACTIVE');const by={};for(const r of rows)by[r.risk.stage]=(by[r.risk.stage]||0)+1;return{active:rows.length,expired:(by.EXPIRED||0)+(by.DDM_PASSED||0),critical:by.CRITICAL||0,alert:by.ALERT||0,watch:by.WATCH||0,conform:by.CONFORM||0,pendingActions:rows.filter(x=>x.pending_action).length,overdueControls:rows.filter(x=>x.overdue_control).length,quantityAtRisk:rows.filter(x=>['EXPIRED','DDM_PASSED','CRITICAL','ALERT'].includes(x.risk.stage)).reduce((s,x)=>s+x.remaining_quantity,0)}}
export function blockingDlcCount(storeId){return listDlc(storeId,'ACTIVE').filter(x=>x.remaining_quantity>0&&['EXPIRED','DDM_PASSED','CRITICAL'].includes(x.risk.stage)&&x.pending_action).length}
export function createDlcRecord({storeId,user,product,expiryDate,quantity,zone='Rayon',lotRef=null,comment='',expiryType='DLC',department=null,family=null,unit='pièce',sourceType='MANUAL'}){
 if(!expiryDate||!(Number(quantity)>0))throw Object.assign(new Error('Date et quantité obligatoires.'),{status:400});
 if(!['DLC','DDM'].includes(expiryType))throw Object.assign(new Error('Type de date invalide.'),{status:400});
 if(department&&!thresholdFor(department))throw Object.assign(new Error('Rayon DLC inconnu.'),{status:400});
 const id=uid('dlc'),q=Number(quantity);
 db.prepare(`INSERT INTO dlc_records(id,store_id,ean,product_name,expiry_date,quantity,zone,lot_ref,comment,status,created_by,expiry_type,department,family,unit,original_quantity,remaining_quantity,operational_state,source_type,last_control_at) VALUES(?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?,?,'SELLABLE',?,CURRENT_TIMESTAMP)`)
 .run(id,storeId,product.ean,product.name,expiryDate,q,zone,lotRef||null,comment||null,user.id,expiryType,department||null,family||null,unit||'pièce',q,q,sourceType);
 db.prepare(`UPDATE dlc_records SET product_number=?,category=?,unit_retail_value=? WHERE id=?`).run(product.productNumber||null,product.category||null,product.price==null?null:Number(product.price),id);
 const row=db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(id),risk=evaluateDlc(row);
 db.prepare(`UPDATE dlc_records SET next_control_at=? WHERE id=?`).run(nextControl(risk.stage),id);
 audit({storeId,userId:user.id,action:'DLC_CREATED',entityType:'DLC',entityId:id,details:{ean:product.ean,expiryDate,expiryType,quantity:q,department,family,risk:risk.stage}});
 return hydrate(db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(id));
}
function parseDataUrl(dataUrl){const m=String(dataUrl||'').match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,(.+)$/);if(!m)throw Object.assign(new Error('Preuve invalide. JPG, PNG, WEBP ou PDF.'),{status:400});const buf=Buffer.from(m[2],'base64');if(!buf.length||buf.length>8*1024*1024)throw Object.assign(new Error('La preuve doit faire moins de 8 Mo.'),{status:413});const ext={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','application/pdf':'.pdf'}[m[1]];return{mime:m[1],buf,ext}}
function addEvidence({dlcId,treatmentId,user,dataUrl,fileName='preuve',caption=''}){const p=parseDataUrl(dataUrl),id=uid('dlcev'),storageKey=`${id}${p.ext}`;writeFileSync(join(MEDIA_DIR,storageKey),p.buf);db.prepare(`INSERT INTO dlc_evidence(id,dlc_id,treatment_id,file_name,mime_type,storage_key,caption,created_by) VALUES(?,?,?,?,?,?,?,?)`).run(id,dlcId,treatmentId,fileName||storageKey,p.mime,storageKey,caption||null,user.id);return id}
export function dlcMedia(id){const e=db.prepare(`SELECT e.*,d.store_id FROM dlc_evidence e JOIN dlc_records d ON d.id=e.dlc_id WHERE e.id=?`).get(id);if(!e)return null;const path=join(MEDIA_DIR,e.storage_key);if(!existsSync(path))return null;return{...e,bytes:readFileSync(path)}}
export function addDlcTreatment({id,user,actionType,quantity=0,note='',dataUrl=null,fileName=null,caption=''}){
 const row=db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(id);if(!row)throw Object.assign(new Error('Lot DLC introuvable.'),{status:404});if(row.status!=='ACTIVE')throw Object.assign(new Error('Ce lot est déjà clôturé.'),{status:409});const action=DLC_ACTIONS.find(x=>x.code===actionType);if(!action)throw Object.assign(new Error('Action DLC inconnue.'),{status:400});const currentRisk=evaluateDlc(row);if(!currentRisk.allowedActions.includes(actionType))throw Object.assign(new Error(`Action « ${action.label} » non autorisée pour le statut ${currentRisk.label}.`),{status:409});const before=Number(row.remaining_quantity??row.quantity),q=Number(quantity||0);if(action.removesStock&&(!(q>0)||q>before))throw Object.assign(new Error('La quantité traitée doit être > 0 et ≤ à la quantité restante.'),{status:400});if(action.proof&&!dataUrl)throw Object.assign(new Error('Une preuve photo/PDF est obligatoire pour cette action.'),{status:409});const after=action.removesStock?Math.max(0,before-q):before;const operational=['DESTROY','RETURN_SUPPLIER','DONATE'].includes(actionType)?(after<=0?'DISPOSED':'ISOLATED'):{WITHDRAW_SHELF:'ISOLATED',QUALITY_REVIEW:'ISOLATED',MARKDOWN:'SHORT_DATE',SHORT_DATE_PROMO:'SHORT_DATE',FEFO_ROTATE:'FEFO',NO_ACTION:'SELLABLE'}[actionType]||row.operational_state;const tid=uid('dlct');
 db.prepare(`INSERT INTO dlc_treatments(id,dlc_id,action_type,quantity,quantity_before,quantity_after,note,performed_by) VALUES(?,?,?,?,?,?,?,?)`).run(tid,id,actionType,action.removesStock?q:0,before,after,note||null,user.id);
 const evidenceId=dataUrl?addEvidence({dlcId:id,treatmentId:tid,user,dataUrl,fileName,caption}):null;
 let generatedLoss=null;const lossReason={DESTROY:'EXPIRED',RETURN_SUPPLIER:'RETURN_SUPPLIER',DONATE:'DONATION'}[actionType];
 if(lossReason&&q>0){generatedLoss=createLossRecord({storeId:row.store_id,businessDate:todayISO(),user,product:{ean:row.ean,name:row.product_name,productNumber:row.product_number||null,category:row.category||null,price:row.unit_retail_value},reasonCode:lossReason,quantity:q,unit:row.unit||'pièce',note:[`Générée automatiquement depuis DLC ${row.expiry_date}`,row.lot_ref?`lot ${row.lot_ref}`:null,note||null].filter(Boolean).join(' · '),sourceType:'DLC_TREATMENT',sourceId:tid,evidenceAlreadySatisfied:!!evidenceId,evidenceSourceType:evidenceId?'DLC_TREATMENT':null,evidenceSourceId:evidenceId?tid:null})}
 const status=after<=0?'CLOSED':'ACTIVE';db.prepare(`UPDATE dlc_records SET remaining_quantity=?,operational_state=?,status=?,closed_by=CASE WHEN ?='CLOSED' THEN ? ELSE closed_by END,closed_at=CASE WHEN ?='CLOSED' THEN CURRENT_TIMESTAMP ELSE closed_at END,last_control_at=CURRENT_TIMESTAMP WHERE id=?`).run(after,operational,status,status,user.id,status,id);const refreshed=db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(id),risk=evaluateDlc(refreshed);if(status==='ACTIVE')db.prepare(`UPDATE dlc_records SET next_control_at=? WHERE id=?`).run(nextControl(risk.stage),id);audit({storeId:row.store_id,userId:user.id,action:'DLC_TREATMENT',entityType:'DLC',entityId:id,details:{actionType,quantity:q,before,after,note,generatedLossId:generatedLoss?.id||null}});const result=hydrate(db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(id));return{...result,generated_loss:generatedLoss};
}
export function recheckDlc({id,user,quantity,note=''}){const row=db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(id);if(!row)throw Object.assign(new Error('Lot DLC introuvable.'),{status:404});if(row.status!=='ACTIVE')throw Object.assign(new Error('Ce lot est clôturé.'),{status:409});const q=Number(quantity);if(!Number.isFinite(q)||q<0)throw Object.assign(new Error('Quantité de recontrôle invalide.'),{status:400});const status=q===0?'CLOSED':'ACTIVE';db.prepare(`UPDATE dlc_records SET remaining_quantity=?,status=?,last_control_at=CURRENT_TIMESTAMP,closed_by=CASE WHEN ?='CLOSED' THEN ? ELSE closed_by END,closed_at=CASE WHEN ?='CLOSED' THEN CURRENT_TIMESTAMP ELSE closed_at END WHERE id=?`).run(q,status,status,user.id,status,id);const refreshed=db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(id),risk=evaluateDlc(refreshed);if(status==='ACTIVE')db.prepare(`UPDATE dlc_records SET next_control_at=? WHERE id=?`).run(nextControl(risk.stage),id);audit({storeId:row.store_id,userId:user.id,action:'DLC_RECHECKED',entityType:'DLC',entityId:id,details:{quantity:q,note}});return hydrate(db.prepare(`SELECT * FROM dlc_records WHERE id=?`).get(id))}
export function updateDlcThreshold({department,user,criticalDays,alertDays,watchDays}){const c=Number(criticalDays),a=Number(alertDays),w=Number(watchDays);if(![c,a,w].every(Number.isFinite)||c<0||a<c||w<a)throw Object.assign(new Error('Seuils invalides : CRITIQUE ≤ ALERTE ≤ À SURVEILLER.'),{status:400});const current=db.prepare(`SELECT * FROM dlc_thresholds WHERE department=?`).get(department);if(!current)throw Object.assign(new Error('Rayon inconnu.'),{status:404});db.prepare(`UPDATE dlc_thresholds SET critical_days=?,alert_days=?,watch_days=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE department=?`).run(c,a,w,user.id,department);for(const s of db.prepare(`SELECT id FROM stores WHERE active=1`).all())audit({storeId:s.id,userId:user.id,action:'DLC_THRESHOLD_UPDATED',entityType:'DLC_THRESHOLD',entityId:department,details:{criticalDays:c,alertDays:a,watchDays:w,scope:'NETWORK'}});return db.prepare(`SELECT * FROM dlc_thresholds WHERE department=?`).get(department)}

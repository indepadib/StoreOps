import { db,uid,audit,todayISO } from '../db.mjs';
import { createIncident,addAction,incidentById } from './incidents.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS loss_policies(
 id TEXT PRIMARY KEY,
 evidence_threshold_dh REAL NOT NULL DEFAULT 100,
 approval_threshold_dh REAL NOT NULL DEFAULT 500,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS loss_records(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 ean TEXT NOT NULL,
 product_number TEXT NULL,
 product_name TEXT NOT NULL,
 category TEXT NULL,
 reason_code TEXT NOT NULL,
 source_type TEXT NOT NULL DEFAULT 'MANUAL',
 source_id TEXT NULL,
 quantity REAL NOT NULL CHECK(quantity > 0),
 unit TEXT NOT NULL DEFAULT 'pièce',
 unit_retail_value REAL NULL,
 total_retail_value REAL NULL,
 requires_evidence INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('READY_TO_POST','APPROVAL_REQUIRED','APPROVED','POSTED','CANCELLED')),
 note TEXT NULL,
 incident_id TEXT NULL REFERENCES incidents(id),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 approved_by TEXT NULL REFERENCES users(id),
 approved_at TEXT NULL,
 posted_by TEXT NULL REFERENCES users(id),
 posted_at TEXT NULL
);
CREATE INDEX IF NOT EXISTS ix_loss_store_date ON loss_records(store_id,business_date,status,reason_code);
CREATE INDEX IF NOT EXISTS ix_loss_source ON loss_records(source_type,source_id);
`);
db.prepare(`INSERT OR IGNORE INTO loss_policies(id,evidence_threshold_dh,approval_threshold_dh) VALUES('default',100,500)`).run();

export const LOSS_REASONS=[
 {code:'BREAKAGE',label:'Casse'},
 {code:'EXPIRED',label:'Périmé / DLC'},
 {code:'DAMAGED',label:'Avarie / produit détérioré'},
 {code:'THEFT',label:'Vol constaté'},
 {code:'UNKNOWN_SHRINK',label:'Démarque inconnue'},
 {code:'DONATION',label:'Don'},
 {code:'RETURN_SUPPLIER',label:'Retour fournisseur'},
 {code:'INTERNAL_USE',label:'Consommation / usage interne'},
 {code:'OTHER',label:'Autre'}
];
const round=v=>Math.round(Number(v||0)*100)/100;
function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
export function lossPolicy(){return db.prepare(`SELECT * FROM loss_policies WHERE id='default'`).get()}
export function lossConfig(){return{reasons:LOSS_REASONS,units:['pièce','kg','g','L','barquette','colis'],policy:lossPolicy()}}
function validReason(code){return LOSS_REASONS.some(x=>x.code===code)}
function hydrate(row){if(!row)return null;return{...row,created_by_name:userName(row.created_by),approved_by_name:userName(row.approved_by),posted_by_name:userName(row.posted_by),incident:row.incident_id?incidentById(row.incident_id):null}}
export function lossRecord(id){return hydrate(db.prepare(`SELECT * FROM loss_records WHERE id=?`).get(id))}
export function listLossRecords(storeId,businessDate=todayISO(),status='ALL'){
 const allowed=['ALL','READY_TO_POST','APPROVAL_REQUIRED','APPROVED','POSTED','CANCELLED'];if(!allowed.includes(status))status='ALL';
 const rows=status==='ALL'?db.prepare(`SELECT * FROM loss_records WHERE store_id=? AND business_date=? ORDER BY created_at DESC`).all(storeId,businessDate):db.prepare(`SELECT * FROM loss_records WHERE store_id=? AND business_date=? AND status=? ORDER BY created_at DESC`).all(storeId,businessDate,status);
 return rows.map(hydrate);
}
export function lossSummary(storeId,businessDate=todayISO()){
 const rows=listLossRecords(storeId,businessDate,'ALL'),open=rows.filter(x=>!['POSTED','CANCELLED'].includes(x.status));
 return{records:rows.length,open:open.length,posted:rows.filter(x=>x.status==='POSTED').length,pendingApproval:rows.filter(x=>x.status==='APPROVAL_REQUIRED').length,pendingEvidence:open.filter(x=>x.requires_evidence&&x.incident?.status==='OPEN').length,totalQty:round(rows.reduce((s,x)=>s+Number(x.quantity||0),0)),retailValue:round(rows.reduce((s,x)=>s+Number(x.total_retail_value||0),0)),blocking:open.length};
}
export function blockingLossCount(storeId,businessDate=todayISO()){return db.prepare(`SELECT COUNT(*) n FROM loss_records WHERE store_id=? AND business_date=? AND status NOT IN ('POSTED','CANCELLED')`).get(storeId,businessDate).n}
export function createLossRecord({storeId,businessDate=todayISO(),user,product,reasonCode,quantity,unit='pièce',note='',sourceType='MANUAL',sourceId=null}){
 if(!validReason(reasonCode))throw Object.assign(new Error('Motif de perte invalide.'),{status:400});
 const qty=Number(quantity);if(!Number.isFinite(qty)||qty<=0)throw Object.assign(new Error('Quantité de perte invalide.'),{status:400});
 if(!product?.ean||!product?.name)throw Object.assign(new Error('Article Dynamics invalide.'),{status:400});
 const price=product?.price==null?null:Number(product.price),total=Number.isFinite(price)?round(price*qty):null,policy=lossPolicy();
 const requiresEvidence=total==null||total>=Number(policy.evidence_threshold_dh),requiresApproval=total==null||total>=Number(policy.approval_threshold_dh),status=requiresApproval?'APPROVAL_REQUIRED':'READY_TO_POST',id=uid('loss');
 db.prepare(`INSERT INTO loss_records(id,store_id,business_date,ean,product_number,product_name,category,reason_code,source_type,source_id,quantity,unit,unit_retail_value,total_retail_value,requires_evidence,status,note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,storeId,businessDate,product.ean,product.productNumber||null,product.name,product.category||null,reasonCode,sourceType||'MANUAL',sourceId||null,qty,unit||'pièce',Number.isFinite(price)?price:null,total,requiresEvidence?1:0,status,note||null,user.id);
 if(requiresEvidence){
  const inc=createIncident({storeId,user,title:`Perte à documenter · ${product.name}`,description:`${qty} ${unit} · ${LOSS_REASONS.find(x=>x.code===reasonCode)?.label||reasonCode}${total==null?'':` · valeur vente estimée ${total} DH`}`,category:'LOSS',criticality:requiresApproval?'HIGH':'MEDIUM',blockingLevel:'STORE_CLOSING',sourceType:'LOSS_RECORD',sourceId:id,assignedTo:user.role==='store_manager'?user.id:null,requiresEvidence:true});
  addAction({incidentId:inc.id,user,title:'Joindre la preuve et documenter la sortie de stock',note:note||'',assignedTo:user.role==='store_manager'?user.id:null});
  db.prepare(`UPDATE loss_records SET incident_id=? WHERE id=?`).run(inc.id,id);
 }
 audit({storeId,businessDate,userId:user.id,action:'LOSS_RECORDED',entityType:'LOSS_RECORD',entityId:id,details:{ean:product.ean,reasonCode,quantity:qty,unit,totalRetailValue:total,requiresEvidence,requiresApproval,sourceType,sourceId}});
 return lossRecord(id);
}
export function approveLossRecord({id,user}){
 if(user.role!=='ops_director')throw Object.assign(new Error('Validation de perte réservée au Directeur d’exploitation.'),{status:403});
 const row=db.prepare(`SELECT * FROM loss_records WHERE id=?`).get(id);if(!row)throw Object.assign(new Error('Perte introuvable.'),{status:404});
 if(row.status!=='APPROVAL_REQUIRED')throw Object.assign(new Error('Cette perte ne nécessite pas de validation Direction.'),{status:409});
 db.prepare(`UPDATE loss_records SET status='APPROVED',approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,id);audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:'LOSS_APPROVED',entityType:'LOSS_RECORD',entityId:id});return lossRecord(id);
}
export function ensureLossPostable(id){
 const row=lossRecord(id);if(!row)throw Object.assign(new Error('Perte introuvable.'),{status:404});
 if(!['READY_TO_POST','APPROVED'].includes(row.status))throw Object.assign(new Error('La perte doit être prête ou approuvée avant posting.'),{status:409});
 if(row.requires_evidence&&row.incident?.status!=='RESOLVED')throw Object.assign(new Error('La preuve et l’action corrective doivent être clôturées avant posting.'),{status:409,details:{incidentId:row.incident_id}});
 return row;
}
export function markLossPosted({id,user}){
 const row=ensureLossPostable(id);db.prepare(`UPDATE loss_records SET status='POSTED',posted_by=?,posted_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,id);audit({storeId:row.store_id,businessDate:row.business_date,userId:user.id,action:'LOSS_POSTED',entityType:'LOSS_RECORD',entityId:id});return lossRecord(id);
}
export function updateLossPolicy({user,evidenceThreshold,approvalThreshold}){
 const e=Number(evidenceThreshold),a=Number(approvalThreshold);if(!Number.isFinite(e)||!Number.isFinite(a)||e<0||a<e)throw Object.assign(new Error('Seuils invalides : approbation ≥ preuve ≥ 0.'),{status:400});
 db.prepare(`UPDATE loss_policies SET evidence_threshold_dh=?,approval_threshold_dh=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(e,a,user.id);for(const st of db.prepare(`SELECT id FROM stores WHERE active=1`).all())audit({storeId:st.id,userId:user.id,action:'LOSS_POLICY_UPDATED',entityType:'LOSS_POLICY',entityId:'default',details:{evidenceThreshold:e,approvalThreshold:a}});return lossPolicy();
}

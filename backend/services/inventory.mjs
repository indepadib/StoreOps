import { db,uid,audit,todayISO } from '../db.mjs';

export const INVENTORY_REASON_CODES=[
 {code:'COUNT_ERROR',label:'Erreur de comptage'},
 {code:'BREAKAGE',label:'Casse / avarie'},
 {code:'SHRINK',label:'Démarque inconnue / perte'},
 {code:'RECEIPT',label:'Écart de réception'},
 {code:'TRANSFER',label:'Transfert en attente / mal imputé'},
 {code:'SALE_TIMING',label:'Décalage vente / synchronisation'},
 {code:'OTHER',label:'Autre'}
];

db.exec(`
CREATE TABLE IF NOT EXISTS inventory_policies(
 id TEXT PRIMARY KEY,
 recount_qty_threshold REAL NOT NULL DEFAULT 2,
 incident_qty_threshold REAL NOT NULL DEFAULT 5,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory_sessions(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 inventory_type TEXT NOT NULL CHECK(inventory_type IN ('CYCLE','TARGETED','FULL')),
 zone TEXT NULL,
 comment TEXT NULL,
 status TEXT NOT NULL DEFAULT 'COUNTING' CHECK(status IN ('COUNTING','REVIEW','READY_TO_POST','POSTED','CANCELLED')),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_by TEXT NULL REFERENCES users(id),
 reviewed_at TEXT NULL,
 posted_by TEXT NULL REFERENCES users(id),
 posted_at TEXT NULL
);
CREATE TABLE IF NOT EXISTS inventory_lines(
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
 ean TEXT NOT NULL,
 product_number TEXT NULL,
 product_name TEXT NOT NULL,
 category TEXT NULL,
 theoretical_qty REAL NOT NULL,
 count1_qty REAL NULL,
 count1_by TEXT NULL REFERENCES users(id),
 count1_at TEXT NULL,
 variance1 REAL NULL,
 requires_recount INTEGER NOT NULL DEFAULT 0,
 count2_qty REAL NULL,
 count2_by TEXT NULL REFERENCES users(id),
 count2_at TEXT NULL,
 final_qty REAL NULL,
 final_variance REAL NULL,
 reason_code TEXT NULL,
 note TEXT NULL,
 status TEXT NOT NULL DEFAULT 'TO_COUNT' CHECK(status IN ('TO_COUNT','RECOUNT','COUNTED')),
 UNIQUE(session_id,ean)
);
CREATE INDEX IF NOT EXISTS ix_inventory_session_store ON inventory_sessions(store_id,status,business_date);
CREATE INDEX IF NOT EXISTS ix_inventory_lines_session ON inventory_lines(session_id,status);
`);
db.prepare(`INSERT OR IGNORE INTO inventory_policies(id,recount_qty_threshold,incident_qty_threshold) VALUES('default',2,5)`).run();

function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
export function inventoryPolicy(){return db.prepare(`SELECT * FROM inventory_policies WHERE id='default'`).get()}
export function inventoryConfig(){return{types:[{code:'CYCLE',label:'Inventaire tournant'},{code:'TARGETED',label:'Inventaire ciblé'},{code:'FULL',label:'Inventaire complet'}],reasons:INVENTORY_REASON_CODES,policy:inventoryPolicy()}}
function hydrateLine(row){return row?{...row,count1_by_name:userName(row.count1_by),count2_by_name:userName(row.count2_by),variance_abs:row.final_variance==null?null:Math.abs(Number(row.final_variance))}:null}
function hydrateSession(row){
 if(!row)return null;
 const lines=db.prepare(`SELECT * FROM inventory_lines WHERE session_id=? ORDER BY product_name`).all(row.id).map(hydrateLine);
 const pending=lines.filter(x=>x.status!=='COUNTED').length,recounts=lines.filter(x=>x.status==='RECOUNT').length,varianceLines=lines.filter(x=>x.final_variance!=null&&Math.abs(Number(x.final_variance))>0),absVariance=varianceLines.reduce((s,x)=>s+Math.abs(Number(x.final_variance)),0);
 return{...row,created_by_name:userName(row.created_by),reviewed_by_name:userName(row.reviewed_by),posted_by_name:userName(row.posted_by),lines,metrics:{lines:lines.length,counted:lines.length-pending,pending,recounts,varianceLines:varianceLines.length,absoluteVarianceQty:absVariance}};
}
export function inventorySession(id){return hydrateSession(db.prepare(`SELECT * FROM inventory_sessions WHERE id=?`).get(id))}
export function listInventorySessions(storeId,status='ALL'){
 const rows=status==='ALL'?db.prepare(`SELECT * FROM inventory_sessions WHERE store_id=? ORDER BY created_at DESC`).all(storeId):db.prepare(`SELECT * FROM inventory_sessions WHERE store_id=? AND status=? ORDER BY created_at DESC`).all(storeId,status);
 return rows.map(hydrateSession);
}
export function inventorySummary(storeId){
 const sessions=listInventorySessions(storeId,'ALL'),active=sessions.filter(x=>!['POSTED','CANCELLED'].includes(x.status));
 return{openSessions:active.length,readyToPost:active.filter(x=>x.status==='READY_TO_POST').length,pendingRecounts:active.reduce((s,x)=>s+x.metrics.recounts,0),varianceLines:active.reduce((s,x)=>s+x.metrics.varianceLines,0),absoluteVarianceQty:active.reduce((s,x)=>s+x.metrics.absoluteVarianceQty,0)};
}
export function createInventorySession({storeId,user,type='CYCLE',zone='',comment=''}) {
 if(!['CYCLE','TARGETED','FULL'].includes(type))throw Object.assign(new Error('Type d’inventaire invalide.'),{status:400});
 const id=uid('inv');
 db.prepare(`INSERT INTO inventory_sessions(id,store_id,business_date,inventory_type,zone,comment,status,created_by) VALUES(?,?,?,?,?,?,'COUNTING',?)`).run(id,storeId,todayISO(),type,zone||null,comment||null,user.id);
 audit({storeId,userId:user.id,action:'INVENTORY_STARTED',entityType:'INVENTORY_SESSION',entityId:id,details:{type,zone}});
 return inventorySession(id);
}
export function addInventoryLine({sessionId,user,product}){
 const session=db.prepare(`SELECT * FROM inventory_sessions WHERE id=?`).get(sessionId);if(!session)throw Object.assign(new Error('Inventaire introuvable.'),{status:404});
 if(!['COUNTING','REVIEW'].includes(session.status))throw Object.assign(new Error('Cet inventaire ne peut plus recevoir de nouvelles lignes.'),{status:409});
 const stock=Number(product.stock);
 if(!Number.isFinite(stock))throw Object.assign(new Error('Stock théorique Dynamics indisponible pour cet article. Le mapping stock doit être configuré avant comptage.'),{status:503,code:'D365_STOCK_MAPPING_REQUIRED'});
 const existing=db.prepare(`SELECT * FROM inventory_lines WHERE session_id=? AND ean=?`).get(sessionId,product.ean);if(existing)return hydrateLine(existing);
 const id=uid('invl');
 db.prepare(`INSERT INTO inventory_lines(id,session_id,ean,product_number,product_name,category,theoretical_qty) VALUES(?,?,?,?,?,?,?)`).run(id,sessionId,product.ean,product.productNumber||null,product.name,product.category||null,stock);
 audit({storeId:session.store_id,userId:user.id,action:'INVENTORY_LINE_ADDED',entityType:'INVENTORY_LINE',entityId:id,details:{sessionId,ean:product.ean,theoreticalQty:stock}});
 return hydrateLine(db.prepare(`SELECT * FROM inventory_lines WHERE id=?`).get(id));
}
function validReason(code){return !code||INVENTORY_REASON_CODES.some(x=>x.code===code)}
export function countInventoryLine({lineId,user,quantity,reasonCode=null,note='',recount=false}){
 const line=db.prepare(`SELECT l.*,s.store_id,s.status session_status FROM inventory_lines l JOIN inventory_sessions s ON s.id=l.session_id WHERE l.id=?`).get(lineId);if(!line)throw Object.assign(new Error('Ligne d’inventaire introuvable.'),{status:404});
 if(!['COUNTING','REVIEW'].includes(line.session_status))throw Object.assign(new Error('Cet inventaire n’est plus modifiable.'),{status:409});
 const qty=Number(quantity);if(!Number.isFinite(qty)||qty<0)throw Object.assign(new Error('Quantité comptée invalide.'),{status:400});
 if(!validReason(reasonCode))throw Object.assign(new Error('Motif d’écart invalide.'),{status:400});
 const policy=inventoryPolicy();
 if(recount){
   if(!line.requires_recount)throw Object.assign(new Error('Cette ligne ne nécessite pas de recomptage.'),{status:409});
   const variance=qty-Number(line.theoretical_qty),finalReason=reasonCode||line.reason_code||null;
   if(variance!==0&&!finalReason)throw Object.assign(new Error('Un motif est obligatoire pour tout écart final.'),{status:409});
   db.prepare(`UPDATE inventory_lines SET count2_qty=?,count2_by=?,count2_at=CURRENT_TIMESTAMP,final_qty=?,final_variance=?,reason_code=?,note=?,requires_recount=0,status='COUNTED' WHERE id=?`).run(qty,user.id,qty,variance,finalReason,note||line.note||null,lineId);
   audit({storeId:line.store_id,userId:user.id,action:'INVENTORY_RECOUNTED',entityType:'INVENTORY_LINE',entityId:lineId,details:{quantity:qty,variance,reasonCode:reasonCode||line.reason_code||null}});
 }else{
   if(line.count1_qty!=null)throw Object.assign(new Error('Le premier comptage existe déjà. Utilise le recomptage si nécessaire.'),{status:409});
   const variance=qty-Number(line.theoretical_qty),needs=Math.abs(variance)>=Number(policy.recount_qty_threshold);
   if(!needs&&variance!==0&&!reasonCode)throw Object.assign(new Error('Un motif est obligatoire pour tout écart.'),{status:409});
   db.prepare(`UPDATE inventory_lines SET count1_qty=?,count1_by=?,count1_at=CURRENT_TIMESTAMP,variance1=?,requires_recount=?,final_qty=?,final_variance=?,reason_code=?,note=?,status=? WHERE id=?`).run(qty,user.id,variance,needs?1:0,needs?null:qty,needs?null:variance,reasonCode||null,note||null,needs?'RECOUNT':'COUNTED',lineId);
   audit({storeId:line.store_id,userId:user.id,action:needs?'INVENTORY_RECOUNT_REQUIRED':'INVENTORY_COUNTED',entityType:'INVENTORY_LINE',entityId:lineId,details:{quantity:qty,variance,requiresRecount:needs,reasonCode}});
 }
 db.prepare(`UPDATE inventory_sessions SET status=CASE WHEN status='COUNTING' THEN 'REVIEW' ELSE status END WHERE id=?`).run(line.session_id);
 return inventorySession(line.session_id);
}
export function finalizeInventorySession({sessionId,user}){
 const session=inventorySession(sessionId);if(!session)throw Object.assign(new Error('Inventaire introuvable.'),{status:404});
 if(!['COUNTING','REVIEW'].includes(session.status))throw Object.assign(new Error('Inventaire déjà finalisé.'),{status:409});
 if(!session.lines.length)throw Object.assign(new Error('Ajoute au moins un article avant validation.'),{status:409});
 const notCounted=session.lines.filter(x=>x.status!=='COUNTED');if(notCounted.length)throw Object.assign(new Error(`${notCounted.length} ligne(s) restent à compter ou recomptabiliser.`),{status:409,details:{pending:notCounted.map(x=>x.ean)}});
 const missingReason=session.lines.filter(x=>Number(x.final_variance)!==0&&!x.reason_code);if(missingReason.length)throw Object.assign(new Error('Tout écart final doit avoir un motif.'),{status:409});
 db.prepare(`UPDATE inventory_sessions SET status='READY_TO_POST',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,sessionId);
 audit({storeId:session.store_id,userId:user.id,action:'INVENTORY_READY_TO_POST',entityType:'INVENTORY_SESSION',entityId:sessionId,details:{lines:session.metrics.lines,varianceLines:session.metrics.varianceLines,absoluteVarianceQty:session.metrics.absoluteVarianceQty}});
 const ready=inventorySession(sessionId),threshold=Number(inventoryPolicy().incident_qty_threshold);
 return{session:ready,highVarianceLines:ready.lines.filter(x=>Math.abs(Number(x.final_variance||0))>=threshold)};
}
export function markInventoryPosted({sessionId,user}){
 const session=inventorySession(sessionId);if(!session)throw Object.assign(new Error('Inventaire introuvable.'),{status:404});if(session.status!=='READY_TO_POST')throw Object.assign(new Error('L’inventaire doit être validé avant posting.'),{status:409});
 db.prepare(`UPDATE inventory_sessions SET status='POSTED',posted_by=?,posted_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,sessionId);
 audit({storeId:session.store_id,userId:user.id,action:'INVENTORY_POSTED',entityType:'INVENTORY_SESSION',entityId:sessionId});
 return inventorySession(sessionId);
}
export function updateInventoryPolicy({user,recountThreshold,incidentThreshold}){
 const r=Number(recountThreshold),i=Number(incidentThreshold);if(!Number.isFinite(r)||!Number.isFinite(i)||r<0||i<r)throw Object.assign(new Error('Seuils invalides : incident ≥ recomptage ≥ 0.'),{status:400});
 db.prepare(`UPDATE inventory_policies SET recount_qty_threshold=?,incident_qty_threshold=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(r,i,user.id);
 for(const st of db.prepare(`SELECT id FROM stores WHERE active=1`).all())audit({storeId:st.id,userId:user.id,action:'INVENTORY_POLICY_UPDATED',entityType:'INVENTORY_POLICY',entityId:'default',details:{recountThreshold:r,incidentThreshold:i}});
 return inventoryPolicy();
}

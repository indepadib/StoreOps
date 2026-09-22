import { db,uid,audit,todayISO } from '../db.mjs';
import { convertQuantity,normalizeUnit } from './unit-conversion.mjs';

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
function ensureColumn(table,column,definition){const cols=db.prepare(`PRAGMA table_info(${table})`).all();if(!cols.some(x=>x.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)}
ensureColumn('inventory_lines','unit','TEXT NULL');
ensureColumn('inventory_lines','count1_input_qty','REAL NULL');
ensureColumn('inventory_lines','count1_input_unit','TEXT NULL');
ensureColumn('inventory_lines','count2_input_qty','REAL NULL');
ensureColumn('inventory_lines','count2_input_unit','TEXT NULL');
ensureColumn('inventory_lines','stock_snapshot_source','TEXT NULL');
ensureColumn('inventory_lines','stock_snapshot_warehouse','TEXT NULL');
ensureColumn('inventory_lines','stock_snapshot_at','TEXT NULL');
ensureColumn('inventory_sessions','snapshot_source','TEXT NULL');
ensureColumn('inventory_sessions','snapshot_warehouse','TEXT NULL');
ensureColumn('inventory_sessions','snapshot_at','TEXT NULL');
ensureColumn('inventory_sessions','exported_by','TEXT NULL');
ensureColumn('inventory_sessions','exported_at','TEXT NULL');
db.prepare(`INSERT OR IGNORE INTO inventory_policies(id,recount_qty_threshold,incident_qty_threshold) VALUES('default',2,5)`).run();

function userName(id){return id?db.prepare(`SELECT name FROM users WHERE id=?`).get(id)?.name||null:null}
export function inventoryPolicy(){return db.prepare(`SELECT * FROM inventory_policies WHERE id='default'`).get()}
export function inventoryConfig(){return{types:[{code:'CYCLE',label:'Inventaire tournant'},{code:'TARGETED',label:'Inventaire ciblé'},{code:'FULL',label:'Inventaire complet'}],reasons:INVENTORY_REASON_CODES,policy:inventoryPolicy(),countingPolicy:{blindFirstCount:true,blindRecount:true,recountDifferentCounterRecommended:true,thresholdBasis:{COUNT:'pièce',MASS:'kg',VOLUME:'L',PACK:'unité de conditionnement'}}}}
function hydrateLine(row){return row?{...row,count1_by_name:userName(row.count1_by),count2_by_name:userName(row.count2_by),variance_abs:row.final_variance==null?null:Math.abs(Number(row.final_variance))}:null}
function hydrateSession(row){
 if(!row)return null;
 const lines=db.prepare(`SELECT * FROM inventory_lines WHERE session_id=? ORDER BY product_name`).all(row.id).map(hydrateLine);
 const pending=lines.filter(x=>x.status!=='COUNTED').length,recounts=lines.filter(x=>x.status==='RECOUNT').length,varianceLines=lines.filter(x=>x.final_variance!=null&&Math.abs(Number(x.final_variance))>0),unexplained=varianceLines.filter(x=>!x.reason_code).length,absVariance=varianceLines.reduce((s,x)=>s+Math.abs(Number(x.final_variance)),0);
 return{...row,created_by_name:userName(row.created_by),reviewed_by_name:userName(row.reviewed_by),posted_by_name:userName(row.posted_by),exported_by_name:userName(row.exported_by),lines,metrics:{lines:lines.length,counted:lines.length-pending,pending,recounts,unexplained,varianceLines:varianceLines.length,absoluteVarianceQty:absVariance,progressPct:lines.length?Math.round(((lines.length-pending)/lines.length)*100):0}};
}
export function inventorySession(id){return hydrateSession(db.prepare(`SELECT * FROM inventory_sessions WHERE id=?`).get(id))}
export function listInventorySessions(storeId,status='ALL'){
 const rows=status==='ALL'?db.prepare(`SELECT * FROM inventory_sessions WHERE store_id=? ORDER BY created_at DESC`).all(storeId):db.prepare(`SELECT * FROM inventory_sessions WHERE store_id=? AND status=? ORDER BY created_at DESC`).all(storeId,status);
 return rows.map(hydrateSession);
}
export function inventorySummary(storeId){
 const sessions=listInventorySessions(storeId,'ALL'),active=sessions.filter(x=>!['POSTED','CANCELLED'].includes(x.status));
 return{openSessions:active.length,readyToPost:active.filter(x=>x.status==='READY_TO_POST'&&!x.exported_at).length,exported:active.filter(x=>x.status==='READY_TO_POST'&&x.exported_at).length,pendingRecounts:active.reduce((s,x)=>s+x.metrics.recounts,0),varianceLines:active.reduce((s,x)=>s+x.metrics.varianceLines,0),absoluteVarianceQty:active.reduce((s,x)=>s+x.metrics.absoluteVarianceQty,0)};
}
export function createInventorySession({storeId,user,type='CYCLE',zone='',comment=''}) {
 if(!['CYCLE','TARGETED','FULL'].includes(type))throw Object.assign(new Error('Type d’inventaire invalide.'),{status:400});
 const id=uid('inv');
 db.prepare(`INSERT INTO inventory_sessions(id,store_id,business_date,inventory_type,zone,comment,status,created_by) VALUES(?,?,?,?,?,?,'COUNTING',?)`).run(id,storeId,todayISO(),type,zone||null,comment||null,user.id);
 audit({storeId,userId:user.id,action:'INVENTORY_STARTED',entityType:'INVENTORY_SESSION',entityId:id,details:{type,zone}});
 return inventorySession(id);
}
export function activeExpressInventory(storeId,businessDate=todayISO()){
 const row=db.prepare(`SELECT * FROM inventory_sessions WHERE store_id=? AND business_date=? AND inventory_type='TARGETED' AND zone='Express' AND status IN ('COUNTING','REVIEW') ORDER BY created_at DESC LIMIT 1`).get(storeId,businessDate);
 return hydrateSession(row);
}
export function getOrCreateExpressInventory({storeId,user,businessDate=todayISO()}){
 const active=activeExpressInventory(storeId,businessDate);
 if(active)return active;
 return createInventorySession({storeId,user,type:'TARGETED',zone:'Express',comment:'Inventaire express StoreOps'});
}
function thresholdForStockUnit(value,unit){
 const raw=Number(value);if(!Number.isFinite(raw)||raw<0)return null;
 const normalized=normalizeUnit(unit);if(!normalized)return raw;
 if(normalized.dimension==='MASS'){const x=convertQuantity(raw,'kg',normalized.label);return x.status==='READY'?x.quantity:raw}
 if(normalized.dimension==='VOLUME'){const x=convertQuantity(raw,'L',normalized.label);return x.status==='READY'?x.quantity:raw}
 return raw
}
function varianceDecision({variance,unit,policy=inventoryPolicy()}={}){
 const abs=Math.abs(Number(variance||0)),recountThreshold=thresholdForStockUnit(policy.recount_qty_threshold,unit),incidentThreshold=thresholdForStockUnit(policy.incident_qty_threshold,unit);
 return{abs,recountThreshold,incidentThreshold,recount:recountThreshold!=null&&abs>=recountThreshold,incident:incidentThreshold!=null&&abs>=incidentThreshold}
}
function normalizedCount(quantity,inputUnit,stockUnit){
 const raw=Number(quantity);if(!Number.isFinite(raw)||raw<0)throw Object.assign(new Error('Quantité comptée invalide.'),{status:400,code:'INVENTORY_COUNT_INVALID'});
 const from=String(inputUnit||stockUnit||'').trim(),to=String(stockUnit||inputUnit||'').trim();
 if(!from||!to)return{quantity:raw,inputQuantity:raw,inputUnit:from||to||null,stockUnit:to||from||null,factor:1,state:'NO_UNIT'};
 const conv=convertQuantity(raw,from,to);
 if(conv.status!=='READY')throw Object.assign(new Error(`Unité de comptage incompatible : ${from} → ${to}.`),{status:400,code:'INVENTORY_UNIT_INCOMPATIBLE',details:conv});
 return{quantity:conv.quantity,inputQuantity:raw,inputUnit:conv.from,stockUnit:conv.to,factor:conv.factor,state:'READY'}
}
export function seedInventorySessionFromStock({sessionId,user,snapshot}={}){
 const session=db.prepare(`SELECT * FROM inventory_sessions WHERE id=?`).get(sessionId);if(!session)throw Object.assign(new Error('Inventaire introuvable.'),{status:404});
 if(session.inventory_type!=='FULL')throw Object.assign(new Error('Le préchargement stock est réservé à un inventaire complet.'),{status:409,code:'INVENTORY_SEED_FULL_ONLY'});
 if(!snapshot||snapshot.complete!==true||!Array.isArray(snapshot.items))throw Object.assign(new Error('Snapshot stock Dynamics incomplet : inventaire complet non créé.'),{status:409,code:'INVENTORY_FULL_SNAPSHOT_REQUIRED'});
 const stmt=db.prepare(`INSERT OR IGNORE INTO inventory_lines(id,session_id,ean,product_number,product_name,category,theoretical_qty,unit,stock_snapshot_source,stock_snapshot_warehouse,stock_snapshot_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
 let inserted=0;
 for(const item of snapshot.items){
  const productNumber=String(item.productNumber||'').trim();if(!productNumber)continue;
  const theoretical=Number(item.stock);if(!Number.isFinite(theoretical)||theoretical===0)continue;
  const ean=String(item.ean||`SKU:${productNumber}`).trim(),name=String(item.name||productNumber).trim()||productNumber;
  const info=stmt.run(uid('invl'),sessionId,ean,productNumber,name,item.category||null,theoretical,item.inventoryUnit||null,snapshot.source||null,snapshot.warehouse||null,snapshot.checkedAt||new Date().toISOString());
  inserted+=Number(info.changes||0)
 }
 db.prepare(`UPDATE inventory_sessions SET snapshot_source=?,snapshot_warehouse=?,snapshot_at=? WHERE id=?`).run(snapshot.source||null,snapshot.warehouse||null,snapshot.checkedAt||new Date().toISOString(),sessionId);
 audit({storeId:session.store_id,userId:user.id,action:'INVENTORY_FULL_PRELOADED',entityType:'INVENTORY_SESSION',entityId:sessionId,details:{source:snapshot.source,warehouse:snapshot.warehouse,rowsRead:snapshot.rowsRead,inserted}});
 return inventorySession(sessionId)
}
export function addInventoryLine({sessionId,user,product}){
 const session=db.prepare(`SELECT * FROM inventory_sessions WHERE id=?`).get(sessionId);if(!session)throw Object.assign(new Error('Inventaire introuvable.'),{status:404});
 if(!['COUNTING','REVIEW'].includes(session.status))throw Object.assign(new Error('Cet inventaire ne peut plus recevoir de nouvelles lignes.'),{status:409});
 const stock=Number(product.stock);
 if(!Number.isFinite(stock))throw Object.assign(new Error('Stock théorique Dynamics indisponible pour cet article. Le mapping stock doit être configuré avant comptage.'),{status:503,code:'D365_STOCK_MAPPING_REQUIRED'});
 const sku=String(product.productNumber||'').trim(),ean=String(product.ean||'').trim();
 let existing=db.prepare(`SELECT * FROM inventory_lines WHERE session_id=? AND (ean=? OR (?<>'' AND product_number=?)) ORDER BY CASE WHEN ean=? THEN 0 ELSE 1 END LIMIT 1`).get(sessionId,ean,sku,sku,ean);
 const unit=String(product.inventoryUnit||product.unit||'').trim()||null;
 if(existing){
  if((String(existing.ean||'').startsWith('SKU:')||!existing.unit||existing.product_name===existing.product_number)&&ean){
   db.prepare(`UPDATE inventory_lines SET ean=?,product_name=?,category=COALESCE(?,category),unit=COALESCE(?,unit) WHERE id=?`).run(ean,product.name||existing.product_name,product.category||null,unit,existing.id);
   existing=db.prepare(`SELECT * FROM inventory_lines WHERE id=?`).get(existing.id)
  }
  return hydrateLine(existing)
 }
 const id=uid('invl'),snapshotAt=new Date().toISOString();
 db.prepare(`INSERT INTO inventory_lines(id,session_id,ean,product_number,product_name,category,theoretical_qty,unit,stock_snapshot_source,stock_snapshot_warehouse,stock_snapshot_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,sessionId,ean,sku||null,product.name,product.category||null,stock,unit,product.stockSource||null,product.warehouseId||null,snapshotAt);
 audit({storeId:session.store_id,userId:user.id,action:'INVENTORY_LINE_ADDED',entityType:'INVENTORY_LINE',entityId:id,details:{sessionId,ean,productNumber:sku||null,theoreticalQty:stock,unit,stockSource:product.stockSource||null,warehouseId:product.warehouseId||null,snapshotAt}});
 return hydrateLine(db.prepare(`SELECT * FROM inventory_lines WHERE id=?`).get(id));
}
function validReason(code){return !code||INVENTORY_REASON_CODES.some(x=>x.code===code)}
export function countInventoryLine({lineId,user,quantity,inputUnit=null,reasonCode=null,note='',recount=false}){
 const line=db.prepare(`SELECT l.*,s.store_id,s.status session_status FROM inventory_lines l JOIN inventory_sessions s ON s.id=l.session_id WHERE l.id=?`).get(lineId);if(!line)throw Object.assign(new Error('Ligne d’inventaire introuvable.'),{status:404});
 if(!['COUNTING','REVIEW'].includes(line.session_status))throw Object.assign(new Error('Cet inventaire n’est plus modifiable.'),{status:409});
 if(!validReason(reasonCode))throw Object.assign(new Error('Motif d’écart invalide.'),{status:400});
 const count=normalizedCount(quantity,inputUnit,line.unit),qty=Number(count.quantity),policy=inventoryPolicy();
 if(recount){
   if(!line.requires_recount)throw Object.assign(new Error('Cette ligne ne nécessite pas de recomptage.'),{status:409});
   const variance=qty-Number(line.theoretical_qty),finalReason=reasonCode||line.reason_code||null,decision=varianceDecision({variance,unit:line.unit,policy});
   db.prepare(`UPDATE inventory_lines SET count2_qty=?,count2_input_qty=?,count2_input_unit=?,count2_by=?,count2_at=CURRENT_TIMESTAMP,final_qty=?,final_variance=?,reason_code=?,note=?,requires_recount=0,status='COUNTED' WHERE id=?`).run(qty,count.inputQuantity,count.inputUnit,user.id,qty,variance,finalReason,note||line.note||null,lineId);
   audit({storeId:line.store_id,userId:user.id,action:'INVENTORY_RECOUNTED',entityType:'INVENTORY_LINE',entityId:lineId,details:{quantity:qty,inputQuantity:count.inputQuantity,inputUnit:count.inputUnit,stockUnit:line.unit,conversionFactor:count.factor,variance,reasonCode:finalReason,thresholds:decision}});
 }else{
   if(line.count1_qty!=null)throw Object.assign(new Error('Le premier comptage existe déjà. Utilise le recomptage si nécessaire.'),{status:409});
   const variance=qty-Number(line.theoretical_qty),decision=varianceDecision({variance,unit:line.unit,policy}),needs=decision.recount;
   db.prepare(`UPDATE inventory_lines SET count1_qty=?,count1_input_qty=?,count1_input_unit=?,count1_by=?,count1_at=CURRENT_TIMESTAMP,variance1=?,requires_recount=?,final_qty=?,final_variance=?,reason_code=?,note=?,status=? WHERE id=?`).run(qty,count.inputQuantity,count.inputUnit,user.id,variance,needs?1:0,needs?null:qty,needs?null:variance,reasonCode||null,note||null,needs?'RECOUNT':'COUNTED',lineId);
   audit({storeId:line.store_id,userId:user.id,action:needs?'INVENTORY_RECOUNT_REQUIRED':'INVENTORY_COUNTED',entityType:'INVENTORY_LINE',entityId:lineId,details:{quantity:qty,inputQuantity:count.inputQuantity,inputUnit:count.inputUnit,stockUnit:line.unit,conversionFactor:count.factor,variance,requiresRecount:needs,reasonCode,thresholds:decision}});
 }
 db.prepare(`UPDATE inventory_sessions SET status=CASE WHEN status='COUNTING' THEN 'REVIEW' ELSE status END WHERE id=?`).run(line.session_id);
 return inventorySession(line.session_id);
}
export function explainInventoryLine({lineId,user,reasonCode,note=''}) {
 const line=db.prepare(`SELECT l.*,s.store_id,s.status session_status FROM inventory_lines l JOIN inventory_sessions s ON s.id=l.session_id WHERE l.id=?`).get(lineId);if(!line)throw Object.assign(new Error('Ligne d’inventaire introuvable.'),{status:404});
 if(!['COUNTING','REVIEW'].includes(line.session_status))throw Object.assign(new Error('Cet inventaire n’est plus modifiable.'),{status:409});
 if(line.status!=='COUNTED'||line.final_variance==null||Number(line.final_variance)===0)throw Object.assign(new Error('Cette ligne n’a pas d’écart final à expliquer.'),{status:409});
 if(!reasonCode||!validReason(reasonCode))throw Object.assign(new Error('Choisis un motif valide pour expliquer l’écart.'),{status:400});
 db.prepare(`UPDATE inventory_lines SET reason_code=?,note=? WHERE id=?`).run(reasonCode,note||line.note||null,lineId);
 audit({storeId:line.store_id,userId:user.id,action:'INVENTORY_VARIANCE_EXPLAINED',entityType:'INVENTORY_LINE',entityId:lineId,details:{variance:Number(line.final_variance),reasonCode,note}});
 return inventorySession(line.session_id)
}

export function countInventoryProductInSession({sessionId,user,product,quantity,inputUnit=null,reasonCode=null,note=''}){
 const session=inventorySession(sessionId);if(!session)throw Object.assign(new Error('Inventaire introuvable.'),{status:404});
 let line=db.prepare(`SELECT * FROM inventory_lines WHERE session_id=? AND (ean=? OR (?<>'' AND product_number=?)) ORDER BY CASE WHEN ean=? THEN 0 ELSE 1 END LIMIT 1`).get(sessionId,product.ean,String(product.productNumber||''),String(product.productNumber||''),product.ean);
 if(!line)line=addInventoryLine({sessionId,user,product});else{addInventoryLine({sessionId,user,product});line=db.prepare(`SELECT * FROM inventory_lines WHERE id=?`).get(line.id)}
 if(line.status==='COUNTED')throw Object.assign(new Error('Cet article est déjà compté dans cette session. Utilise “Recompter / corriger” si nécessaire.'),{status:409,code:'INVENTORY_ALREADY_COUNTED',details:{sessionId,lineId:line.id,ean:line.ean}});
 const recount=line.status==='RECOUNT';
 const updated=countInventoryLine({lineId:line.id,user,quantity,inputUnit,reasonCode,note,recount});
 const current=updated.lines.find(x=>x.id===line.id);
 return{session:updated,line:current,step:current?.status==='RECOUNT'?'RECOUNT_REQUIRED':(Number(current?.final_variance)!==0&&!current?.reason_code?'REASON_REQUIRED':'COUNTED'),nextAction:current?.status==='RECOUNT'?'RECOUNT':(Number(current?.final_variance)!==0&&!current?.reason_code?'EXPLAIN':'SCAN_NEXT')}
}
export function expressInventoryCount({storeId,user,product,quantity,inputUnit=null,reasonCode=null,note=''}) {
 const session=getOrCreateExpressInventory({storeId,user});
 return countInventoryProductInSession({sessionId:session.id,user,product,quantity,inputUnit,reasonCode,note})
}
export function resetInventoryLine({lineId,user}={}){
 const line=db.prepare(`SELECT l.*,s.store_id,s.status session_status FROM inventory_lines l JOIN inventory_sessions s ON s.id=l.session_id WHERE l.id=?`).get(lineId);if(!line)throw Object.assign(new Error('Ligne d’inventaire introuvable.'),{status:404});
 if(!['COUNTING','REVIEW'].includes(line.session_status))throw Object.assign(new Error('Cet inventaire n’est plus modifiable.'),{status:409});
 db.prepare(`UPDATE inventory_lines SET count1_qty=NULL,count1_input_qty=NULL,count1_input_unit=NULL,count1_by=NULL,count1_at=NULL,variance1=NULL,requires_recount=0,count2_qty=NULL,count2_input_qty=NULL,count2_input_unit=NULL,count2_by=NULL,count2_at=NULL,final_qty=NULL,final_variance=NULL,reason_code=NULL,note=NULL,status='TO_COUNT' WHERE id=?`).run(lineId);
 audit({storeId:line.store_id,userId:user.id,action:'INVENTORY_LINE_RESET',entityType:'INVENTORY_LINE',entityId:lineId,details:{previousStatus:line.status}});
 return inventorySession(line.session_id)
}
export function finalizeInventorySession({sessionId,user}){
 const session=inventorySession(sessionId);if(!session)throw Object.assign(new Error('Inventaire introuvable.'),{status:404});
 if(!['COUNTING','REVIEW'].includes(session.status))throw Object.assign(new Error('Inventaire déjà finalisé.'),{status:409});
 if(!session.lines.length)throw Object.assign(new Error('Ajoute au moins un article avant validation.'),{status:409});
 const notCounted=session.lines.filter(x=>x.status!=='COUNTED');if(notCounted.length)throw Object.assign(new Error(`${notCounted.length} ligne(s) restent à compter ou recomptabiliser.`),{status:409,details:{pending:notCounted.map(x=>x.ean)}});
 const missingReason=session.lines.filter(x=>Number(x.final_variance)!==0&&!x.reason_code);if(missingReason.length)throw Object.assign(new Error('Tout écart final doit avoir un motif.'),{status:409});
 db.prepare(`UPDATE inventory_sessions SET status='READY_TO_POST',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,sessionId);
 audit({storeId:session.store_id,userId:user.id,action:'INVENTORY_READY_TO_POST',entityType:'INVENTORY_SESSION',entityId:sessionId,details:{lines:session.metrics.lines,varianceLines:session.metrics.varianceLines,absoluteVarianceQty:session.metrics.absoluteVarianceQty}});
 const ready=inventorySession(sessionId),policy=inventoryPolicy();
 return{session:ready,highVarianceLines:ready.lines.filter(x=>varianceDecision({variance:x.final_variance,unit:x.unit,policy}).incident)};
}
export function markInventoryExported({sessionId,user}={}){
 const session=inventorySession(sessionId);if(!session)throw Object.assign(new Error('Inventaire introuvable.'),{status:404});
 if(session.status!=='READY_TO_POST')throw Object.assign(new Error('L’inventaire doit être validé avant export.'),{status:409});
 db.prepare(`UPDATE inventory_sessions SET exported_by=?,exported_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,sessionId);
 audit({storeId:session.store_id,businessDate:session.business_date,userId:user.id,action:'INVENTORY_EXPORTED',entityType:'INVENTORY_SESSION',entityId:sessionId,details:{lines:session.metrics.lines,varianceLines:session.metrics.varianceLines}});
 return inventorySession(sessionId)
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

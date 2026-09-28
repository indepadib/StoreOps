import {db,uid,audit,todayISO} from '../db.mjs';

const clean=v=>String(v??'').trim();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const ORDER_STATES=new Set(['RECEIVED_PAID','PREPARING','COMPOSITION_VALIDATED','ERP_READY','ERP_BLOCKED','READY_FOR_PICKUP','PICKED_UP','CLOSED','CANCEL_PENDING','CANCELLED','REFUND_PENDING','REFUNDED']);

db.exec(`
CREATE TABLE IF NOT EXISTS cool_save_external_orders(
 id TEXT PRIMARY KEY,
 external_order_id TEXT NOT NULL UNIQUE,
 store_id TEXT NOT NULL REFERENCES stores(id),
 basket_type TEXT NULL,
 amount_paid REAL NOT NULL,
 currency TEXT NOT NULL DEFAULT 'MAD',
 payment_status TEXT NOT NULL,
 payment_reference TEXT NULL,
 pickup_code TEXT NULL,
 pickup_window_start TEXT NULL,
 pickup_window_end TEXT NULL,
 status TEXT NOT NULL DEFAULT 'RECEIVED_PAID',
 d365_order_id TEXT NULL,
 received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 prepared_at TEXT NULL,
 ready_at TEXT NULL,
 picked_up_at TEXT NULL,
 closed_at TEXT NULL
);
CREATE TABLE IF NOT EXISTS cool_save_external_order_lines(
 id TEXT PRIMARY KEY,
 order_id TEXT NOT NULL REFERENCES cool_save_external_orders(id) ON DELETE CASCADE,
 product_number TEXT NOT NULL,
 ean TEXT NULL,
 product_name TEXT NOT NULL,
 quantity REAL NOT NULL,
 unit TEXT NULL,
 lot_ref TEXT NULL,
 expiry_date TEXT NULL,
 source_type TEXT NULL,
 source_id TEXT NULL,
 reference_unit_price REAL NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_coolsave_ext_store_status ON cool_save_external_orders(store_id,status,received_at);
CREATE INDEX IF NOT EXISTS ix_coolsave_ext_lines_order ON cool_save_external_order_lines(order_id);
`);

function hydrate(row){
 if(!row)return null;
 const lines=db.prepare('SELECT * FROM cool_save_external_order_lines WHERE order_id=? ORDER BY created_at,id').all(row.id);
 return{...row,amount_paid:Number(row.amount_paid||0),lines,componentCount:lines.length}
}
function storeExists(storeId){return !!db.prepare('SELECT 1 FROM stores WHERE id=? AND active=1').get(storeId)}
export function coolSaveExternalOrder(id){return hydrate(db.prepare('SELECT * FROM cool_save_external_orders WHERE id=?').get(id))}
export function coolSaveExternalOrderByExternalId(externalOrderId){return hydrate(db.prepare('SELECT * FROM cool_save_external_orders WHERE external_order_id=?').get(clean(externalOrderId)))}
export function listCoolSaveExternalOrders(storeId,{limit=100}={}){
 return db.prepare('SELECT * FROM cool_save_external_orders WHERE store_id=? ORDER BY received_at DESC LIMIT ?').all(storeId,Math.max(1,Math.min(500,Number(limit)||100))).map(hydrate)
}
export function coolSaveExternalOrderSummary(storeId){
 const rows=db.prepare(`SELECT status,COUNT(*) n FROM cool_save_external_orders WHERE store_id=? GROUP BY status`).all(storeId),byStatus=Object.fromEntries(rows.map(x=>[x.status,Number(x.n||0)]));
 return{total:rows.reduce((s,x)=>s+Number(x.n||0),0),receivedPaid:byStatus.RECEIVED_PAID||0,preparing:byStatus.PREPARING||0,ready:(byStatus.READY_FOR_PICKUP||0),erpBlocked:byStatus.ERP_BLOCKED||0,pickedUp:(byStatus.PICKED_UP||0)+(byStatus.CLOSED||0),byStatus}
}
export function ingestCoolSaveExternalOrder(input={}){
 const externalOrderId=clean(input.externalOrderId||input.orderId),storeId=clean(input.storeId),basketType=clean(input.basketType)||null,amountPaid=n(input.amountPaid),paymentStatus=clean(input.paymentStatus||'PAID').toUpperCase(),paymentReference=clean(input.paymentReference)||null,pickupCode=clean(input.pickupCode)||null;
 if(!externalOrderId)throw Object.assign(new Error('externalOrderId obligatoire.'),{status:400,code:'COOL_SAVE_EXTERNAL_ORDER_ID_REQUIRED'});
 const existing=coolSaveExternalOrderByExternalId(externalOrderId);if(existing)return{...existing,idempotentReplay:true};
 if(!storeId||!storeExists(storeId))throw Object.assign(new Error('Magasin Cool & Save inconnu ou inactif.'),{status:400,code:'COOL_SAVE_STORE_INVALID'});
 if(amountPaid===null||amountPaid<0)throw Object.assign(new Error('Montant payé invalide.'),{status:400,code:'COOL_SAVE_AMOUNT_INVALID'});
 if(paymentStatus!=='PAID')throw Object.assign(new Error('Seules les commandes payées sont injectées dans le flux magasin.'),{status:409,code:'COOL_SAVE_ORDER_NOT_PAID'});
 const id=uid('cso');
 db.prepare(`INSERT INTO cool_save_external_orders(id,external_order_id,store_id,basket_type,amount_paid,currency,payment_status,payment_reference,pickup_code,pickup_window_start,pickup_window_end,status)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,'RECEIVED_PAID')`).run(id,externalOrderId,storeId,basketType,amountPaid,clean(input.currency)||'MAD',paymentStatus,paymentReference,pickupCode,input.pickupWindowStart||null,input.pickupWindowEnd||null);
 audit({storeId,businessDate:todayISO(),userId:null,action:'COOL_SAVE_EXTERNAL_ORDER_RECEIVED',entityType:'COOL_SAVE_ORDER',entityId:id,details:{externalOrderId,basketType,amountPaid,paymentStatus,paymentReference}});
 return coolSaveExternalOrder(id)
}
export function replaceCoolSaveOrderComposition({id,user,lines=[]}={}){
 const order=coolSaveExternalOrder(id);if(!order)throw Object.assign(new Error('Commande Cool & Save introuvable.'),{status:404});
 if(!['RECEIVED_PAID','PREPARING','COMPOSITION_VALIDATED','ERP_BLOCKED'].includes(order.status))throw Object.assign(new Error('La composition ne peut plus être modifiée à ce stade.'),{status:409});
 const cleanLines=(lines||[]).map(x=>({productNumber:clean(x.productNumber),ean:clean(x.ean)||null,productName:clean(x.productName),quantity:n(x.quantity),unit:clean(x.unit)||null,lotRef:clean(x.lotRef)||null,expiryDate:clean(x.expiryDate)||null,sourceType:clean(x.sourceType)||null,sourceId:clean(x.sourceId)||null,referenceUnitPrice:n(x.referenceUnitPrice)})).filter(x=>x.productNumber&&x.productName&&x.quantity!==null&&x.quantity>0);
 if(!cleanLines.length)throw Object.assign(new Error('La composition doit contenir au moins un article réel.'),{status:400,code:'COOL_SAVE_COMPOSITION_EMPTY'});
 db.exec('BEGIN');try{
  db.prepare('DELETE FROM cool_save_external_order_lines WHERE order_id=?').run(id);
  const ins=db.prepare('INSERT INTO cool_save_external_order_lines(id,order_id,product_number,ean,product_name,quantity,unit,lot_ref,expiry_date,source_type,source_id,reference_unit_price) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const x of cleanLines)ins.run(uid('csol'),id,x.productNumber,x.ean,x.productName,x.quantity,x.unit,x.lotRef,x.expiryDate,x.sourceType,x.sourceId,x.referenceUnitPrice);
  db.prepare(`UPDATE cool_save_external_orders SET status='COMPOSITION_VALIDATED',prepared_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);db.exec('COMMIT')
 }catch(error){db.exec('ROLLBACK');throw error}
 audit({storeId:order.store_id,userId:user?.id||null,action:'COOL_SAVE_COMPOSITION_VALIDATED',entityType:'COOL_SAVE_ORDER',entityId:id,details:{externalOrderId:order.external_order_id,lines:cleanLines.length}});
 return coolSaveExternalOrder(id)
}
export function setCoolSaveExternalOrderState({id,user,status,d365OrderId=null}={}){
 const order=coolSaveExternalOrder(id);if(!order)throw Object.assign(new Error('Commande Cool & Save introuvable.'),{status:404});const target=clean(status).toUpperCase();if(!ORDER_STATES.has(target))throw Object.assign(new Error('Statut Cool & Save invalide.'),{status:400});
 const lineCount=order.lines.length;if(['ERP_READY','READY_FOR_PICKUP','PICKED_UP','CLOSED'].includes(target)&&!lineCount)throw Object.assign(new Error('Impossible d’avancer sans composition article réelle.'),{status:409,code:'COOL_SAVE_COMPONENTS_REQUIRED'});
 if(['READY_FOR_PICKUP','PICKED_UP','CLOSED'].includes(target)&&!clean(d365OrderId||order.d365_order_id))throw Object.assign(new Error('Référence commande Dynamics obligatoire avant retrait.'),{status:409,code:'COOL_SAVE_D365_ORDER_REQUIRED'});
 const erp=clean(d365OrderId)||order.d365_order_id||null,readyAt=target==='READY_FOR_PICKUP'?'CURRENT_TIMESTAMP':null,pickedAt=target==='PICKED_UP'?'CURRENT_TIMESTAMP':null,closedAt=target==='CLOSED'?'CURRENT_TIMESTAMP':null;
 db.prepare(`UPDATE cool_save_external_orders SET status=?,d365_order_id=COALESCE(?,d365_order_id),updated_at=CURRENT_TIMESTAMP,ready_at=CASE WHEN ?='READY_FOR_PICKUP' THEN CURRENT_TIMESTAMP ELSE ready_at END,picked_up_at=CASE WHEN ?='PICKED_UP' THEN CURRENT_TIMESTAMP ELSE picked_up_at END,closed_at=CASE WHEN ?='CLOSED' THEN CURRENT_TIMESTAMP ELSE closed_at END WHERE id=?`).run(target,erp,target,target,target,id);
 audit({storeId:order.store_id,userId:user?.id||null,action:`COOL_SAVE_ORDER_${target}`,entityType:'COOL_SAVE_ORDER',entityId:id,details:{externalOrderId:order.external_order_id,d365OrderId:erp}});
 return coolSaveExternalOrder(id)
}

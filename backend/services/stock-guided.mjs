import { db,uid,audit,todayISO } from '../db.mjs';
import { getStockSignals } from './stock-signals.mjs';
import { createInventorySession,addInventoryLine } from './inventory.mjs';

const FLOW_TYPES=['NEGATIVE','OUT'];
const clean=v=>String(v??'').trim();
const flowLabel=type=>type==='NEGATIVE'?'Stocks négatifs':'Ruptures';
const zoneLabel=type=>type==='NEGATIVE'?'Anomalies stock · Stocks négatifs':'Anomalies stock · Ruptures avec stock trouvé';

db.exec(`
CREATE TABLE IF NOT EXISTS stock_guided_reviews(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 signal_type TEXT NOT NULL CHECK(signal_type IN ('NEGATIVE','OUT')),
 signal_key TEXT NOT NULL,
 product_number TEXT NOT NULL,
 ean TEXT NULL,
 product_name TEXT NOT NULL,
 warehouse TEXT NULL,
 system_qty REAL NULL,
 physical_qty REAL NULL,
 assortment_status TEXT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DONE')),
 outcome TEXT NULL,
 note TEXT NULL,
 inventory_session_id TEXT NULL REFERENCES inventory_sessions(id),
 reviewed_by TEXT NULL REFERENCES users(id),
 reviewed_at TEXT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(store_id,business_date,signal_type,product_number)
);
CREATE INDEX IF NOT EXISTS ix_stock_guided_store_day ON stock_guided_reviews(store_id,business_date,signal_type,active,status);
`);

function requireType(type){const v=clean(type).toUpperCase();if(!FLOW_TYPES.includes(v))throw Object.assign(new Error('Parcours stock invalide.'),{status:400,code:'STOCK_GUIDED_TYPE_INVALID'});return v}
function syncSignals(storeId,businessDate,type,signals=[]){
 db.prepare(`UPDATE stock_guided_reviews SET active=0,updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND business_date=? AND signal_type=?`).run(storeId,businessDate,type);
 const upsert=db.prepare(`INSERT INTO stock_guided_reviews(id,store_id,business_date,signal_type,signal_key,product_number,ean,product_name,warehouse,system_qty,physical_qty,assortment_status,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)
 ON CONFLICT(store_id,business_date,signal_type,product_number) DO UPDATE SET signal_key=excluded.signal_key,ean=excluded.ean,product_name=excluded.product_name,warehouse=excluded.warehouse,system_qty=excluded.system_qty,physical_qty=excluded.physical_qty,assortment_status=excluded.assortment_status,active=1,updated_at=CURRENT_TIMESTAMP`);
 for(const sig of signals){
  const productNumber=clean(sig.productNumber||sig.product||sig.ean);if(!productNumber)continue;
  upsert.run(uid('stockrev'),storeId,businessDate,type,clean(sig.id)||`${type}-${productNumber}`,productNumber,clean(sig.ean)||null,clean(sig.product)||productNumber,clean(sig.warehouse)||null,Number.isFinite(Number(sig.availableQty??sig.qty))?Number(sig.availableQty??sig.qty):null,Number.isFinite(Number(sig.physicalQty))?Number(sig.physicalQty):null,clean(sig.assortmentStatus)||null)
 }
}
function rowsFor(storeId,businessDate,type){return db.prepare(`SELECT r.*,u.name reviewed_by_name FROM stock_guided_reviews r LEFT JOIN users u ON u.id=r.reviewed_by WHERE r.store_id=? AND r.business_date=? AND r.signal_type=? AND r.active=1 ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END,CASE WHEN r.system_qty IS NULL THEN 1 ELSE 0 END,r.system_qty,r.product_name`).all(storeId,businessDate,type)}
function flowView(storeId,businessDate,type,stockData){
 const rows=rowsFor(storeId,businessDate,type),pending=rows.filter(x=>x.status==='PENDING'),done=rows.filter(x=>x.status==='DONE'),current=pending[0]||null,inventorySessionIds=[...new Set(rows.map(x=>x.inventory_session_id).filter(Boolean))];
 return{status:'READY',storeId,businessDate,type,label:flowLabel(type),source:stockData?.source||null,warehouse:stockData?.warehouse||null,stockSummary:stockData?.summary||{},items:rows,current,progress:{total:rows.length,done:done.length,pending:pending.length,position:current?done.length+1:rows.length,percent:rows.length?Math.round(done.length*100/rows.length):100},inventorySessionIds,complete:rows.length===0||pending.length===0}
}
export async function getStockGuidedFlow(storeId,type,{businessDate=todayISO(),force=false}={}){
 const kind=requireType(type),stockData=await getStockSignals(storeId,{businessDate,force}),signals=(stockData.items||[]).filter(x=>x.type===kind);
 syncSignals(storeId,businessDate,kind,signals);
 return flowView(storeId,businessDate,kind,stockData)
}
export function readStockGuidedFlow(storeId,type,{businessDate=todayISO()}={}){
 const kind=requireType(type);return flowView(storeId,businessDate,kind,{source:'STOREOPS_REVIEW_STATE',summary:{}})
}
function ensureInventorySession({storeId,businessDate,type,user}){
 const zone=zoneLabel(type),existing=db.prepare(`SELECT id FROM inventory_sessions WHERE store_id=? AND business_date=? AND inventory_type='TARGETED' AND zone=? AND status IN ('COUNTING','REVIEW') ORDER BY created_at DESC LIMIT 1`).get(storeId,businessDate,zone);
 if(existing)return existing.id;
 return createInventorySession({storeId,user,type:'TARGETED',zone,comment:`Créé depuis le parcours guidé ${flowLabel(type)} StoreOps`}).id
}
function addReviewToInventory(row,user){
 const sessionId=ensureInventorySession({storeId:row.store_id,businessDate:row.business_date,type:row.signal_type,user});
 const ean=clean(row.ean)||`ITEM:${row.product_number}`;
 addInventoryLine({sessionId,user,product:{ean,productNumber:row.product_number,name:row.product_name,category:null,stock:Number(row.system_qty??0)}});
 return sessionId
}
export async function completeStockGuidedReview({storeId,type,reviewId,user,outcome,note='',businessDate=todayISO()}){
 const kind=requireType(type),row=db.prepare(`SELECT * FROM stock_guided_reviews WHERE id=? AND store_id=? AND business_date=? AND signal_type=? AND active=1`).get(reviewId,storeId,businessDate,kind);
 if(!row)throw Object.assign(new Error('Article du parcours stock introuvable ou déjà sorti du signal courant.'),{status:404,code:'STOCK_GUIDED_REVIEW_NOT_FOUND'});
 const value=clean(outcome).toUpperCase(),allowed=kind==='NEGATIVE'?['INVENTORY_STARTED']:['CONFIRMED_OOS','INVENTORY_STARTED'];
 if(!allowed.includes(value))throw Object.assign(new Error('Résultat de contrôle stock invalide.'),{status:400,code:'STOCK_GUIDED_OUTCOME_INVALID',details:{allowed}});
 let inventorySessionId=null;if(value==='INVENTORY_STARTED')inventorySessionId=addReviewToInventory(row,user);
 db.prepare(`UPDATE stock_guided_reviews SET status='DONE',outcome=?,note=?,inventory_session_id=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(value,clean(note)||null,inventorySessionId,user.id,row.id);
 audit({storeId,businessDate,userId:user.id,action:'STOCK_GUIDED_REVIEW_COMPLETED',entityType:'STOCK_GUIDED_REVIEW',entityId:row.id,details:{signalType:kind,productNumber:row.product_number,outcome:value,inventorySessionId}});
 return getStockGuidedFlow(storeId,kind,{businessDate,force:false})
}

export const stockGuidedConfig=()=>({types:FLOW_TYPES.map(code=>({code,label:flowLabel(code)})),outcomes:{NEGATIVE:[{code:'INVENTORY_STARTED',label:'Ajouter à l’inventaire ciblé'}],OUT:[{code:'CONFIRMED_OOS',label:'Rupture confirmée'},{code:'INVENTORY_STARTED',label:'Stock trouvé → inventaire ciblé'}]}})

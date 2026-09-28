import {db,uid,audit,todayISO} from '../db.mjs';
import {listDlc} from './dlc.mjs';
import {sellThroughSnapshot} from './sell-through.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS cool_save_baskets(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 code TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 sale_price REAL NOT NULL,
 reference_value REAL NULL,
 status TEXT NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','RESERVED','SOLD','CANCELLED','EXPIRED')),
 expires_at TEXT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 published_by TEXT NULL REFERENCES users(id),
 published_at TEXT NULL,
 sold_by TEXT NULL REFERENCES users(id),
 sold_at TEXT NULL,
 settlement_reference TEXT NULL,
 erp_status TEXT NOT NULL DEFAULT 'NOT_POSTED'
);
CREATE TABLE IF NOT EXISTS cool_save_lines(
 id TEXT PRIMARY KEY,
 basket_id TEXT NOT NULL REFERENCES cool_save_baskets(id) ON DELETE CASCADE,
 product_number TEXT NULL,
 ean TEXT NULL,
 product_name TEXT NOT NULL,
 quantity REAL NOT NULL,
 unit TEXT NOT NULL DEFAULT 'pièce',
 reference_unit_price REAL NULL,
 source_type TEXT NULL,
 source_id TEXT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_coolsave_store_status ON cool_save_baskets(store_id,status,business_date);
CREATE INDEX IF NOT EXISTS ix_coolsave_lines_basket ON cool_save_lines(basket_id);
`);

const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const round=v=>Math.round((n(v)+Number.EPSILON)*100)/100;
function userName(id){return id?db.prepare('SELECT name FROM users WHERE id=?').get(id)?.name||null:null}
function lines(id){return db.prepare('SELECT * FROM cool_save_lines WHERE basket_id=? ORDER BY created_at,id').all(id)}
function hydrate(row){if(!row)return null;const l=lines(row.id);return{...row,sale_price:n(row.sale_price),reference_value:row.reference_value==null?null:n(row.reference_value),created_by_name:userName(row.created_by),published_by_name:userName(row.published_by),sold_by_name:userName(row.sold_by),lines:l,discount_rate:row.reference_value>0?round((1-n(row.sale_price)/n(row.reference_value))*100):null,erpBridge:{writeBack:false,saleItem:process.env.D365_COOL_SAVE_SALE_ITEM||null,status:row.erp_status||'NOT_POSTED'}}}
function code(){return `CS-${todayISO().replaceAll('-','')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`}
export function listCoolSaveBaskets(storeId,{status='ALL'}={}){
 const allowed=['ALL','DRAFT','PUBLISHED','RESERVED','SOLD','CANCELLED','EXPIRED'],s=allowed.includes(status)?status:'ALL',rows=s==='ALL'?db.prepare('SELECT * FROM cool_save_baskets WHERE store_id=? ORDER BY created_at DESC').all(storeId):db.prepare('SELECT * FROM cool_save_baskets WHERE store_id=? AND status=? ORDER BY created_at DESC').all(storeId,s);
 return rows.map(hydrate)
}
export function coolSaveBasket(id){return hydrate(db.prepare('SELECT * FROM cool_save_baskets WHERE id=?').get(id))}
export async function coolSaveSuggestions(storeId,{businessDate=todayISO()}={}){
 const dlc=listDlc(storeId,'ACTIVE').filter(x=>n(x.remaining_quantity)>0&&n(x.risk?.daysRemaining)>=0&&['CRITICAL','ALERT','WATCH','CONFORM'].includes(x.risk?.stage)),sell=await sellThroughSnapshot(storeId,{businessDate});
 const dlcItems=dlc.slice(0,40).map(x=>({id:`dlc:${x.id}`,sourceType:'DLC',sourceId:x.id,productNumber:x.product_number||null,ean:x.ean||null,name:x.product_name,quantity:n(x.remaining_quantity),unit:x.unit||'pièce',referenceUnitPrice:x.unit_retail_value==null?null:n(x.unit_retail_value),reason:`${x.risk.label} · ${x.risk.daysRemaining} jour(s) restant(s)`,priority:x.risk.severity,eligibility:'ELIGIBLE_DLC'}));
 const rotationItems=(sell.items||[]).slice(0,50).map(x=>({id:`rotation:${x.productNumber}`,sourceType:x.type==='DEAD'?'DEAD_STOCK':'SLOW_MOVER',sourceId:x.productNumber,productNumber:x.productNumber,ean:x.ean||null,name:x.name||x.productNumber,quantity:n(x.availableStock),unit:'pièce',referenceUnitPrice:null,reason:x.reason,priority:x.priority,eligibility:'REVIEW_REQUIRED'}));
 return{status:'READY',storeId,businessDate,items:[...dlcItems,...rotationItems],summary:{dlc:dlcItems.length,dead:rotationItems.filter(x=>x.sourceType==='DEAD_STOCK').length,slow:rotationItems.filter(x=>x.sourceType==='SLOW_MOVER').length},policy:{expiredDlcExcluded:true,manualReviewForSlowMovers:true}}
}
export function createCoolSaveBasket({storeId,user,title='Panier Cool & Save',salePrice,expiresAt=null,items=[]}){
 const price=Number(salePrice);if(!Number.isFinite(price)||price<0)throw Object.assign(new Error('Prix du panier invalide.'),{status:400});
 const cleanItems=(items||[]).map(x=>({...x,quantity:Number(x.quantity)})).filter(x=>x.productName||x.name).filter(x=>Number.isFinite(x.quantity)&&x.quantity>0);
 if(!cleanItems.length)throw Object.assign(new Error('Ajoute au moins un article au panier.'),{status:400});
 const id=uid('cs'),basketCode=code(),reference=cleanItems.every(x=>x.referenceUnitPrice!=null)?round(cleanItems.reduce((s,x)=>s+n(x.quantity)*n(x.referenceUnitPrice),0)):null;
 db.exec('BEGIN');try{
  db.prepare(`INSERT INTO cool_save_baskets(id,store_id,business_date,code,title,sale_price,reference_value,status,expires_at,created_by) VALUES(?,?,?,?,?,?,?,'DRAFT',?,?)`).run(id,storeId,todayISO(),basketCode,String(title||'Panier Cool & Save').trim(),price,reference,expiresAt||null,user.id);
  const ins=db.prepare('INSERT INTO cool_save_lines(id,basket_id,product_number,ean,product_name,quantity,unit,reference_unit_price,source_type,source_id) VALUES(?,?,?,?,?,?,?,?,?,?)');
  for(const x of cleanItems)ins.run(uid('csl'),id,x.productNumber||null,x.ean||null,x.productName||x.name,x.quantity,x.unit||'pièce',x.referenceUnitPrice==null?null:n(x.referenceUnitPrice),x.sourceType||null,x.sourceId||null);
  db.exec('COMMIT')
 }catch(e){db.exec('ROLLBACK');throw e}
 audit({storeId,userId:user.id,action:'COOL_SAVE_BASKET_CREATED',entityType:'COOL_SAVE',entityId:id,details:{code:basketCode,salePrice:price,referenceValue:reference,lines:cleanItems.length}});
 return coolSaveBasket(id)
}
export function publishCoolSaveBasket({id,user}){
 const row=db.prepare('SELECT * FROM cool_save_baskets WHERE id=?').get(id);if(!row)throw Object.assign(new Error('Panier introuvable.'),{status:404});if(row.status!=='DRAFT')throw Object.assign(new Error('Seul un panier brouillon peut être publié.'),{status:409});
 db.prepare(`UPDATE cool_save_baskets SET status='PUBLISHED',published_by=?,published_at=CURRENT_TIMESTAMP WHERE id=?`).run(user.id,id);audit({storeId:row.store_id,userId:user.id,action:'COOL_SAVE_BASKET_PUBLISHED',entityType:'COOL_SAVE',entityId:id,details:{code:row.code}});return coolSaveBasket(id)
}
export function markCoolSaveSold({id,user,settlementReference=null}){
 const row=db.prepare('SELECT * FROM cool_save_baskets WHERE id=?').get(id);if(!row)throw Object.assign(new Error('Panier introuvable.'),{status:404});if(!['PUBLISHED','RESERVED'].includes(row.status))throw Object.assign(new Error('Le panier doit être publié avant d’être vendu.'),{status:409});
 const erpStatus=process.env.D365_COOL_SAVE_SALE_ITEM?'READY_FOR_BRIDGE':'CONFIG_REQUIRED';
 db.prepare(`UPDATE cool_save_baskets SET status='SOLD',sold_by=?,sold_at=CURRENT_TIMESTAMP,settlement_reference=?,erp_status=? WHERE id=?`).run(user.id,settlementReference||null,erpStatus,id);audit({storeId:row.store_id,userId:user.id,action:'COOL_SAVE_BASKET_SOLD',entityType:'COOL_SAVE',entityId:id,details:{code:row.code,settlementReference,erpStatus}});return coolSaveBasket(id)
}
export function cancelCoolSaveBasket({id,user}){
 const row=db.prepare('SELECT * FROM cool_save_baskets WHERE id=?').get(id);if(!row)throw Object.assign(new Error('Panier introuvable.'),{status:404});if(row.status==='SOLD')throw Object.assign(new Error('Un panier vendu ne peut pas être annulé ici.'),{status:409});
 db.prepare(`UPDATE cool_save_baskets SET status='CANCELLED' WHERE id=?`).run(id);audit({storeId:row.store_id,userId:user.id,action:'COOL_SAVE_BASKET_CANCELLED',entityType:'COOL_SAVE',entityId:id,details:{code:row.code}});return coolSaveBasket(id)
}
export function coolSaveSummary(storeId){
 const rows=listCoolSaveBaskets(storeId),open=rows.filter(x=>['DRAFT','PUBLISHED','RESERVED'].includes(x.status)),sold=rows.filter(x=>x.status==='SOLD');
 return{total:rows.length,open:open.length,published:rows.filter(x=>x.status==='PUBLISHED').length,sold:sold.length,revenue:round(sold.reduce((s,x)=>s+n(x.sale_price),0)),referenceValue:round(sold.reduce((s,x)=>s+n(x.reference_value),0)),savedValue:round(sold.reduce((s,x)=>s+Math.max(0,n(x.reference_value)-n(x.sale_price)),0))}
}

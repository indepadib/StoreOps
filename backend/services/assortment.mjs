import { db } from '../db.mjs';

const clean=v=>String(v??'').trim();
const isoDate=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):null;

db.exec(`
CREATE TABLE IF NOT EXISTS merchandising_categories(
 source TEXT NOT NULL,
 hierarchy_key TEXT NOT NULL,
 category_id TEXT NOT NULL,
 category_name TEXT NOT NULL,
 parent_category_id TEXT NULL,
 level INTEGER NULL,
 path TEXT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(source,hierarchy_key,category_id)
);
CREATE TABLE IF NOT EXISTS merchandising_product_categories(
 source TEXT NOT NULL,
 hierarchy_key TEXT NOT NULL,
 product_number TEXT NOT NULL,
 category_id TEXT NOT NULL,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(source,hierarchy_key,product_number,category_id)
);
CREATE TABLE IF NOT EXISTS store_assortment_state(
 store_id TEXT NOT NULL REFERENCES stores(id),
 source TEXT NOT NULL,
 assortment_key TEXT NOT NULL,
 assortment_name TEXT NULL,
 complete INTEGER NOT NULL DEFAULT 0,
 valid_from TEXT NULL,
 valid_to TEXT NULL,
 row_count INTEGER NOT NULL DEFAULT 0,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(store_id,source,assortment_key)
);
CREATE TABLE IF NOT EXISTS store_assortment_products(
 store_id TEXT NOT NULL REFERENCES stores(id),
 source TEXT NOT NULL,
 assortment_key TEXT NOT NULL,
 product_number TEXT NOT NULL,
 included INTEGER NOT NULL DEFAULT 1,
 reason TEXT NULL,
 valid_from TEXT NULL,
 valid_to TEXT NULL,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(store_id,source,assortment_key,product_number)
);
CREATE INDEX IF NOT EXISTS ix_merch_product_category ON merchandising_product_categories(product_number,hierarchy_key);
CREATE INDEX IF NOT EXISTS ix_assortment_store_product ON store_assortment_products(store_id,product_number,included);
`);

function activeWindow(from,to,day){
 const f=isoDate(from),t=isoDate(to),d=isoDate(day)||new Date().toISOString().slice(0,10);
 return (!f||f<=d)&&(!t||t>=d)
}
function timestampMs(value){
 const s=clean(value);if(!s)return null;const normalized=/Z$|[+-]\d\d:\d\d$/.test(s)?s:s.replace(' ','T')+'Z',ms=Date.parse(normalized);return Number.isFinite(ms)?ms:null
}
function isFresh(value,maxAgeHours){
 const limit=Number(maxAgeHours);if(!Number.isFinite(limit)||limit<=0)return true;const ms=timestampMs(value);return ms!==null&&Date.now()-ms<=limit*3600000
}
function insertAssortment(tx,{store,source,key,name=null,products=[],complete=true,validFrom=null,validTo=null}){
 const ins=tx.prepare(`INSERT INTO store_assortment_products(store_id,source,assortment_key,product_number,included,reason,valid_from,valid_to,synced_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`);
 let inserted=0;
 for(const raw of Array.isArray(products)?products:[]){const row=typeof raw==='string'?{productNumber:raw}:raw||{},p=clean(row.productNumber??row.itemNumber??row.product);if(!p)continue;ins.run(store,source,key,p,row.included===false?0:1,clean(row.reason)||null,isoDate(row.validFrom??validFrom),isoDate(row.validTo??validTo));inserted++}
 tx.prepare(`INSERT INTO store_assortment_state(store_id,source,assortment_key,assortment_name,complete,valid_from,valid_to,row_count,synced_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(store_id,source,assortment_key) DO UPDATE SET assortment_name=excluded.assortment_name,complete=excluded.complete,valid_from=excluded.valid_from,valid_to=excluded.valid_to,row_count=excluded.row_count,synced_at=CURRENT_TIMESTAMP`).run(store,source,key,clean(name)||null,complete?1:0,isoDate(validFrom),isoDate(validTo),inserted);
 return inserted
}

export function syncCategoryHierarchy({source='GENERIC',hierarchyKey='PROCUREMENT',categories=[]}={}){
 const s=clean(source)||'GENERIC',h=clean(hierarchyKey)||'PROCUREMENT';
 db.exec('BEGIN');
 try{
  db.prepare(`DELETE FROM merchandising_categories WHERE source=? AND hierarchy_key=?`).run(s,h);
  const ins=db.prepare(`INSERT INTO merchandising_categories(source,hierarchy_key,category_id,category_name,parent_category_id,level,path,active,synced_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`);
  let inserted=0;
  for(const row of Array.isArray(categories)?categories:[]){
   const id=clean(row.categoryId??row.id??row.code),name=clean(row.categoryName??row.name??row.label);if(!id||!name)continue;
   ins.run(s,h,id,name,clean(row.parentCategoryId??row.parentId)||null,Number.isFinite(Number(row.level))?Number(row.level):null,clean(row.path)||null,row.active===false?0:1);inserted++;
  }
  db.exec('COMMIT');return{source:s,hierarchyKey:h,inserted};
 }catch(error){db.exec('ROLLBACK');throw error}
}

export function syncProductCategoryAssignments({source='GENERIC',hierarchyKey='PROCUREMENT',assignments=[]}={}){
 const s=clean(source)||'GENERIC',h=clean(hierarchyKey)||'PROCUREMENT';
 db.exec('BEGIN');
 try{
  db.prepare(`DELETE FROM merchandising_product_categories WHERE source=? AND hierarchy_key=?`).run(s,h);
  const ins=db.prepare(`INSERT OR IGNORE INTO merchandising_product_categories(source,hierarchy_key,product_number,category_id,synced_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)`);
  let inserted=0;
  for(const row of Array.isArray(assignments)?assignments:[]){const p=clean(row.productNumber??row.itemNumber??row.product),c=clean(row.categoryId??row.category);if(!p||!c)continue;inserted+=Number(ins.run(s,h,p,c).changes||0)}
  db.exec('COMMIT');return{source:s,hierarchyKey:h,inserted};
 }catch(error){db.exec('ROLLBACK');throw error}
}

export function syncStoreAssortmentSnapshot({storeId,source='GENERIC',assortmentKey='default',assortmentName=null,products=[],complete=true,validFrom=null,validTo=null}={}){
 const store=clean(storeId),s=clean(source)||'GENERIC',key=clean(assortmentKey)||'default';if(!store)throw Object.assign(new Error('storeId obligatoire pour synchroniser un assortiment.'),{status:400,code:'ASSORTMENT_STORE_REQUIRED'});
 db.exec('BEGIN');
 try{
  db.prepare(`DELETE FROM store_assortment_products WHERE store_id=? AND source=? AND assortment_key=?`).run(store,s,key);
  const inserted=insertAssortment(db,{store,source:s,key,name:assortmentName,products,complete,validFrom,validTo});
  db.exec('COMMIT');return{storeId:store,source:s,assortmentKey:key,complete:!!complete,rowCount:inserted};
 }catch(error){db.exec('ROLLBACK');throw error}
}

export function replaceStoreAssortmentSnapshots({storeId,source='GENERIC',assortments=[]}={}){
 const store=clean(storeId),s=clean(source)||'GENERIC';if(!store)throw Object.assign(new Error('storeId obligatoire pour synchroniser les assortiments.'),{status:400,code:'ASSORTMENT_STORE_REQUIRED'});
 const rows=Array.isArray(assortments)?assortments:[];if(!rows.length)throw Object.assign(new Error('Snapshot assortiment vide refusé : conserver le dernier snapshot fiable.'),{status:409,code:'ASSORTMENT_EMPTY_SNAPSHOT'});
 db.exec('BEGIN');
 try{
  db.prepare(`DELETE FROM store_assortment_products WHERE store_id=? AND source=?`).run(store,s);
  db.prepare(`DELETE FROM store_assortment_state WHERE store_id=? AND source=?`).run(store,s);
  let productRows=0;
  for(const a of rows){const key=clean(a.assortmentKey??a.key??a.id);if(!key)continue;productRows+=insertAssortment(db,{store,source:s,key,name:a.assortmentName??a.name,products:a.products||[],complete:a.complete!==false,validFrom:a.validFrom,validTo:a.validTo})}
  if(!db.prepare(`SELECT COUNT(*) n FROM store_assortment_state WHERE store_id=? AND source=?`).get(store,s).n)throw Object.assign(new Error('Aucun assortiment valide dans le snapshot.'),{status:409,code:'ASSORTMENT_NO_VALID_SET'});
  db.exec('COMMIT');return{storeId:store,source:s,assortmentCount:rows.length,productRows};
 }catch(error){db.exec('ROLLBACK');throw error}
}

export function assortmentIndex(storeId,{businessDate=null,source=null,maxAgeHours=null}={}){
 const store=clean(storeId),day=isoDate(businessDate)||new Date().toISOString().slice(0,10),states=(source?db.prepare(`SELECT * FROM store_assortment_state WHERE store_id=? AND source=?`).all(store,clean(source)):db.prepare(`SELECT * FROM store_assortment_state WHERE store_id=?`).all(store)).filter(x=>activeWindow(x.valid_from,x.valid_to,day));
 const completeStates=states.filter(x=>Number(x.complete)===1);if(!completeStates.length)return{status:'UNKNOWN',storeId:store,businessDate:day,source:source||null,included:new Set(),excluded:new Set(),assortments:[],syncedAt:null};
 const syncedAt=completeStates.map(x=>x.synced_at).sort().at(-1)||null;
 if(!isFresh(syncedAt,maxAgeHours))return{status:'STALE',storeId:store,businessDate:day,source:source||null,included:new Set(),excluded:new Set(),assortments:completeStates.map(x=>({source:x.source,key:x.assortment_key,name:x.assortment_name,rowCount:x.row_count,validFrom:x.valid_from,validTo:x.valid_to,syncedAt:x.synced_at})),syncedAt};
 const allowedKeys=new Set(completeStates.map(x=>`${x.source}::${x.assortment_key}`)),rows=db.prepare(`SELECT * FROM store_assortment_products WHERE store_id=?`).all(store).filter(x=>allowedKeys.has(`${x.source}::${x.assortment_key}`)&&activeWindow(x.valid_from,x.valid_to,day));
 const included=new Set(),excluded=new Set();for(const row of rows){if(Number(row.included)===0)excluded.add(row.product_number);else included.add(row.product_number)}for(const p of excluded)included.delete(p);
 return{status:'READY',storeId:store,businessDate:day,source:source||null,included,excluded,assortments:completeStates.map(x=>({source:x.source,key:x.assortment_key,name:x.assortment_name,rowCount:x.row_count,validFrom:x.valid_from,validTo:x.valid_to,syncedAt:x.synced_at})),syncedAt};
}

export function assortmentMembership(storeId,productNumber,{businessDate=null,source=null,index=null,maxAgeHours=null}={}){
 const p=clean(productNumber),idx=index||assortmentIndex(storeId,{businessDate,source,maxAgeHours});if(!p||idx.status!=='READY')return{status:'UNKNOWN',productNumber:p||null,storeId:clean(storeId),assortmentReady:false,assortmentState:idx.status};
 if(idx.excluded.has(p))return{status:'NOT_ASSORTED',productNumber:p,storeId:clean(storeId),assortmentReady:true,reason:'EXCLUDED'};
 if(idx.included.has(p))return{status:'ASSORTED',productNumber:p,storeId:clean(storeId),assortmentReady:true};
 return{status:'NOT_ASSORTED',productNumber:p,storeId:clean(storeId),assortmentReady:true,reason:'NOT_IN_ACTIVE_ASSORTMENT'};
}

export function productTaxonomy(productNumber,{hierarchyKey=null,source=null}={}){
 const p=clean(productNumber);if(!p)return[];
 const where=['pc.product_number=?'],args=[p];if(hierarchyKey){where.push('pc.hierarchy_key=?');args.push(clean(hierarchyKey))}if(source){where.push('pc.source=?');args.push(clean(source))}
 return db.prepare(`SELECT pc.source,pc.hierarchy_key,pc.category_id,c.category_name,c.parent_category_id,c.level,c.path,c.active FROM merchandising_product_categories pc LEFT JOIN merchandising_categories c ON c.source=pc.source AND c.hierarchy_key=pc.hierarchy_key AND c.category_id=pc.category_id WHERE ${where.join(' AND ')} ORDER BY pc.hierarchy_key,c.level,c.category_name`).all(...args)
}

export function classifyAvailability({storeId,productNumber,availableQty,businessDate=null,index=null,maxAgeHours=null}={}){
 const qty=Number(availableQty),membership=assortmentMembership(storeId,productNumber,{businessDate,index,maxAgeHours});
 if(Number.isFinite(qty)&&qty<0)return{state:'STOCK_ANOMALY',membership,operational:true};
 if(membership.status==='UNKNOWN')return{state:'ASSORTMENT_UNKNOWN',membership,operational:false};
 if(membership.status==='NOT_ASSORTED')return{state:Number(qty)>0?'RESIDUAL_STOCK_OUTSIDE_ASSORTMENT':'NOT_ASSORTED',membership,operational:Number(qty)>0};
 if(Number(qty)===0)return{state:'OUT_OF_STOCK',membership,operational:true};
 return{state:'AVAILABLE',membership,operational:false};
}

import { db } from '../db.mjs';

const clean=v=>String(v??'').trim();
const isoDate=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):null;
const nowDay=()=>new Date().toISOString().slice(0,10);

function activeWindow(from,to,day){const d=isoDate(day)||nowDay(),f=isoDate(from),t=isoDate(to);return(!f||f<=d)&&(!t||t>=d)}
function timestampMs(value){const s=clean(value);if(!s)return null;const normalized=/Z$|[+-]\d\d:\d\d$/.test(s)?s:s.replace(' ','T')+'Z',ms=Date.parse(normalized);return Number.isFinite(ms)?ms:null}
function fresh(value,maxAgeHours){const limit=Number(maxAgeHours);if(!Number.isFinite(limit)||limit<=0)return true;const ms=timestampMs(value);return ms!==null&&Date.now()-ms<=limit*3600000}

db.exec(`
CREATE TABLE IF NOT EXISTS store_assortment_assignment_state(
 store_id TEXT NOT NULL REFERENCES stores(id),
 source TEXT NOT NULL,
 complete INTEGER NOT NULL DEFAULT 0,
 row_count INTEGER NOT NULL DEFAULT 0,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(store_id,source)
);
CREATE TABLE IF NOT EXISTS store_assortment_assignments(
 store_id TEXT NOT NULL REFERENCES stores(id),
 source TEXT NOT NULL,
 assortment_key TEXT NOT NULL,
 assortment_name TEXT NULL,
 included INTEGER NOT NULL DEFAULT 1,
 valid_from TEXT NULL,
 valid_to TEXT NULL,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(store_id,source,assortment_key)
);
CREATE TABLE IF NOT EXISTS assortment_product_assignment_state(
 source TEXT NOT NULL,
 assortment_key TEXT NOT NULL,
 assortment_name TEXT NULL,
 complete INTEGER NOT NULL DEFAULT 0,
 row_count INTEGER NOT NULL DEFAULT 0,
 valid_from TEXT NULL,
 valid_to TEXT NULL,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(source,assortment_key)
);
CREATE TABLE IF NOT EXISTS assortment_product_assignments(
 source TEXT NOT NULL,
 assortment_key TEXT NOT NULL,
 product_number TEXT NOT NULL,
 included INTEGER NOT NULL DEFAULT 1,
 valid_from TEXT NULL,
 valid_to TEXT NULL,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(source,assortment_key,product_number)
);
CREATE INDEX IF NOT EXISTS ix_store_assortment_assignment ON store_assortment_assignments(store_id,source,assortment_key);
CREATE INDEX IF NOT EXISTS ix_assortment_product_assignment ON assortment_product_assignments(source,assortment_key,product_number,included);
`);

export function replaceStoreAssortmentAssignments({storeId,source='GENERIC',assignments=[],complete=true}={}){
 const store=clean(storeId),src=clean(source)||'GENERIC';if(!store)throw Object.assign(new Error('storeId obligatoire.'),{status:400,code:'ASSORTMENT_STORE_REQUIRED'});
 const rows=Array.isArray(assignments)?assignments:[];
 db.exec('BEGIN');
 try{
  db.prepare(`DELETE FROM store_assortment_assignments WHERE store_id=? AND source=?`).run(store,src);
  const ins=db.prepare(`INSERT INTO store_assortment_assignments(store_id,source,assortment_key,assortment_name,included,valid_from,valid_to,synced_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`);let inserted=0;
  for(const raw of rows){const key=clean(raw.assortmentKey??raw.key??raw.id);if(!key)continue;ins.run(store,src,key,clean(raw.assortmentName??raw.name)||null,raw.included===false?0:1,isoDate(raw.validFrom),isoDate(raw.validTo));inserted++}
  db.prepare(`INSERT INTO store_assortment_assignment_state(store_id,source,complete,row_count,synced_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(store_id,source) DO UPDATE SET complete=excluded.complete,row_count=excluded.row_count,synced_at=CURRENT_TIMESTAMP`).run(store,src,complete?1:0,inserted);
  db.exec('COMMIT');return{storeId:store,source:src,complete:!!complete,rowCount:inserted}
 }catch(error){db.exec('ROLLBACK');throw error}
}

export function replaceAssortmentProductAssignments({source='GENERIC',assortmentKey,assortmentName=null,products=[],complete=true,validFrom=null,validTo=null}={}){
 const src=clean(source)||'GENERIC',key=clean(assortmentKey);if(!key)throw Object.assign(new Error('assortmentKey obligatoire.'),{status:400,code:'ASSORTMENT_KEY_REQUIRED'});
 const rows=Array.isArray(products)?products:[];
 db.exec('BEGIN');
 try{
  db.prepare(`DELETE FROM assortment_product_assignments WHERE source=? AND assortment_key=?`).run(src,key);
  const ins=db.prepare(`INSERT INTO assortment_product_assignments(source,assortment_key,product_number,included,valid_from,valid_to,synced_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)`);let inserted=0;
  for(const raw of rows){const row=typeof raw==='string'?{productNumber:raw}:raw||{},sku=clean(row.productNumber??row.itemNumber??row.product);if(!sku)continue;ins.run(src,key,sku,row.included===false?0:1,isoDate(row.validFrom??validFrom),isoDate(row.validTo??validTo));inserted++}
  db.prepare(`INSERT INTO assortment_product_assignment_state(source,assortment_key,assortment_name,complete,row_count,valid_from,valid_to,synced_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(source,assortment_key) DO UPDATE SET assortment_name=excluded.assortment_name,complete=excluded.complete,row_count=excluded.row_count,valid_from=excluded.valid_from,valid_to=excluded.valid_to,synced_at=CURRENT_TIMESTAMP`).run(src,key,clean(assortmentName)||null,complete?1:0,inserted,isoDate(validFrom),isoDate(validTo));
  db.exec('COMMIT');return{source:src,assortmentKey:key,complete:!!complete,rowCount:inserted}
 }catch(error){db.exec('ROLLBACK');throw error}
}

export function relationalAssortmentIndex(storeId,{businessDate=null,source=null,maxAgeHours=null}={}){
 const store=clean(storeId),day=isoDate(businessDate)||nowDay();
 const states=source?db.prepare(`SELECT * FROM store_assortment_assignment_state WHERE store_id=? AND source=?`).all(store,clean(source)):db.prepare(`SELECT * FROM store_assortment_assignment_state WHERE store_id=?`).all(store);
 if(!states.length)return{status:'UNCONFIGURED',model:'RELATIONAL',storeId:store,businessDate:day,included:new Set(),excluded:new Set(),assortments:[],syncedAt:null};
 const completeStates=states.filter(x=>Number(x.complete)===1);if(!completeStates.length)return{status:'UNKNOWN',model:'RELATIONAL',reason:'STORE_ASSIGNMENTS_INCOMPLETE',storeId:store,businessDate:day,included:new Set(),excluded:new Set(),assortments:[],syncedAt:null};
 const assignmentRows=db.prepare(`SELECT * FROM store_assortment_assignments WHERE store_id=?`).all(store).filter(x=>completeStates.some(s=>s.source===x.source)&&activeWindow(x.valid_from,x.valid_to,day));
 const activeAssignments=assignmentRows.filter(x=>Number(x.included)!==0);if(!activeAssignments.length)return{status:'UNKNOWN',model:'RELATIONAL',reason:'NO_ACTIVE_STORE_ASSORTMENT',storeId:store,businessDate:day,included:new Set(),excluded:new Set(),assortments:[],syncedAt:completeStates.map(x=>x.synced_at).sort().at(-1)||null};
 const productStates=[];for(const a of activeAssignments){const s=db.prepare(`SELECT * FROM assortment_product_assignment_state WHERE source=? AND assortment_key=?`).get(a.source,a.assortment_key);if(!s||Number(s.complete)!==1)return{status:'UNKNOWN',model:'RELATIONAL',reason:'PRODUCT_ASSIGNMENTS_INCOMPLETE',storeId:store,businessDate:day,included:new Set(),excluded:new Set(),assortments:activeAssignments.map(x=>({source:x.source,key:x.assortment_key,name:x.assortment_name})),syncedAt:null};if(!activeWindow(s.valid_from,s.valid_to,day))continue;productStates.push(s)}
 if(!productStates.length)return{status:'UNKNOWN',model:'RELATIONAL',reason:'NO_ACTIVE_PRODUCT_ASSORTMENT',storeId:store,businessDate:day,included:new Set(),excluded:new Set(),assortments:[],syncedAt:null};
 const timestamps=[...completeStates.map(x=>x.synced_at),...productStates.map(x=>x.synced_at)],oldest=timestamps.map(x=>({raw:x,ms:timestampMs(x)})).filter(x=>x.ms!==null).sort((a,b)=>a.ms-b.ms)[0]?.raw||null;
 if(!fresh(oldest,maxAgeHours))return{status:'STALE',model:'RELATIONAL',reason:'ASSORTMENT_DATA_STALE',storeId:store,businessDate:day,included:new Set(),excluded:new Set(),assortments:activeAssignments.map(x=>({source:x.source,key:x.assortment_key,name:x.assortment_name})),syncedAt:oldest};
 const allowed=new Set(productStates.map(x=>`${x.source}::${x.assortment_key}`)),rows=db.prepare(`SELECT * FROM assortment_product_assignments`).all().filter(x=>allowed.has(`${x.source}::${x.assortment_key}`)&&activeWindow(x.valid_from,x.valid_to,day));
 const included=new Set(),excluded=new Set();for(const row of rows){if(Number(row.included)===0)excluded.add(row.product_number);else included.add(row.product_number)}for(const sku of excluded)included.delete(sku);
 if(!rows.length)return{status:'UNKNOWN',model:'RELATIONAL',reason:'EMPTY_PRODUCT_ASSORTMENT',storeId:store,businessDate:day,included:new Set(),excluded:new Set(),assortments:activeAssignments.map(x=>({source:x.source,key:x.assortment_key,name:x.assortment_name})),syncedAt:oldest};
 return{status:'READY',model:'RELATIONAL',storeId:store,businessDate:day,included,excluded,assortments:activeAssignments.map(x=>({source:x.source,key:x.assortment_key,name:x.assortment_name,validFrom:x.valid_from,validTo:x.valid_to})),syncedAt:oldest}
}

export function relationalAssortmentMembership(storeId,productNumber,{businessDate=null,source=null,index=null,maxAgeHours=null}={}){
 const sku=clean(productNumber),idx=index||relationalAssortmentIndex(storeId,{businessDate,source,maxAgeHours});if(!sku||idx.status!=='READY')return{status:'UNKNOWN',model:'RELATIONAL',productNumber:sku||null,storeId:clean(storeId),assortmentReady:false,assortmentState:idx.status,reason:idx.reason||null};
 if(idx.excluded.has(sku))return{status:'NOT_ASSORTED',model:'RELATIONAL',productNumber:sku,storeId:clean(storeId),assortmentReady:true,reason:'EXCLUDED'};
 if(idx.included.has(sku))return{status:'ASSORTED',model:'RELATIONAL',productNumber:sku,storeId:clean(storeId),assortmentReady:true};
 return{status:'NOT_ASSORTED',model:'RELATIONAL',productNumber:sku,storeId:clean(storeId),assortmentReady:true,reason:'NOT_IN_ASSIGNED_ASSORTMENTS'}
}

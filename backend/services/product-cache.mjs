import { db } from '../db.mjs';

const clean=v=>String(v??'').trim();

db.exec(`
CREATE TABLE IF NOT EXISTS product_identity_cache(
 ean TEXT PRIMARY KEY,
 product_number TEXT NULL,
 product_name TEXT NOT NULL,
 category TEXT NULL,
 unit TEXT NULL,
 source TEXT NOT NULL DEFAULT 'STOREOPS_CACHE',
 last_live_source TEXT NULL,
 last_error_code TEXT NULL,
 last_error_message TEXT NULL,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_product_identity_product ON product_identity_cache(product_number);
`);

function hasTable(name){return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name)}

export function rememberProductIdentity(product,{liveSource=null,error=null}={}){
 const ean=clean(product?.ean),name=clean(product?.name||product?.productName||product?.productNumber||ean);if(!ean||!name)return null;
 const productNumber=clean(product?.productNumber)||null,category=clean(product?.category)||null,unit=clean(product?.inventoryUnit||product?.unit)||null,source=clean(product?.source)||'D365';
 db.prepare(`INSERT INTO product_identity_cache(ean,product_number,product_name,category,unit,source,last_live_source,last_error_code,last_error_message,synced_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
 ON CONFLICT(ean) DO UPDATE SET product_number=COALESCE(excluded.product_number,product_identity_cache.product_number),product_name=excluded.product_name,category=COALESCE(excluded.category,product_identity_cache.category),unit=COALESCE(excluded.unit,product_identity_cache.unit),source=excluded.source,last_live_source=COALESCE(excluded.last_live_source,product_identity_cache.last_live_source),last_error_code=excluded.last_error_code,last_error_message=excluded.last_error_message,synced_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`)
 .run(ean,productNumber,name,category,unit,source,clean(liveSource)||source,error?.code||null,error?.message||null);
 return cachedProductByEan(ean)
}

function fromPriceChecks(ean){
 if(!hasTable('price_checks'))return null;
 const row=db.prepare(`SELECT ean,product_number,product_name,checked_at FROM price_checks WHERE ean=? ORDER BY checked_at DESC LIMIT 1`).get(ean);if(!row)return null;
 return{ean:row.ean,productNumber:row.product_number||null,name:row.product_name||row.product_number||row.ean,category:'Autre',unit:null,source:'STOREOPS_HISTORY',cacheSyncedAt:row.checked_at||null,identityStale:true}
}

export function cachedProductByEan(ean){
 const code=clean(ean);if(!code)return null;
 const row=db.prepare(`SELECT * FROM product_identity_cache WHERE ean=?`).get(code);
 if(row)return{ean:row.ean,productNumber:row.product_number||null,name:row.product_name,category:row.category||'Autre',unit:row.unit||null,source:'STOREOPS_CACHE',cacheSyncedAt:row.synced_at,identityStale:true,lastLiveSource:row.last_live_source||null,lastErrorCode:row.last_error_code||null,lastErrorMessage:row.last_error_message||null};
 return fromPriceChecks(code)
}

export function cachedProductByProductNumber(productNumber){
 const sku=clean(productNumber);if(!sku)return null;
 const row=db.prepare(`SELECT * FROM product_identity_cache WHERE product_number=? ORDER BY synced_at DESC LIMIT 1`).get(sku);
 if(!row)return null;
 return{ean:row.ean,productNumber:row.product_number||sku,name:row.product_name||sku,category:row.category||'Autre',inventoryUnit:row.unit||null,unit:row.unit||null,source:'STOREOPS_CACHE',cacheSyncedAt:row.synced_at,identityStale:true}
}

export function noteProductIdentityFailure(ean,error){
 const code=clean(ean);if(!code)return;
 db.prepare(`UPDATE product_identity_cache SET last_error_code=?,last_error_message=?,updated_at=CURRENT_TIMESTAMP WHERE ean=?`).run(error?.code||null,error?.message||null,code)
}

export function productCacheStats(){
 const row=db.prepare(`SELECT COUNT(*) total,MAX(synced_at) last_synced_at FROM product_identity_cache`).get();return{total:Number(row?.total||0),lastSyncedAt:row?.last_synced_at||null}
}

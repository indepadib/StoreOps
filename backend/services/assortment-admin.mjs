import { db,audit } from '../db.mjs';
import { replaceStoreAssortmentAssignments } from './assortment-relations.mjs';
import { PRODUCT_ASSORTMENT_SOURCE,parseAssortmentLabel } from './assortment-category-mapping.mjs';

const clean=v=>String(v??'').trim();

export function listProductAssortmentCatalog({source=PRODUCT_ASSORTMENT_SOURCE}={}){
 const rows=db.prepare(`SELECT source,assortment_key,assortment_name,complete,row_count,valid_from,valid_to,synced_at FROM assortment_product_assignment_state WHERE source=? ORDER BY assortment_name,assortment_key`).all(clean(source));
 return rows.map(x=>{const parsed=parseAssortmentLabel(x.assortment_name||x.assortment_key);return{source:x.source,assortmentKey:x.assortment_key,assortmentName:x.assortment_name||x.assortment_key,complete:Number(x.complete)===1,rowCount:Number(x.row_count)||0,validFrom:x.valid_from,validTo:x.valid_to,syncedAt:x.synced_at,brandScope:parsed.brandScope,brands:parsed.brands,tier:parsed.tier,recognized:parsed.recognized}})
}

export function getStoreAssortmentAssignments(storeId,{source=PRODUCT_ASSORTMENT_SOURCE}={}){
 const id=clean(storeId),src=clean(source),state=db.prepare(`SELECT * FROM store_assortment_assignment_state WHERE store_id=? AND source=?`).get(id,src),rows=db.prepare(`SELECT * FROM store_assortment_assignments WHERE store_id=? AND source=? ORDER BY assortment_name,assortment_key`).all(id,src);
 return{storeId:id,source:src,complete:Number(state?.complete)===1,rowCount:Number(state?.row_count)||0,syncedAt:state?.synced_at||null,items:rows.map(x=>({assortmentKey:x.assortment_key,assortmentName:x.assortment_name||x.assortment_key,included:Number(x.included)!==0,validFrom:x.valid_from,validTo:x.valid_to}))}
}

export function saveStoreAssortmentAssignments({storeId,user,assortmentKeys=[],source=PRODUCT_ASSORTMENT_SOURCE}={}){
 const id=clean(storeId),src=clean(source);if(!db.prepare(`SELECT id FROM stores WHERE id=? AND active=1`).get(id))throw Object.assign(new Error('Magasin introuvable.'),{status:404,code:'STORE_NOT_FOUND'});
 const catalog=listProductAssortmentCatalog({source:src}),byKey=new Map(catalog.map(x=>[x.assortmentKey,x])),keys=[...new Set((Array.isArray(assortmentKeys)?assortmentKeys:[]).map(clean).filter(Boolean))];
 for(const key of keys)if(!byKey.has(key))throw Object.assign(new Error(`Assortiment inconnu: ${key}`),{status:400,code:'ASSORTMENT_UNKNOWN',details:{assortmentKey:key}});
 const assignments=keys.map(key=>({assortmentKey:key,assortmentName:byKey.get(key).assortmentName,included:true}));
 const saved=replaceStoreAssortmentAssignments({storeId:id,source:src,assignments,complete:true});
 audit({storeId:id,userId:user?.id||null,action:'STORE_ASSORTMENT_ASSIGNMENTS_UPDATED',entityType:'STORE',entityId:id,details:{source:src,assortmentKeys:keys}});
 return{...saved,items:getStoreAssortmentAssignments(id,{source:src}).items}
}

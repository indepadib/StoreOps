import {readStoreStockSnapshot,readWarehouseStockSnapshot,supplyWarehouseForStore,readPreparedAnalyticsStock} from './dynamics-stock.mjs';
import {assortmentIndex} from './assortment-resolver.mjs';
import {readAnalyticsCatalog} from './analytics-catalog.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
import {config} from '../config.mjs';
import {odataGetAll,probeDataEntity} from './dynamics.mjs';

export async function referenceIndex(){
 const key=analyticsCacheKey('detention-reference-v1',[config.dynamics.dataAreaId]),hit=await readAnalyticsCache(key);if(hit)return hit;
 try{
  const entity=process.env.D365_RELEASED_PRODUCT_ENTITY||'ReleasedProductsV2',probe=await probeDataEntity(entity,{top:1,extra:'cross-company=true'}),sample=probe.rows?.[0]||{};
  const field=[process.env.D365_RELEASED_PRODUCT_ITEM_FIELD,'ItemNumber','ProductNumber'].filter(Boolean).find(f=>Object.prototype.hasOwnProperty.call(sample,f));
  if(!field)return{products:[],complete:false};
  const filter=config.dynamics.dataAreaId?`${config.dynamics.dataAreaField} eq '${String(config.dynamics.dataAreaId).replaceAll("'","''")}'`:'';
  const result=await odataGetAll(entity,{filter,select:field,extra:'cross-company=true',pageSize:1000,maxRows:50000});
  const value={products:[...new Set(result.value.map(r=>String(r[field]||'').trim()).filter(Boolean))],complete:!result.truncated};
  await writeAnalyticsCache(key,'detention-reference-v1',value,86400);return value;
 }catch{return{products:[],complete:false}}
}

export function detentionRows({storeId,local,supply,assortment,referenceProducts=[]}){
 const l=new Map((local.items||[]).map(x=>[x.productNumber,x])),s=new Map((supply.items||[]).map(x=>[x.productNumber,x]));
 const expected=assortment.status==='READY'?assortment.included:null;
 const ids=[...new Set([...referenceProducts,...l.keys(),...s.keys(),...(expected||[])])].sort();
 const qty=(map,id,complete)=>{const value=map.get(id)?.availableOnHandQuantity;return map.has(id)?value!=null&&Number.isFinite(Number(value))?Number(value):null:complete?0:null};
 return ids.map(productNumber=>{const storeAvailable=qty(l,productNumber,local.complete===true),warehouseAvailable=qty(s,productNumber,supply.complete===true),isExpected=expected?expected.has(productNumber):null;
  return{storeId,productNumber,expected:isExpected,storeAvailable,warehouseAvailable,storeHeld:storeAvailable==null?null:storeAvailable>0,warehouseHeld:warehouseAvailable==null?null:warehouseAvailable>0,state:storeAvailable==null?'UNKNOWN':storeAvailable<0?'NEGATIVE':storeAvailable>0?'HELD':isExpected===true?'EXPECTED_NOT_HELD':'NOT_HELD',warehouseId:local.warehouseId||null,supplyWarehouseId:supply.warehouseId||null};
 });
}
export async function readDetentionPage(store,{offset=0,limit=120,expectedSnapshot=null,force=false}={}){
 const key=analyticsCacheKey('detention-universe-v2',[store.id]);let universe=!force?await readAnalyticsCache(key):null;
 const previousKey=analyticsCacheKey('detention-previous-v2',[store.id]);
 if(expectedSnapshot&&universe?.checkedAt!==expectedSnapshot){const previous=await readAnalyticsCache(previousKey);if(previous?.checkedAt===expectedSnapshot)universe=previous;else throw Object.assign(new Error('Image stock expirée. Relancer la lecture complète.'),{status:409,code:'STOCK_SNAPSHOT_CHANGED'})}
 if(!universe){
  const [reads,reference]=await Promise.all([Promise.allSettled([readPreparedAnalyticsStock(store.id),readPreparedAnalyticsStock(store.id,'supply')]),referenceIndex()]);
  const [local,supply]=reads.map(r=>r.status==='fulfilled'?r.value:{status:'UNAVAILABLE',complete:false,items:[],error:r.reason?.message});
  const assortment=assortmentIndex(store.id,{maxAgeHours:72}),rows=detentionRows({storeId:store.id,local,supply,assortment,referenceProducts:reference.products});
  universe={rows,stockReadAt:local.checkedAt||null,warehouseReadAt:supply.checkedAt||null,stockReadStartedAt:local.startedAt||null,warehouseReadStartedAt:supply.startedAt||null,checkedAt:new Date().toISOString(),storeWarehouseId:local.warehouseId,supplyWarehouseId:supply.warehouseId,stockComplete:local.complete===true,supplyComplete:supply.complete===true,referenceComplete:reference.complete,assortmentStatus:assortment.status,status:local.complete&&supply.complete&&reference.complete&&assortment.status==='READY'?'READY':'PARTIAL'};
  const old=await readAnalyticsCache(key);if(old)await writeAnalyticsCache(previousKey,'detention-previous-v2',old,1800);
  await writeAnalyticsCache(key,'detention-universe-v2',universe,900);
 }
 if(expectedSnapshot&&expectedSnapshot!==universe.checkedAt)throw Object.assign(new Error('Image stock renouvelée pendant la lecture. Relancer pour éviter de mélanger deux images.'),{status:409,code:'STOCK_SNAPSHOT_CHANGED'});
 const page=universe.rows.slice(offset,offset+limit),catalogKey=analyticsCacheKey('catalog-v9',page.map(x=>x.productNumber).sort());
 let catalog=page.length?await readAnalyticsCache(catalogKey):{items:[]};
 if(!catalog&&page.length){catalog=await readAnalyticsCatalog(page.map(x=>x.productNumber));await writeAnalyticsCache(catalogKey,'catalog-v9',catalog,86400)}
 const refs=new Map((catalog?.items||[]).map(x=>[x.productNumber,x]));
 return{...universe,rows:page.map(x=>({...x,storeName:store.name,productName:refs.get(x.productNumber)?.productName||null,hierarchy:refs.get(x.productNumber)?.hierarchy||{},hierarchyStatus:refs.get(x.productNumber)?.hierarchyStatus||'MISSING',unit:refs.get(x.productNumber)?.inventoryUnit||null})),total:universe.rows.length,offset,limit,nextOffset:offset+page.length<universe.rows.length?offset+page.length:null,snapshotOnly:true,note:'Stock actuel, pas un historique. Taux de détention sur références attendues uniquement ; données incomplètes ou assortiment inconnu = taux indisponible. Quantités en unité de stock, non additionnables entre articles.'};
}

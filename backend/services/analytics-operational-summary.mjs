import {analyticsCacheKey,readAnalyticsCache} from './analytics-persistent-cache.mjs';
import {detentionInsights} from './analytics-action-intelligence.mjs';
import {historicalMetric,relativeMetric} from '../../frontend/analytics/detention-metrics.js';
import {preparedCatalog} from './analytics-query-evidence.mjs';
import {readReceiptHistory} from './analytics-receipt-history.mjs';
export function receptionDetention(universe,history,catalog,{kind='store'}={}){
 const refs=new Map((catalog.items||[]).map(r=>[r.productNumber,r])),items=(universe?.rows||[]).map(r=>({...r,hierarchy:refs.get(r.productNumber)?.hierarchy||{}})),stockComplete=kind==='supply'?universe?.supplyComplete:universe?.stockComplete;
 const metric=historicalMetric(history?.products||[],items,{kind,complete:history?.complete===true,stockComplete:stockComplete===true}),classified=catalog.complete&&metric.rows.every(r=>r.hierarchy?.department?.label);
 const departments=Object.fromEntries(['PGC','APLS'].map(department=>{const selected=metric.rows.filter(r=>r.hierarchy?.department?.label===department),m=historicalMetric(selected,items,{kind,includeCurrent:false,complete:history?.complete===true&&classified,stockComplete:stockComplete===true});return[department,{base:m.denominator,held:m.held,missing:m.missing,unknown:m.unknown,rate:m.rate}]}));
 return{basis:kind==='supply'?'HISTORICAL_WAREHOUSE_PASSAGES':'HISTORICAL_STORE_RECEIPTS',base:metric.denominator,held:metric.held,missing:metric.missing,unknown:metric.unknown,rate:metric.rate,complete:history?.complete===true&&stockComplete===true,historyAt:history?.checkedAt||null,departments,classificationComplete:classified,limitation:'Historique accessible ; couverture depuis l’ouverture non certifiée.'};
}
export async function operationalSummary(stores,{read=readAnalyticsCache,catalogReader=preparedCatalog,historyReader=readReceiptHistory}={}){
 const catalog=await catalogReader(stores,{read}),warehouses=new Map();
 const rows=await Promise.all(stores.map(async s=>{const u=await read(analyticsCacheKey('detention-universe-v3',[s.id]));if(!u)return{storeId:s.id,storeName:s.name,status:'NOT_LOADED',insights:null,historical:null};
 const [h,supply]=await Promise.all([historyReader(s.id,'store'),historyReader(s.id,'supply')]),historical=receptionDetention(u,h,catalog),supplyHistory=receptionDetention(u,supply,catalog,{kind:'supply'}),warehouseId=u.supplyWarehouseId||supply?.warehouseId;
 if(warehouseId){const old=warehouses.get(warehouseId);if(!old||String(u.warehouseReadAt)>String(old.stockReadAt))warehouses.set(warehouseId,{warehouseId,stockReadAt:u.warehouseReadAt,...supplyHistory});}
 const refs=new Map((catalog.items||[]).map(r=>[r.productNumber,r])),relative=relativeMetric(u.rows.map(r=>({...r,hierarchy:refs.get(r.productNumber)?.hierarchy||{}})),{complete:u.stockComplete&&u.supplyComplete&&catalog.complete});
 return{storeId:s.id,storeName:s.name,status:u.status,stockReadAt:u.stockReadAt,warehouseReadAt:u.warehouseReadAt,assortmentStatus:u.assortmentStatus,referenceComplete:u.referenceComplete,assortmentBasis:u.assortmentBasis,assortmentLabel:u.assortmentLabel,historical,relativePGC:{base:relative.denominator,held:relative.held,rate:relative.rate},insights:detentionInsights(u.rows,{complete:u.referenceComplete&&u.stockComplete,warehouseComplete:u.referenceComplete&&u.supplyComplete,assortmentReady:u.assortmentStatus==='READY'})};}));
 return{stores:rows,warehouses:[...warehouses.values()],coverage:{ready:rows.filter(x=>x.insights).length,historicalReady:rows.filter(x=>x.historical?.rate!=null).length,total:rows.length},checkedAt:new Date().toISOString(),semantics:'Détention magasin : stock positif / références déjà réceptionnées au moins une fois, y compris celles épuisées. Le référentiel global est un complément. Stocks actuels, distincts de la période de ventes. Historique accessible ; ouverture non certifiée.'};
}

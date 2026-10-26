import {analyticsCacheKey,readAnalyticsCache} from './analytics-persistent-cache.mjs';
import {detentionInsights} from './analytics-action-intelligence.mjs';
export async function operationalSummary(stores){
 const rows=await Promise.all(stores.map(async s=>{const u=await readAnalyticsCache(analyticsCacheKey('detention-universe-v2',[s.id]));return u?{storeId:s.id,storeName:s.name,status:u.status,stockReadAt:u.stockReadAt,warehouseReadAt:u.warehouseReadAt,assortmentStatus:u.assortmentStatus,referenceComplete:u.referenceComplete,insights:detentionInsights(u.rows,{complete:u.referenceComplete&&u.stockComplete,assortmentReady:u.assortmentStatus==='READY'})}:{storeId:s.id,storeName:s.name,status:'NOT_LOADED',insights:null}}));
 return{stores:rows,coverage:{ready:rows.filter(x=>x.insights).length,total:rows.length},checkedAt:new Date().toISOString(),semantics:'Présence sur référentiel et taux sur assortiment attendu sont deux mesures distinctes. Les stocks sont actuels et ne sont pas reconstruits à la date des ventes.'};
}

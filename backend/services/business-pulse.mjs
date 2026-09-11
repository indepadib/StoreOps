import { normalizeRetailInsights,quickPulse } from './retail-insights.mjs';
import { readStoreSalesDay,salesComparisonDate,salesIntegrationConfig } from './dynamics-sales.mjs';
import { getStockSignals } from './stock-signals.mjs';

const cache=new Map();
const ttlMs=()=>Math.max(15,Math.min(600,Number(process.env.STOREOPS_BUSINESS_PULSE_CACHE_SECONDS)||90))*1000;
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

async function stockSummary(storeId,businessDate){
 try{const s=await getStockSignals(storeId,{businessDate});return{source:s.source||null,outOfStockCount:Number(s.summary?.outOfStock||0),negativeStockCount:Number(s.summary?.negative||0),residualOutsideAssortment:Number(s.summary?.residualOutsideAssortment||0),assortmentReady:!!s.summary?.assortmentReady};}
 catch(error){return{source:null,outOfStockCount:null,negativeStockCount:null,residualOutsideAssortment:null,assortmentReady:false,error:error.message};}
}

export async function getBusinessPulse(storeId,businessDate,{force=false}={}){
 const key=`${storeId}:${businessDate}`,cached=cache.get(key);if(!force&&cached&&Date.now()-cached.at<ttlMs())return{...cached.value,cached:true};
 const comparisonDate=salesComparisonDate(businessDate,7),integration=salesIntegrationConfig(storeId);
 const [current,comparison,stock]=await Promise.all([readStoreSalesDay(storeId,businessDate),readStoreSalesDay(storeId,comparisonDate),stockSummary(storeId,businessDate)]);
 if(current.status!=='READY'){
  const value={status:'UNAVAILABLE',storeId,businessDate,comparisonDate,source:'D365',integration:{mode:integration.mode,entity:integration.entity,retailId:integration.retailId,missing:integration.missing},stock,refreshedAt:new Date().toISOString(),snapshot:null,quick:null};cache.set(key,{at:Date.now(),value});return value;
 }
 const c=current.data||{},prior=comparison.status==='READY'?comparison.data:null;
 const snapshot=normalizeRetailInsights({source:current.source,storeId,businessDate,refreshedAt:new Date().toISOString(),sales:c.sales,netSales:c.netSales,tickets:c.tickets,units:c.units,marginValue:c.marginValue,marginRate:c.marginRate,comparison:prior?.netSales??null,outOfStockCount:stock.outOfStockCount??0,departments:c.departments,categories:c.categories,products:c.products,hourly:c.hourly});
 const value={status:'READY',storeId,businessDate,comparisonDate,source:current.source,refreshedAt:snapshot.refreshedAt,integration:{mode:integration.mode,entity:integration.entity,retailId:integration.retailId,missing:integration.missing},stock,snapshot,quick:quickPulse(snapshot),diagnostics:{rows:c.rowCount||0,pages:c.pages||0,truncated:!!c.truncated,comparisonRows:prior?.rowCount||0,changeVsD7:snapshot.kpis.changeVsComparison==null?null:round2(snapshot.kpis.changeVsComparison)}};
 cache.set(key,{at:Date.now(),value});return value;
}

export function clearBusinessPulseCache(storeId=null){if(!storeId){cache.clear();return}for(const key of cache.keys())if(key.startsWith(`${storeId}:`))cache.delete(key)}

import { config } from '../config.mjs';
import { normalizeRetailInsights,quickPulse } from './retail-insights.mjs';
import { readStoreSalesDay,salesComparisonDate,salesIntegrationConfig } from './dynamics-sales.mjs';
import { getStockSignals,peekStockSignals } from './stock-signals.mjs';

const cache=new Map();
const inflight=new Map();
const ttlMs=()=>Math.max(15,Math.min(600,Number(process.env.STOREOPS_BUSINESS_PULSE_CACHE_SECONDS)||90))*1000;
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

async function stockSummary(storeId,businessDate){
 const s=config.dynamics.mode==='live'?peekStockSignals(storeId,{businessDate,allowStale:true}):await getStockSignals(storeId,{businessDate});
 if(!s)return{source:null,outOfStockCount:null,negativeStockCount:null,residualOutsideAssortment:null,ruptureReady:false,rupturePending:true,ruptureMethod:'SALES_30D_ZERO_STOCK',salesWindowDays:30,salesWindowProducts:null,assortmentReady:false,assortmentState:null,cache:null};
 const assortmentReady=!!s.summary?.assortmentReady,ruptureReady=!!s.summary?.ruptureReady;
 return{source:s.source||null,outOfStockCount:ruptureReady?Number(s.summary?.outOfStock||0):null,negativeStockCount:Number(s.summary?.negative||0),residualOutsideAssortment:assortmentReady?Number(s.summary?.residualOutsideAssortment||0):null,ruptureReady,rupturePending:false,ruptureMethod:s.summary?.ruptureMethod||null,salesWindowDays:s.summary?.salesWindowDays||null,salesWindowProducts:s.summary?.salesWindowProducts??null,assortmentReady,assortmentState:s.summary?.assortmentState||null,cache:s.cache||null};
}

async function computeBusinessPulse(storeId,businessDate){
 const comparisonDate=salesComparisonDate(businessDate,7),integration=salesIntegrationConfig(storeId),integrationView={mode:integration.mode,entity:integration.entity,retailId:integration.retailId,retailIdSource:integration.retailIdSource,missing:integration.missing,mappingSource:integration.mappingSource||null,mappingState:integration.mappingState||null};
 const stock=await stockSummary(storeId,businessDate);
 let current,comparison;
 const [currentResult,comparisonResult]=await Promise.allSettled([readStoreSalesDay(storeId,businessDate),readStoreSalesDay(storeId,comparisonDate)]);
 if(currentResult.status==='rejected'){
  const error=currentResult.reason,value={status:'DEGRADED',storeId,businessDate,comparisonDate,source:'D365',integration:integrationView,stock,refreshedAt:new Date().toISOString(),snapshot:null,quick:null,error:{code:error?.code||'D365_SALES_READ_FAILED',message:error?.message||String(error)}};cache.set(`${storeId}:${businessDate}`,{at:Date.now(),value});return value
 }
 current=currentResult.value;
 comparison=comparisonResult.status==='fulfilled'?comparisonResult.value:{status:'UNAVAILABLE',data:null,error:{code:comparisonResult.reason?.code||'D365_SALES_COMPARISON_FAILED',message:comparisonResult.reason?.message||String(comparisonResult.reason||'')}};
 if(current.status!=='READY'){
  const value={status:'UNAVAILABLE',storeId,businessDate,comparisonDate,source:'D365',integration:integrationView,stock,refreshedAt:new Date().toISOString(),snapshot:null,quick:null};cache.set(`${storeId}:${businessDate}`,{at:Date.now(),value});return value;
 }
 const c=current.data||{},prior=comparison.status==='READY'?comparison.data:null;
 const snapshot=normalizeRetailInsights({source:current.source,storeId,businessDate,refreshedAt:new Date().toISOString(),sales:c.sales,netSales:c.netSales,tickets:c.tickets,units:c.units,marginValue:c.marginValue,marginRate:c.marginRate,comparison:prior?.netSales??null,outOfStockCount:stock.outOfStockCount,departments:c.departments,categories:c.categories,products:c.products,hourly:c.hourly});
 const value={status:'READY',storeId,businessDate,comparisonDate,source:current.source,refreshedAt:snapshot.refreshedAt,integration:integrationView,stock,snapshot,quick:quickPulse(snapshot),diagnostics:{rows:c.rowCount||0,pages:c.pages||0,truncated:!!c.truncated,comparisonRows:prior?.rowCount||0,comparisonStatus:comparison.status||null,comparisonError:comparison.error||null,changeVsD7:snapshot.kpis.changeVsComparison==null?null:round2(snapshot.kpis.changeVsComparison)}};
 cache.set(`${storeId}:${businessDate}`,{at:Date.now(),value});return value;
}

export async function getBusinessPulse(storeId,businessDate,{force=false}={}){
 const key=`${storeId}:${businessDate}`,cached=cache.get(key);if(!force&&cached&&Date.now()-cached.at<ttlMs())return{...cached.value,cached:true};
 if(!force&&inflight.has(key))return inflight.get(key);
 const promise=computeBusinessPulse(storeId,businessDate);
 if(!force)inflight.set(key,promise);
 try{return await promise}finally{if(!force&&inflight.get(key)===promise)inflight.delete(key)}
}

export function clearBusinessPulseCache(storeId=null){
 if(!storeId){cache.clear();inflight.clear();return}
 for(const key of cache.keys())if(key.startsWith(`${storeId}:`))cache.delete(key);
 for(const key of inflight.keys())if(key.startsWith(`${storeId}:`))inflight.delete(key)
}

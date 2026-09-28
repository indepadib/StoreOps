import { config } from '../config.mjs';
import { normalizeRetailInsights,quickPulse } from './retail-insights.mjs';
import { readStoreSalesDay,salesComparisonDate,salesIntegrationConfig,salesComparisonCutoff } from './dynamics-sales.mjs';
import { getStockSignals,peekStockSignals } from './stock-signals.mjs';
import { readStoreLoyaltyRecruitments } from './dynamics-loyalty.mjs';

const cache=new Map();
const inflight=new Map();
const ttlMs=()=>Math.max(15,Math.min(600,Number(process.env.STOREOPS_BUSINESS_PULSE_CACHE_SECONDS)||90))*1000;
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;

async function stockSummary(storeId,businessDate){
 const s=config.dynamics.mode==='live'?peekStockSignals(storeId,{businessDate,allowStale:true}):await getStockSignals(storeId,{businessDate});
 if(!s)return{source:null,outOfStockCount:null,negativeStockCount:null,residualOutsideAssortment:null,ruptureReady:false,rupturePending:true,ruptureMethod:'SALES_30D_ZERO_STOCK',salesWindowDays:30,salesWindowProducts:null,assortmentReady:false,assortmentState:null,cache:null};
 const assortmentReady=!!s.summary?.assortmentReady,ruptureReady=!!s.summary?.ruptureReady;
 return{source:s.source||null,outOfStockCount:ruptureReady?Number(s.summary?.outOfStock||0):null,nearOutOfStockCount:ruptureReady?Number(s.summary?.nearOutOfStock||0):null,ghostStockCount:ruptureReady?Number(s.summary?.ghostStock||0):null,negativeStockCount:Number(s.summary?.negative||0),residualOutsideAssortment:assortmentReady?Number(s.summary?.residualOutsideAssortment||0):null,salesRisk24h:ruptureReady?Number(s.summary?.salesRisk24h||0):null,recoverableWarehouseRisk24h:ruptureReady?Number(s.summary?.recoverableWarehouseRisk24h||0):null,supplierRisk24h:ruptureReady?Number(s.summary?.supplierRisk24h||0):null,unknownSupplyRisk24h:ruptureReady?Number(s.summary?.unknownSupplyRisk24h||0):null,ruptureReady,rupturePending:false,ruptureMethod:s.summary?.ruptureMethod||null,lowCoverageDays:s.summary?.lowCoverageDays??null,supplyReadStatus:s.summary?.supplyReadStatus||null,salesWindowDays:s.summary?.salesWindowDays||null,salesWindowProducts:s.summary?.salesWindowProducts??null,assortmentReady,assortmentState:s.summary?.assortmentState||null,cache:s.cache||null};
}

function pctChange(current,previous){const c=Number(current),p=Number(previous);return Number.isFinite(c)&&Number.isFinite(p)&&p!==0?round2(((c-p)/p)*100):null}
function salesDeltaRows(current=[],previous=[]){
 const prior=new Map((previous||[]).map(x=>[String(x.key),Number(x.sales||0)]));
 const rows=(current||[]).map(x=>({key:String(x.key),label:String(x.label||x.key),current:round2(x.sales),previous:round2(prior.get(String(x.key))||0),delta:round2(Number(x.sales||0)-Number(prior.get(String(x.key))||0))}));
 const currentKeys=new Set(rows.map(x=>x.key));for(const p of previous||[])if(!currentKeys.has(String(p.key)))rows.push({key:String(p.key),label:String(p.label||p.key),current:0,previous:round2(p.sales),delta:round2(-Number(p.sales||0))});
 return rows.filter(x=>Math.abs(x.delta)>=.01).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))
}
function pulseAnalysis(current={},prior=null,snapshot={},stock={}){
 const k=snapshot.kpis||{},currentBasket=Number(current.tickets)>0?Number(current.netSales||0)/Number(current.tickets):null,priorBasket=prior&&Number(prior.tickets)>0?Number(prior.netSales||0)/Number(prior.tickets):null,change=k.changeVsComparison,trafficChange=prior?pctChange(current.tickets,prior.tickets):null,basketChange=prior?pctChange(currentBasket,priorBasket):null;
 const departments=prior?salesDeltaRows(current.departments,prior.departments).slice(0,5):[],trend=change==null?'UNKNOWN':Math.abs(change)<1?'STABLE':change>0?'UP':'DOWN';
 let mechanism='UNKNOWN';if(trafficChange!=null||basketChange!=null){const t=trafficChange??0,b=basketChange??0;mechanism=t< -1&&b< -1?'TRAFFIC_AND_BASKET':t< -1?'TRAFFIC':b< -1?'BASKET':t>1&&b>1?'TRAFFIC_AND_BASKET_UP':t>1?'TRAFFIC_UP':b>1?'BASKET_UP':'STABLE'}
 return{trend,mechanism,changePct:change??null,salesDelta:k.comparisonDelta??null,trafficChangePct:trafficChange,basketChangePct:basketChange,departmentDrivers:departments,salesRisk24h:stock.salesRisk24h??null,recoverableWarehouseRisk24h:stock.recoverableWarehouseRisk24h??null,supplierRisk24h:stock.supplierRisk24h??null,ghostStockCount:stock.ghostStockCount??null}
}

async function computeBusinessPulse(storeId,businessDate){
 const comparisonDate=salesComparisonDate(businessDate,7),comparisonScope=salesComparisonCutoff(businessDate),integration=salesIntegrationConfig(storeId),integrationView={mode:integration.mode,entity:integration.entity,retailId:integration.retailId,retailIdSource:integration.retailIdSource,missing:integration.missing,mappingSource:integration.mappingSource||null,mappingState:integration.mappingState||null};
 const stock=await stockSummary(storeId,businessDate);
 let current,comparison;
 const [currentResult,comparisonResult,recruitmentResult]=await Promise.allSettled([readStoreSalesDay(storeId,businessDate),readStoreSalesDay(storeId,comparisonDate,{cutoffMinute:comparisonScope.cutoffMinute}),readStoreLoyaltyRecruitments(storeId,{businessDate})]);
 if(currentResult.status==='rejected'){
  const error=currentResult.reason,value={status:'DEGRADED',storeId,businessDate,comparisonDate,source:'D365',integration:integrationView,stock,refreshedAt:new Date().toISOString(),snapshot:null,quick:null,error:{code:error?.code||'D365_SALES_READ_FAILED',message:error?.message||String(error)}};cache.set(`${storeId}:${businessDate}`,{at:Date.now(),value});return value
 }
 current=currentResult.value;
 comparison=comparisonResult.status==='fulfilled'?comparisonResult.value:{status:'UNAVAILABLE',data:null,error:{code:comparisonResult.reason?.code||'D365_SALES_COMPARISON_FAILED',message:comparisonResult.reason?.message||String(comparisonResult.reason||'')}};
 if(current.status!=='READY'){
  const value={status:'UNAVAILABLE',storeId,businessDate,comparisonDate,source:'D365',integration:integrationView,stock,refreshedAt:new Date().toISOString(),snapshot:null,quick:null};cache.set(`${storeId}:${businessDate}`,{at:Date.now(),value});return value;
 }
 const c=current.data||{},rawPrior=comparison.status==='READY'?comparison.data:null,comparisonCutoff=rawPrior?.cutoff||null,comparisonUsable=comparison.status==='READY'&&(comparisonScope.mode==='FULL_DAY'||comparisonCutoff?.applied===true&&comparisonCutoff?.complete===true),prior=comparisonUsable?rawPrior:null,recruitment=recruitmentResult.status==='fulfilled'?recruitmentResult.value:{status:'UNAVAILABLE',recruitments:null,error:{code:recruitmentResult.reason?.code||'D365_LOYALTY_READ_FAILED',message:recruitmentResult.reason?.message||String(recruitmentResult.reason||'')}};
 const baseLoyalty=c.loyalty||{},recruitments=recruitment.status==='READY'?Number(recruitment.recruitments||0):null,recruitmentRateNonLoyalty=recruitments!==null&&Number(baseLoyalty.nonLoyaltyTickets||0)>0?round2((recruitments/Number(baseLoyalty.nonLoyaltyTickets))*100):null,loyalty={...baseLoyalty,recruitments,recruitmentRateNonLoyalty,recruitmentSource:recruitment.status==='READY'?recruitment.source:'UNAVAILABLE'};
 const snapshot=normalizeRetailInsights({source:current.source,storeId,businessDate,refreshedAt:new Date().toISOString(),sales:c.sales,netSales:c.netSales,tickets:c.tickets,units:c.units,marginValue:c.marginValue,marginRate:c.marginRate,comparison:prior?.netSales??null,outOfStockCount:stock.outOfStockCount,nearOutOfStockCount:stock.nearOutOfStockCount,negativeStockCount:stock.negativeStockCount,residualOutsideAssortment:stock.residualOutsideAssortment,loyalty,departments:c.departments,categories:c.categories,products:c.products,hourly:c.hourly});
 const comparisonMeta={mode:comparisonScope.mode,date:comparisonDate,cutoffMinute:comparisonScope.cutoffMinute,cutoffLabel:comparisonScope.cutoffLabel,timeZone:comparisonScope.timeZone,available:!!prior,reason:prior?null:comparison.status!=='READY'?'COMPARISON_READ_FAILED':comparisonScope.mode==='SAME_TIME'?(comparisonCutoff?.reason||'TIME_CUTOFF_UNAVAILABLE'):'COMPARISON_UNAVAILABLE'};const analysis=pulseAnalysis(c,prior,snapshot,stock);const value={status:'READY',storeId,businessDate,comparisonDate,comparison:comparisonMeta,source:current.source,refreshedAt:snapshot.refreshedAt,integration:integrationView,stock,snapshot,analysis,quick:quickPulse(snapshot),diagnostics:{rows:c.rowCount||0,includedRows:c.includedRowCount??c.rowCount??0,pages:c.pages||0,truncated:!!c.truncated,dataQuality:c.dataQuality||null,comparisonRows:prior?.rowCount||0,comparisonRawRows:rawPrior?.rawRowCount||0,comparisonDataQuality:prior?.dataQuality||null,comparisonStatus:comparison.status||null,comparisonCutoff,comparisonMode:comparisonScope.mode,comparisonError:comparison.error||null,loyaltyRecruitment:{status:recruitment.status,source:recruitment.source||null,entity:recruitment.entity||null,dateMode:recruitment.dateMode||null,error:recruitment.error||null},changeVsD7:snapshot.kpis.changeVsComparison==null?null:round2(snapshot.kpis.changeVsComparison)}};
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

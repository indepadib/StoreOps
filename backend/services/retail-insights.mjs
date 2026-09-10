const n=(v,fallback=0)=>{const x=Number(v);return Number.isFinite(x)?x:fallback};
const nullable=v=>v===null||v===undefined||v===''?null:n(v,null);
const round2=v=>Math.round((n(v)+Number.EPSILON)*100)/100;
const pct=(a,b)=>b?round2((a/b)*100):null;

function normalizeBreakdown(rows=[]){
 return (Array.isArray(rows)?rows:[]).map((r,i)=>({
  key:String(r.key??r.code??r.name??i),
  label:String(r.label??r.name??r.key??'Autre'),
  sales:round2(r.sales),
  marginValue:nullable(r.marginValue)==null?null:round2(r.marginValue),
  marginRate:nullable(r.marginRate)==null?(nullable(r.marginValue)!=null&&n(r.sales)>0?pct(n(r.marginValue),n(r.sales)):null):round2(r.marginRate),
  tickets:nullable(r.tickets),
  units:nullable(r.units),
  target:nullable(r.target),
  varianceToTarget:nullable(r.target)!=null?round2(n(r.sales)-n(r.target)):null
 })).sort((a,b)=>b.sales-a.sales);
}

export function normalizeRetailInsights(input={}){
 const sales=round2(input.sales),netSales=nullable(input.netSales)==null?sales:round2(input.netSales),tickets=Math.max(0,n(input.tickets)),units=Math.max(0,n(input.units));
 const marginValue=nullable(input.marginValue)==null?null:round2(input.marginValue),marginRate=nullable(input.marginRate)==null?(marginValue!=null&&netSales>0?pct(marginValue,netSales):null):round2(input.marginRate);
 const target=nullable(input.target)==null?null:round2(input.target),comparison=nullable(input.comparison)==null?null:round2(input.comparison),lossValue=nullable(input.lossValue)==null?null:round2(input.lossValue);
 return {
  source:String(input.source||'UNMAPPED'),
  storeId:input.storeId||null,
  businessDate:input.businessDate||null,
  refreshedAt:input.refreshedAt||new Date().toISOString(),
  kpis:{
   sales,netSales,tickets,averageBasket:tickets?round2(netSales/tickets):null,units,
   marginValue,marginRate,target,achievementRate:target?pct(netSales,target):null,
   comparison,changeVsComparison:comparison?pct(netSales-comparison,comparison):null,
   lossValue,lossRate:lossValue!=null&&netSales>0?pct(lossValue,netSales):null,
   outOfStockCount:Math.max(0,n(input.outOfStockCount)),availabilityRate:nullable(input.availabilityRate)==null?null:round2(input.availabilityRate)
  },
  breakdowns:{
   departments:normalizeBreakdown(input.departments),
   categories:normalizeBreakdown(input.categories),
   products:normalizeBreakdown(input.products),
   hourly:normalizeBreakdown(input.hourly)
  }
 };
}

export function quickPulse(snapshot={}){
 const k=snapshot.kpis||{},cards=[
  {key:'sales',label:'Ventes',value:k.netSales??0,unit:'money',priority:1},
  {key:'margin',label:'Marge',value:k.marginRate,unit:'percent',priority:2},
  {key:'tickets',label:'Tickets',value:k.tickets??0,unit:'number',priority:3},
  {key:'basket',label:'Panier moyen',value:k.averageBasket,unit:'money',priority:4}
 ];
 if(k.target!=null)cards.push({key:'target',label:'Objectif',value:k.achievementRate,unit:'percent',priority:5});
 if(k.outOfStockCount>0)cards.push({key:'oos',label:'Ruptures',value:k.outOfStockCount,unit:'number',priority:0,tone:'danger'});
 return {cards:cards.sort((a,b)=>a.priority-b.priority).slice(0,5),topDepartments:(snapshot.breakdowns?.departments||[]).slice(0,5),topCategories:(snapshot.breakdowns?.categories||[]).slice(0,5)};
}

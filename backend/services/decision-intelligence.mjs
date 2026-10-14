import { readStoreSalesRange } from './dynamics-sales.mjs';
import { attachRetailHierarchy, rankRetailHierarchy } from './retail-hierarchy.mjs';

const num=v=>Number.isFinite(Number(v))?Number(v):0;
const round2=v=>Math.round((num(v)+Number.EPSILON)*100)/100;
const pct=(cur,prev)=>prev?round2((cur-prev)/prev*100):null;

function mergeRows(groups=[],keyField='key'){
  const map=new Map();
  for(const rows of groups){
    for(const row of rows||[]){
      const key=String(row?.[keyField]??row?.key??'').trim();if(!key)continue;
      const cur=map.get(key)||{key,label:row.label||key,sales:0,units:0,marginValue:0,marginKnown:true};
      cur.sales+=num(row.sales);cur.units+=num(row.units);
      if(row.marginValue===null||row.marginValue===undefined)cur.marginKnown=false;else cur.marginValue+=num(row.marginValue);
      if((!cur.label||cur.label===key)&&row.label)cur.label=row.label;
      map.set(key,cur);
    }
  }
  return[...map.values()].map(x=>{const sales=round2(x.sales),marginValue=x.marginKnown?round2(x.marginValue):null;return{key:x.key,label:x.label,sales,units:round2(x.units),marginValue,marginRate:marginValue!==null&&sales?round2(marginValue/sales*100):null}}).sort((a,b)=>b.sales-a.sales||a.key.localeCompare(b.key,'fr'))
}
function compareRows(current=[],previous=[]){
  const prev=new Map(previous.map(x=>[x.key,x])),all=[...current],seen=new Set(current.map(x=>x.key));
  for(const p of previous)if(!seen.has(p.key))all.push({...p,sales:0,units:0,marginValue:p.marginValue===null?null:0,marginRate:null});
  const currentTotal=current.reduce((s,x)=>s+num(x.sales),0);
  return all.sort((a,b)=>b.sales-a.sales||a.key.localeCompare(b.key,'fr')).map((x,i)=>{
    const p=prev.get(x.key),previousSales=num(p?.sales),delta=round2(num(x.sales)-previousSales);
    return{...x,rank:i+1,previousSales:round2(previousSales),deltaSales:delta,changePct:previousSales?pct(num(x.sales),previousSales):null,sharePct:currentTotal?round2(num(x.sales)/currentTotal*100):null,previousMarginValue:p?.marginValue??null,deltaMargin:x.marginValue!==null&&p?.marginValue!==null?round2(x.marginValue-p.marginValue):null}
  })
}
function mergeDaily(results=[]){
  const map=new Map();
  for(const result of results)for(const d of result?.daily||[]){
    const cur=map.get(d.date)||{date:d.date,sales:0,tickets:0,units:0,marginValue:0,marginKnown:true,identifiedSales:0,identifiedKnown:true};
    cur.sales+=num(d.sales);cur.tickets+=num(d.tickets);cur.units+=num(d.units);
    if(d.marginValue===null||d.marginValue===undefined)cur.marginKnown=false;else cur.marginValue+=num(d.marginValue);
    if(d.identifiedSales===null||d.identifiedSales===undefined)cur.identifiedKnown=false;else cur.identifiedSales+=num(d.identifiedSales);
    map.set(d.date,cur)
  }
  return[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>({date:x.date,sales:round2(x.sales),tickets:x.tickets,units:round2(x.units),averageBasket:x.tickets?round2(x.sales/x.tickets):null,marginValue:x.marginKnown?round2(x.marginValue):null,identifiedSales:x.identifiedKnown?round2(x.identifiedSales):null}))
}
function mergeCustomers(results=[],endDate=null){
  const map=new Map();
  for(const result of results)for(const row of result?.customers||[]){
    const key=String(row.customerAccount||'').trim();if(!key)continue;
    const cur=map.get(key)||{customerAccount:key,sales:0,units:0,tickets:0,activeDays:0,firstDate:null,lastDate:null,products:new Map(),stores:new Set(),weekdays:new Map(),hours:new Map()};
    cur.sales+=num(row.sales);cur.units+=num(row.units);cur.tickets+=num(row.tickets);cur.activeDays+=num(row.activeDays);
    if(row.firstDate&&(!cur.firstDate||row.firstDate<cur.firstDate))cur.firstDate=row.firstDate;
    if(row.lastDate&&(!cur.lastDate||row.lastDate>cur.lastDate))cur.lastDate=row.lastDate;
    for(const p of row.topProducts||[])cur.products.set(p.productNumber,(cur.products.get(p.productNumber)||0)+num(p.sales));
    if(row.favouriteWeekday)cur.weekdays.set(row.favouriteWeekday,(cur.weekdays.get(row.favouriteWeekday)||0)+Math.max(1,num(row.activeDays)));
    if(row.favouriteHour!=null)cur.hours.set(String(row.favouriteHour),(cur.hours.get(String(row.favouriteHour))||0)+Math.max(1,num(row.tickets)));
    if(result.storeId)cur.stores.add(result.storeId);
    map.set(key,cur)
  }
  const fav=m=>{let key=null,best=-1;for(const [k,v] of m)if(v>best){key=k;best=v}return key};
  const rows=[...map.values()].map(x=>{
    const recency=x.lastDate&&endDate?Math.max(0,Math.round((Date.parse(endDate+'T12:00:00Z')-Date.parse(x.lastDate+'T12:00:00Z'))/86400000)):null;
    return{customerAccount:x.customerAccount,sales:round2(x.sales),units:round2(x.units),tickets:x.tickets,activeDays:x.activeDays,averageBasket:x.tickets?round2(x.sales/x.tickets):null,averageUnitsPerBasket:x.tickets?round2(x.units/x.tickets):null,firstDate:x.firstDate,lastDate:x.lastDate,recencyDays:recency,storeCount:x.stores.size,distinctProducts:x.products.size,favouriteWeekday:fav(x.weekdays),favouriteHour:fav(x.hours),topProducts:[...x.products.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([productNumber,sales])=>({productNumber,sales:round2(sales)}))}
  }).sort((a,b)=>b.sales-a.sales);
  const totalSales=rows.reduce((s,x)=>s+x.sales,0),highValue=rows.length?rows[Math.max(0,Math.ceil(rows.length*.2)-1)]?.sales||0:0;
  const basketValues=rows.map(x=>num(x.averageBasket)).sort((a,b)=>a-b),breadthValues=rows.map(x=>num(x.distinctProducts)).sort((a,b)=>a-b),p80=a=>a.length?a[Math.max(0,Math.ceil(a.length*.8)-1)]:0,highBasket=p80(basketValues),broad=p80(breadthValues);
  return rows.map(x=>{let persona='REPEAT_TO_GROW';if(x.tickets>=4&&x.sales>=highValue)persona='VIP_REGULAR';else if(x.tickets<=2&&x.averageBasket>=highBasket)persona='BIG_BASKET_OCCASIONAL';else if(x.distinctProducts>=broad&&x.tickets>=2)persona='EXPLORER';else if(x.tickets>=4)persona='ROUTINE_REGULAR';else if(x.tickets<=1)persona='ONE_SHOT';return{...x,segment:x.tickets>=4&&x.sales>=highValue?'HIGH_VALUE_FREQUENT':x.sales>=highValue?'HIGH_VALUE':x.tickets>=4?'FREQUENT':x.tickets>=2?'REPEAT':'SINGLE_VISIT',persona,shareIdentifiedSalesPct:totalSales?round2(x.sales/totalSales*100):null}})
}

function mergeBasketAnalysis(results=[]){
  const products=new Map(),pairs=new Map();let baskets=0,weightedUnits=0,weightedDistinct=0,singleWeighted=0;
  for(const r of results){const b=r?.basketAnalysis||{},n=num(b.identifiedBaskets);baskets+=n;if(b.averageUnits!=null)weightedUnits+=num(b.averageUnits)*n;if(b.averageDistinctProducts!=null)weightedDistinct+=num(b.averageDistinctProducts)*n;if(b.singleItemBasketRate!=null)singleWeighted+=num(b.singleItemBasketRate)*n;
    for(const x of b.topProducts||[])products.set(x.productNumber,(products.get(x.productNumber)||0)+num(x.sales));
    for(const x of b.topProductPairs||[]){const a=String(x.productA||''),d=String(x.productB||''),key=a<d?`${a}|${d}`:`${d}|${a}`,cur=pairs.get(key)||{productA:a<d?a:d,productB:a<d?d:a,tickets:0};cur.tickets+=num(x.tickets);pairs.set(key,cur)}
  }
  return{identifiedBaskets:baskets,averageUnits:baskets?round2(weightedUnits/baskets):null,averageDistinctProducts:baskets?round2(weightedDistinct/baskets):null,singleItemBasketRate:baskets?round2(singleWeighted/baskets):null,topProducts:[...products.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([productNumber,sales])=>({productNumber,sales:round2(sales)})),topProductPairs:[...pairs.values()].sort((a,b)=>b.tickets-a.tickets).slice(0,40).map(x=>({...x,sharePct:baskets?round2(x.tickets/baskets*100):null}))}
}
function customerCohorts(customers=[]){
  const map=new Map();
  for(const x of customers){if(!x.firstDate)continue;const d=new Date(x.firstDate+'T12:00:00Z'),dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);const key=d.toISOString().slice(0,10),cur=map.get(key)||{cohort:key,customers:0,sales:0,repeat:0,tickets:0};cur.customers++;cur.sales+=num(x.sales);cur.tickets+=num(x.tickets);if(x.tickets>=2)cur.repeat++;map.set(key,cur)}
  return[...map.values()].sort((a,b)=>a.cohort.localeCompare(b.cohort)).map(x=>({...x,sales:round2(x.sales),repeatRate:x.customers?round2(x.repeat/x.customers*100):null,averageSpend:x.customers?round2(x.sales/x.customers):null,averageVisits:x.customers?round2(x.tickets/x.customers):null}))
}

function sumSummary(results=[]){
  let sales=0,tickets=0,units=0,marginValue=0,marginKnown=true,identifiedSales=0,identifiedKnown=true,identifiedTickets=0,identifiedTicketsKnown=true;
  for(const r of results){
    const s=r?.summary||{};sales+=num(s.sales);tickets+=num(s.tickets);units+=num(s.units);
    if(s.marginValue===null||s.marginValue===undefined)marginKnown=false;else marginValue+=num(s.marginValue);
    if(s.identifiedSales===null||s.identifiedSales===undefined)identifiedKnown=false;else identifiedSales+=num(s.identifiedSales);
    if(s.identifiedTickets===null||s.identifiedTickets===undefined)identifiedTicketsKnown=false;else identifiedTickets+=num(s.identifiedTickets)
  }
  return{sales:round2(sales),tickets,units:round2(units),averageBasket:tickets?round2(sales/tickets):null,marginValue:marginKnown?round2(marginValue):null,marginRate:marginKnown&&sales?round2(marginValue/sales*100):null,identifiedSales:identifiedKnown?round2(identifiedSales):null,identifiedSalesShare:identifiedKnown&&sales?round2(identifiedSales/sales*100):null,identifiedTickets:identifiedTicketsKnown?identifiedTickets:null,identifiedTicketRate:identifiedTicketsKnown&&tickets?round2(identifiedTickets/tickets*100):null}
}
function driverDecomposition(current,previous){
 const prevBasket=previous.averageBasket,currentBasket=current.averageBasket;
 if(previous.tickets==null||current.tickets==null||prevBasket==null||currentBasket==null)return{trafficEffect:null,basketEffect:null,totalDelta:round2(current.sales-previous.sales)};
 const trafficEffect=round2((current.tickets-previous.tickets)*prevBasket);
 const basketEffect=round2(current.tickets*(currentBasket-prevBasket));
 return{trafficEffect,basketEffect,totalDelta:round2(current.sales-previous.sales),reconciliationGap:round2((current.sales-previous.sales)-trafficEffect-basketEffect)}
}
function hierarchyFromProducts(currentProducts,previousProducts){
 const currentAttached=attachRetailHierarchy(currentProducts),previousAttached=attachRetailHierarchy(previousProducts),ranked=rankRetailHierarchy(currentAttached,previousAttached);
 const levels=['department','rayon','family','subfamily','subsubfamily','ub'];
 const margins=(rows,level)=>{
  const map=new Map();
  for(const p of rows){
   const node=p.hierarchy?.levels?.[level],key=node?.id||'__UNCLASSIFIED__',cur=map.get(key)||{marginValue:0,marginKnown:true};
   if(p.marginValue===null||p.marginValue===undefined)cur.marginKnown=false;else cur.marginValue+=num(p.marginValue);
   map.set(key,cur)
  }
  return map
 };
 for(const level of levels){
  const cur=margins(currentAttached,level),prev=margins(previousAttached,level);
  ranked[level]=ranked[level].map(row=>{
   const cm=cur.get(row.key),pm=prev.get(row.key),marginValue=cm?.marginKnown?round2(cm.marginValue):null,previousMarginValue=pm?.marginKnown?round2(pm.marginValue):null;
   return{...row,marginValue,marginRate:marginValue!==null&&row.sales?round2(marginValue/row.sales*100):null,previousMarginValue,deltaMargin:marginValue!==null&&previousMarginValue!==null?round2(marginValue-previousMarginValue):null}
  })
 }
 return ranked
}
function storeComparison(store,current,previous){
 const c=current?.summary||{},p=previous?.summary||{};
 return{storeId:store.id,storeName:store.name,storeCode:store.code,sales:c.sales??null,previousSales:p.sales??null,changePct:p.sales?pct(c.sales,p.sales):null,deltaSales:c.sales!=null&&p.sales!=null?round2(c.sales-p.sales):null,tickets:c.tickets??null,previousTickets:p.tickets??null,ticketsChangePct:p.tickets?pct(c.tickets,p.tickets):null,averageBasket:c.averageBasket??null,previousAverageBasket:p.averageBasket??null,basketChangePct:p.averageBasket?pct(c.averageBasket,p.averageBasket):null,marginValue:c.marginValue??null,marginRate:c.marginRate??null,previousMarginValue:p.marginValue??null,deltaMargin:c.marginValue!=null&&p.marginValue!=null?round2(c.marginValue-p.marginValue):null,marginChangePct:p.marginValue?pct(c.marginValue,p.marginValue):null,identifiedSalesShare:c.identifiedSalesShare??null,identifiedTicketRate:c.identifiedTicketRate??null,status:current?.status||'UNAVAILABLE'}
}
export async function buildDecisionIntelligence(stores,{startDate,endDate,compareStartDate,compareEndDate,force=false}={}){
 const pairs=await Promise.all(stores.map(async store=>{
  const [current,previous]=await Promise.all([
    readStoreSalesRange(store.id,{startDate,endDate,force}),
    readStoreSalesRange(store.id,{startDate:compareStartDate,endDate:compareEndDate,force})
  ]);
  return{store,current,previous}
 }));
 const currentResults=pairs.map(x=>({...x.current,storeId:x.store.id})).filter(x=>x.status==='READY'||x.status==='TRUNCATED');
 const previousResults=pairs.map(x=>({...x.previous,storeId:x.store.id})).filter(x=>x.status==='READY'||x.status==='TRUNCATED');
 const currentSummary=sumSummary(currentResults),previousSummary=sumSummary(previousResults);
 const currentProducts=mergeRows(currentResults.map(x=>x.products)),previousProducts=mergeRows(previousResults.map(x=>x.products));
 const products=compareRows(currentProducts,previousProducts),hierarchy=hierarchyFromProducts(currentProducts,previousProducts);
 const customers=mergeCustomers(currentResults,endDate),basketAnalysis=mergeBasketAnalysis(currentResults),cohorts=customerCohorts(customers);
 const marginStatuses=[...new Set(currentResults.map(x=>x.margin?.status).filter(Boolean))],marginStatus=marginStatuses.length===1?marginStatuses[0]:marginStatuses.includes('UNVALIDATED')?'UNVALIDATED':marginStatuses.includes('UNAVAILABLE')?'UNAVAILABLE':'MIXED';
 const storesComparison=pairs.map(x=>storeComparison(x.store,x.current,x.previous)).sort((a,b)=>num(b.sales)-num(a.sales));
 const negativeProducts=[...products].filter(x=>x.deltaSales<0).sort((a,b)=>a.deltaSales-b.deltaSales).slice(0,20),positiveProducts=[...products].filter(x=>x.deltaSales>0).sort((a,b)=>b.deltaSales-a.deltaSales).slice(0,20);
 const identifiedSales=customers.reduce((s,x)=>s+x.sales,0),repeatCustomers=customers.filter(x=>x.tickets>=2).length,frequentCustomers=customers.filter(x=>x.tickets>=4).length;
 return{
  status:currentResults.length?'READY':'UNAVAILABLE',
  period:{startDate,endDate,days:currentResults[0]?.days||null},
  comparison:{startDate:compareStartDate,endDate:compareEndDate,days:previousResults[0]?.days||null},
  coverage:{storesRequested:stores.length,currentStoresReady:currentResults.length,comparisonStoresReady:previousResults.length},
  summary:{
    current:currentSummary,previous:previousSummary,
    salesChangePct:previousSummary.sales?pct(currentSummary.sales,previousSummary.sales):null,
    ticketsChangePct:previousSummary.tickets?pct(currentSummary.tickets,previousSummary.tickets):null,
    basketChangePct:previousSummary.averageBasket?pct(currentSummary.averageBasket,previousSummary.averageBasket):null,
    marginChangePct:previousSummary.marginValue?pct(currentSummary.marginValue,previousSummary.marginValue):null,
    marginRateDelta:currentSummary.marginRate!=null&&previousSummary.marginRate!=null?round2(currentSummary.marginRate-previousSummary.marginRate):null,
    drivers:driverDecomposition(currentSummary,previousSummary)
  },
  margin:{status:marginStatus,available:marginStatus==='VALIDATED',message:marginStatus==='VALIDATED'?'Coût transactionnel validé.':marginStatus==='UNVALIDATED'?'Champ coût détecté mais non validé comme coût historique transactionnel.':'Coût transactionnel indisponible.'},
  daily:{current:mergeDaily(currentResults),previous:mergeDaily(previousResults)},
  stores:storesComparison,
  products,
  hierarchy,
  contributors:{negativeProducts,positiveProducts,negativeStores:[...storesComparison].filter(x=>x.deltaSales<0).sort((a,b)=>a.deltaSales-b.deltaSales).slice(0,10),positiveStores:[...storesComparison].filter(x=>x.deltaSales>0).sort((a,b)=>b.deltaSales-a.deltaSales).slice(0,10)},
  crm:{scope:'SELECTED_PERIOD_ONLY',identifiedCustomers:customers.length,identifiedSales:round2(identifiedSales),repeatCustomers,frequentCustomers,repeatRate:customers.length?round2(repeatCustomers/customers.length*100):null,cohorts,basketAnalysis,personas:Object.entries(customers.reduce((a,x)=>(a[x.persona]=(a[x.persona]||0)+1,a),{})).map(([persona,count])=>({persona,count,sharePct:customers.length?round2(count/customers.length*100):null})).sort((a,b)=>b.count-a.count),customers:customers.slice(0,500)},
  generatedAt:new Date().toISOString()
 }
}

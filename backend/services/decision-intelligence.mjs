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
      const cur=map.get(key)||{key,label:row.label||key,sales:0,units:0,marginSalesBase:0,marginValue:0,marginKnown:true,marginBaseKnown:true,quantityUnits:new Set()};
      cur.sales+=num(row.sales);cur.units+=num(row.units);if(row.quantityUnit)cur.quantityUnits.add(String(row.quantityUnit));
      if(row.marginSalesBase===null||row.marginSalesBase===undefined)cur.marginBaseKnown=false;else cur.marginSalesBase+=num(row.marginSalesBase);
      if(row.marginValue===null||row.marginValue===undefined)cur.marginKnown=false;else cur.marginValue+=num(row.marginValue);
      if((!cur.label||cur.label===key)&&row.label)cur.label=row.label;
      map.set(key,cur);
    }
  }
  return[...map.values()].map(x=>{const sales=round2(x.sales),marginSalesBase=x.marginBaseKnown?round2(x.marginSalesBase):null,marginValue=x.marginKnown?round2(x.marginValue):null,quantityUnit=x.quantityUnits.size===1?[...x.quantityUnits][0]:null;return{key:x.key,label:x.label,sales,units:round2(x.units),quantityUnit,marginSalesBase,marginValue,marginRate:marginValue!==null&&marginSalesBase?round2(marginValue/marginSalesBase*100):null}}).sort((a,b)=>b.sales-a.sales||a.key.localeCompare(b.key,'fr'))
}
function compareRows(current=[],previous=[]){
  const prev=new Map(previous.map(x=>[x.key,x])),all=[...current],seen=new Set(current.map(x=>x.key));
  for(const p of previous)if(!seen.has(p.key))all.push({...p,sales:0,units:0,marginValue:p.marginValue===null?null:0,marginRate:null});
  const currentTotal=current.reduce((s,x)=>s+num(x.sales),0);
  return all.sort((a,b)=>b.sales-a.sales||a.key.localeCompare(b.key,'fr')).map((x,i)=>{
    const p=prev.get(x.key),previousSales=num(p?.sales),delta=round2(num(x.sales)-previousSales);
    return{...x,rank:i+1,previousSales:round2(previousSales),deltaSales:delta,changePct:previousSales?pct(num(x.sales),previousSales):null,sharePct:currentTotal?round2(num(x.sales)/currentTotal*100):null,previousMarginSalesBase:p?.marginSalesBase??null,previousMarginValue:p?.marginValue??null,deltaMargin:x.marginValue!=null&&p?.marginValue!=null?round2(x.marginValue-p.marginValue):null}
  })
}
function mergeDaily(results=[]){
  const map=new Map();
  for(const result of results)for(const d of result?.daily||[]){
    const cur=map.get(d.date)||{date:d.date,sales:0,tickets:0,units:0,marginSalesBase:0,marginBaseKnown:true,marginValue:0,marginKnown:true,identifiedSales:0,identifiedKnown:true};
    cur.sales+=num(d.sales);cur.tickets+=num(d.tickets);cur.units+=num(d.units);
    if(d.marginSalesBase===null||d.marginSalesBase===undefined)cur.marginBaseKnown=false;else cur.marginSalesBase+=num(d.marginSalesBase);
    if(d.marginValue===null||d.marginValue===undefined)cur.marginKnown=false;else cur.marginValue+=num(d.marginValue);
    if(d.identifiedSales===null||d.identifiedSales===undefined)cur.identifiedKnown=false;else cur.identifiedSales+=num(d.identifiedSales);
    map.set(d.date,cur)
  }
  return[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(x=>{const marginSalesBase=x.marginBaseKnown?round2(x.marginSalesBase):null,marginValue=x.marginKnown?round2(x.marginValue):null;return{date:x.date,sales:round2(x.sales),tickets:x.tickets,units:round2(x.units),averageBasket:x.tickets?round2(x.sales/x.tickets):null,marginSalesBase,marginValue,marginRate:marginValue!==null&&marginSalesBase?round2(marginValue/marginSalesBase*100):null,identifiedSales:x.identifiedKnown?round2(x.identifiedSales):null}})
}
function mergeCustomers(results=[],endDate=null){
  const map=new Map();
  for(const result of results)for(const row of result?.customers||[]){
    const key=String(row.customerAccount||'').trim();if(!key)continue;
    const cur=map.get(key)||{customerAccount:key,sales:0,units:0,tickets:0,activeDays:0,firstDate:null,lastDate:null,products:new Map(),stores:new Set(),weekdays:new Map(),hours:new Map()};
    cur.sales+=num(row.sales);cur.units+=num(row.units);cur.tickets+=num(row.tickets);cur.activeDays+=num(row.activeDays);
    if(row.firstDate&&(!cur.firstDate||row.firstDate<cur.firstDate))cur.firstDate=row.firstDate;
    if(row.lastDate&&(!cur.lastDate||row.lastDate>cur.lastDate))cur.lastDate=row.lastDate;
    for(const p of row.topProducts||[]){const cp=cur.products.get(p.productNumber)||{sales:0,units:0};cp.sales+=num(p.sales);cp.units+=num(p.units);cur.products.set(p.productNumber,cp)}
    if(row.favouriteWeekday)cur.weekdays.set(row.favouriteWeekday,(cur.weekdays.get(row.favouriteWeekday)||0)+Math.max(1,num(row.activeDays)));
    if(row.favouriteHour!=null)cur.hours.set(String(row.favouriteHour),(cur.hours.get(String(row.favouriteHour))||0)+Math.max(1,num(row.tickets)));
    if(result.storeId)cur.stores.add(result.storeId);
    map.set(key,cur)
  }
  const fav=m=>{let key=null,best=-1;for(const [k,v] of m)if(v>best){key=k;best=v}return key};
  const rows=[...map.values()].map(x=>{
    const recency=x.lastDate&&endDate?Math.max(0,Math.round((Date.parse(endDate+'T12:00:00Z')-Date.parse(x.lastDate+'T12:00:00Z'))/86400000)):null;
    return{customerAccount:x.customerAccount,sales:round2(x.sales),units:round2(x.units),tickets:x.tickets,activeDays:x.activeDays,averageBasket:x.tickets?round2(x.sales/x.tickets):null,averageUnitsPerBasket:x.tickets?round2(x.units/x.tickets):null,firstDate:x.firstDate,lastDate:x.lastDate,recencyDays:recency,storeCount:x.stores.size,distinctProducts:x.products.size,favouriteWeekday:fav(x.weekdays),favouriteHour:fav(x.hours),topProducts:[...x.products.entries()].sort((a,b)=>b[1].sales-a[1].sales).slice(0,20).map(([productNumber,v])=>({productNumber,sales:round2(v.sales),units:round2(v.units)}))}
  }).sort((a,b)=>b.sales-a.sales);
  const totalSales=rows.reduce((s,x)=>s+x.sales,0),highValue=rows.length?rows[Math.max(0,Math.ceil(rows.length*.2)-1)]?.sales||0:0;
  const basketValues=rows.map(x=>num(x.averageBasket)).sort((a,b)=>a-b),breadthValues=rows.map(x=>num(x.distinctProducts)).sort((a,b)=>a-b),p80=a=>a.length?a[Math.max(0,Math.ceil(a.length*.8)-1)]:0,highBasket=p80(basketValues),broad=p80(breadthValues);
  return rows.map(x=>{let persona='REPEAT_TO_GROW';if(x.tickets>=4&&x.sales>=highValue)persona='VIP_REGULAR';else if(x.tickets<=2&&x.averageBasket>=highBasket)persona='BIG_BASKET_OCCASIONAL';else if(x.distinctProducts>=broad&&x.tickets>=2)persona='EXPLORER';else if(x.tickets>=4)persona='ROUTINE_REGULAR';else if(x.tickets<=1)persona='ONE_SHOT';return{...x,segment:x.tickets>=4&&x.sales>=highValue?'HIGH_VALUE_FREQUENT':x.sales>=highValue?'HIGH_VALUE':x.tickets>=4?'FREQUENT':x.tickets>=2?'REPEAT':'SINGLE_VISIT',persona,shareIdentifiedSalesPct:totalSales?round2(x.sales/totalSales*100):null}})
}

function mergeBasketAnalysis(results=[]){
  const products=new Map(),penetration=new Map(),pairs=new Map();let baskets=0,weightedUnits=0,weightedDistinct=0,singleWeighted=0,weightedValue=0;
  for(const r of results){
    const b=r?.basketAnalysis||{},n=num(b.identifiedBaskets);baskets+=n;
    if(b.averageUnits!=null)weightedUnits+=num(b.averageUnits)*n;
    if(b.averageDistinctProducts!=null)weightedDistinct+=num(b.averageDistinctProducts)*n;
    if(b.singleItemBasketRate!=null)singleWeighted+=num(b.singleItemBasketRate)*n;
    if(b.averageBasketValue!=null)weightedValue+=num(b.averageBasketValue)*n;
    for(const x of b.topProducts||[])products.set(x.productNumber,(products.get(x.productNumber)||0)+num(x.sales));
    for(const x of b.topProductsByPenetration||[]){const cur=penetration.get(x.productNumber)||{tickets:0,sales:0};cur.tickets+=num(x.tickets);cur.sales+=num(x.sales);penetration.set(x.productNumber,cur)}
    for(const x of b.topProductPairs||[]){const a=String(x.productA||''),d=String(x.productB||''),key=a<d?`${a}|${d}`:`${d}|${a}`,cur=pairs.get(key)||{productA:a<d?a:d,productB:a<d?d:a,tickets:0};cur.tickets+=num(x.tickets);pairs.set(key,cur)}
  }
  return{
    identifiedBaskets:baskets,
    averageBasketValue:baskets?round2(weightedValue/baskets):null,
    averageUnits:baskets?round2(weightedUnits/baskets):null,
    averageDistinctProducts:baskets?round2(weightedDistinct/baskets):null,
    singleItemBasketRate:baskets?round2(singleWeighted/baskets):null,
    multiProductBasketRate:baskets?round2(100-singleWeighted/baskets):null,
    topProducts:[...products.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([productNumber,sales])=>({productNumber,sales:round2(sales)})),
    topProductsByPenetration:[...penetration.entries()].map(([productNumber,v])=>({productNumber,tickets:v.tickets,sales:round2(v.sales),sharePct:baskets?round2(v.tickets/baskets*100):null})).sort((a,b)=>b.tickets-a.tickets||b.sales-a.sales).slice(0,30),
    topProductPairs:[...pairs.values()].sort((a,b)=>b.tickets-a.tickets).slice(0,50).map(x=>({...x,sharePct:baskets?round2(x.tickets/baskets*100):null}))
  }
}
function customerCohorts(customers=[]){
  const map=new Map();
  for(const x of customers){if(!x.firstDate)continue;const d=new Date(x.firstDate+'T12:00:00Z'),dow=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-dow);const key=d.toISOString().slice(0,10),cur=map.get(key)||{cohort:key,customers:0,sales:0,repeat:0,tickets:0};cur.customers++;cur.sales+=num(x.sales);cur.tickets+=num(x.tickets);if(x.tickets>=2)cur.repeat++;map.set(key,cur)}
  return[...map.values()].sort((a,b)=>a.cohort.localeCompare(b.cohort)).map(x=>({...x,sales:round2(x.sales),repeatRate:x.customers?round2(x.repeat/x.customers*100):null,averageSpend:x.customers?round2(x.sales/x.customers):null,averageVisits:x.customers?round2(x.tickets/x.customers):null}))
}


function mergeStaff(results=[]){
 const map=new Map();
 for(const r of results){
  for(const s of r?.staff||[]){
   const storeId=r.storeId||null,staffId=String(s.staffId||'').trim();if(!staffId)continue;
   const key=`${storeId||''}|${staffId}`,cur=map.get(key)||{storeId,staffId,sales:0,tickets:0,identifiedTickets:0,identifiedSales:0,nonLoyaltyTickets:0,recruitments:0,recruitmentsKnown:false};
   cur.sales+=num(s.sales);cur.tickets+=num(s.tickets);cur.identifiedTickets+=num(s.identifiedTickets);cur.identifiedSales+=num(s.identifiedSales);cur.nonLoyaltyTickets+=num(s.nonLoyaltyTickets);
   if(s.recruitments!=null){cur.recruitments+=num(s.recruitments);cur.recruitmentsKnown=true}
   map.set(key,cur)
  }
 }
 return[...map.values()].map(x=>({...x,identifiedTicketRate:x.tickets?round2(x.identifiedTickets/x.tickets*100):null,identifiedSalesShare:x.sales?round2(x.identifiedSales/x.sales*100):null,recruitments:x.recruitmentsKnown?x.recruitments:null,recruitmentRateNonLoyalty:x.recruitmentsKnown&&x.nonLoyaltyTickets?round2(x.recruitments/x.nonLoyaltyTickets*100):null})).sort((a,b)=>num(b.sales)-num(a.sales)||num(b.tickets)-num(a.tickets))
}

function normalizedPriceBasis(unitValue){
 const u=String(unitValue||'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(['KG','KGS','KILOGRAM','KILOGRAMME','KILOGRAMMES'].includes(u))return{basis:'KG',priceFactor:1};
 if(['G','GR','GRAM','GRAMME','GRAMMES'].includes(u))return{basis:'KG',priceFactor:1000};
 if(['L','LT','LITRE','LITER','LITRES','LITERS'].includes(u))return{basis:'L',priceFactor:1};
 if(['ML','MILLILITRE','MILLILITER','MILLILITRES','MILLILITERS'].includes(u))return{basis:'L',priceFactor:1000};
 if(['PC','PCS','EA','EACH','PIECE','PIECE','PIECES','UNIT','UN','U'].includes(u))return{basis:'PC',priceFactor:1};
 return u?{basis:u,priceFactor:1}:null
}

function buildPriceTierMap(products=[]){
 const attached=attachRetailHierarchy(products),groups=new Map(),map=new Map();
 for(const p of attached){
  const units=Math.abs(num(p.units)),sales=num(p.sales),basis=normalizedPriceBasis(p.quantityUnit);
  if(!units||!sales||!basis)continue;
  const family=p.hierarchy?.levels?.family?.id||p.hierarchy?.levels?.rayon?.id||null;
  if(!family)continue;
  const key=`${family}|${basis.basis}`,price=sales/units*basis.priceFactor;
  if(!Number.isFinite(price)||price<=0)continue;
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push({key:p.key,price})
 }
 for(const rows of groups.values()){
  // A relative price position is meaningless when there are too few comparable SKUs.
  if(rows.length<5)continue;
  const sorted=[...rows].sort((a,b)=>a.price-b.price),n=sorted.length;
  const qLow=sorted[Math.floor((n-1)*.30)].price,qHigh=sorted[Math.floor((n-1)*.70)].price;
  for(const r of sorted)map.set(r.key,{tier:r.price<=qLow?'VALUE':r.price>=qHigh?'PREMIUM':'CORE',score:r.price,comparableSkuCount:n})
 }
 return map
}

function enrichCustomerPricePreferences(customers=[],tierMap=new Map()){
 return customers.map(c=>{
  const mix={VALUE:0,CORE:0,PREMIUM:0};let classifiedSales=0;
  for(const p of c.topProducts||[]){
   const tier=tierMap.get(p.productNumber)?.tier;if(!tier)continue;
   const weight=Math.max(0,num(p.sales));mix[tier]+=weight;classifiedSales+=weight
  }
  const customerSales=Math.max(0,num(c.sales)),coveragePct=customerSales?classifiedSales/customerSales*100:null;
  const ranked=Object.entries(mix).sort((a,b)=>b[1]-a[1]),dominant=ranked[0],dominantPct=classifiedSales&&dominant?dominant[1]/classifiedSales*100:null;
  let pricePreference='UNKNOWN';
  if(coveragePct!=null&&coveragePct>=60&&dominantPct!=null)pricePreference=dominantPct>=55?dominant[0]:'MIXED';
  return{...c,pricePreference,priceMix:classifiedSales?{valuePct:round2(mix.VALUE/classifiedSales*100),corePct:round2(mix.CORE/classifiedSales*100),premiumPct:round2(mix.PREMIUM/classifiedSales*100),coverageSales:round2(classifiedSales),coveragePct:round2(coveragePct),dominantPct:round2(dominantPct)}:null}
 })
}

function sumSummary(results=[]){
  let sales=0,tickets=0,units=0,marginSalesBase=0,marginBaseKnown=true,marginValue=0,marginKnown=true,identifiedSales=0,identifiedKnown=true,identifiedTickets=0,identifiedTicketsKnown=true;
  for(const r of results){
    const s=r?.summary||{};sales+=num(s.sales);tickets+=num(s.tickets);units+=num(s.units);
    if(s.marginSalesBase===null||s.marginSalesBase===undefined)marginBaseKnown=false;else marginSalesBase+=num(s.marginSalesBase);
    if(s.marginValue===null||s.marginValue===undefined)marginKnown=false;else marginValue+=num(s.marginValue);
    if(s.identifiedSales===null||s.identifiedSales===undefined)identifiedKnown=false;else identifiedSales+=num(s.identifiedSales);
    if(s.identifiedTickets===null||s.identifiedTickets===undefined)identifiedTicketsKnown=false;else identifiedTickets+=num(s.identifiedTickets)
  }
  const marginBase=marginBaseKnown?round2(marginSalesBase):null,margin=marginKnown?round2(marginValue):null;
  return{sales:round2(sales),tickets,units:round2(units),averageBasket:tickets?round2(sales/tickets):null,marginSalesBase:marginBase,marginValue:margin,marginRate:margin!==null&&marginBase?round2(margin/marginBase*100):null,identifiedSales:identifiedKnown?round2(identifiedSales):null,identifiedSalesShare:identifiedKnown&&sales?round2(identifiedSales/sales*100):null,identifiedTickets:identifiedTicketsKnown?identifiedTickets:null,identifiedTicketRate:identifiedTicketsKnown&&tickets?round2(identifiedTickets/tickets*100):null}
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
   const node=p.hierarchy?.levels?.[level],key=node?.id||'__UNCLASSIFIED__',cur=map.get(key)||{marginSalesBase:0,marginBaseKnown:true,marginValue:0,marginKnown:true};
   if(p.marginSalesBase===null||p.marginSalesBase===undefined)cur.marginBaseKnown=false;else cur.marginSalesBase+=num(p.marginSalesBase);
   if(p.marginValue===null||p.marginValue===undefined)cur.marginKnown=false;else cur.marginValue+=num(p.marginValue);
   map.set(key,cur)
  }
  return map
 };
 for(const level of levels){
  const cur=margins(currentAttached,level),prev=margins(previousAttached,level);
  ranked[level]=ranked[level].map(row=>{
   const cm=cur.get(row.key),pm=prev.get(row.key),marginSalesBase=cm?.marginBaseKnown?round2(cm.marginSalesBase):null,marginValue=cm?.marginKnown?round2(cm.marginValue):null,previousMarginSalesBase=pm?.marginBaseKnown?round2(pm.marginSalesBase):null,previousMarginValue=pm?.marginKnown?round2(pm.marginValue):null;
   return{...row,marginSalesBase,marginValue,marginRate:marginValue!==null&&marginSalesBase?round2(marginValue/marginSalesBase*100):null,previousMarginSalesBase,previousMarginValue,deltaMargin:marginValue!==null&&previousMarginValue!==null?round2(marginValue-previousMarginValue):null}
  })
 }
 return ranked
}
function storeComparison(store,current,previous){
 const c=current?.summary||{},p=previous?.summary||{};
 return{storeId:store.id,storeName:store.name,storeCode:store.code,sales:c.sales??null,previousSales:p.sales??null,changePct:p.sales?pct(c.sales,p.sales):null,deltaSales:c.sales!=null&&p.sales!=null?round2(c.sales-p.sales):null,tickets:c.tickets??null,previousTickets:p.tickets??null,ticketsChangePct:p.tickets?pct(c.tickets,p.tickets):null,averageBasket:c.averageBasket??null,previousAverageBasket:p.averageBasket??null,basketChangePct:p.averageBasket?pct(c.averageBasket,p.averageBasket):null,marginSalesBase:c.marginSalesBase??null,marginValue:c.marginValue??null,marginRate:c.marginRate??null,previousMarginSalesBase:p.marginSalesBase??null,previousMarginValue:p.marginValue??null,deltaMargin:c.marginValue!=null&&p.marginValue!=null?round2(c.marginValue-p.marginValue):null,marginChangePct:p.marginValue?pct(c.marginValue,p.marginValue):null,identifiedSalesShare:c.identifiedSalesShare??null,identifiedTicketRate:c.identifiedTicketRate??null,status:current?.status||'UNAVAILABLE'}
}
async function mapLimit(items,limit,worker){
 const out=new Array(items.length);let cursor=0;
 const run=async()=>{while(true){const i=cursor++;if(i>=items.length)return;out[i]=await worker(items[i],i)}};
 await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length))},run));
 return out
}

export async function buildDecisionIntelligence(stores,{startDate,endDate,compareStartDate,compareEndDate,force=false}={}){
 const tasks=[];
 for(const store of stores){
  tasks.push({store,kind:'current',startDate,endDate});
  tasks.push({store,kind:'previous',startDate:compareStartDate,endDate:compareEndDate});
 }
 const concurrency=Math.max(1,Math.min(3,Number(process.env.RETAIL_ANALYTICS_D365_CONCURRENCY)||2));
 const resolved=await mapLimit(tasks,concurrency,task=>readStoreSalesRange(task.store.id,{startDate:task.startDate,endDate:task.endDate,force}));
 const byStore=new Map(stores.map(store=>[store.id,{store,current:null,previous:null}]));
 tasks.forEach((task,i)=>{const pair=byStore.get(task.store.id);pair[task.kind]=resolved[i]});
 const pairs=[...byStore.values()];
 const currentResults=pairs.map(x=>({...x.current,storeId:x.store.id})).filter(x=>x.status==='READY'||x.status==='TRUNCATED');
 const previousResults=pairs.map(x=>({...x.previous,storeId:x.store.id})).filter(x=>x.status==='READY'||x.status==='TRUNCATED');
 const currentSummary=sumSummary(currentResults),previousSummary=sumSummary(previousResults);
 const currentProducts=mergeRows(currentResults.map(x=>x.products)),previousProducts=mergeRows(previousResults.map(x=>x.products));
 const products=compareRows(currentProducts,previousProducts),hierarchy=hierarchyFromProducts(currentProducts,previousProducts);
 const priceTierMap=buildPriceTierMap(currentProducts),customers=enrichCustomerPricePreferences(mergeCustomers(currentResults,endDate),priceTierMap),basketAnalysis=mergeBasketAnalysis(currentResults),cohorts=customerCohorts(customers),cashiers=mergeStaff(currentResults);
 const marginResults=currentResults.filter(x=>num(x?.summary?.sales)>0);
 const marginStatuses=[...new Set(marginResults.map(x=>x.margin?.status).filter(Boolean))];let marginStatus=!marginResults.length?'UNAVAILABLE':marginStatuses.length===1?marginStatuses[0]:marginStatuses.includes('UNVALIDATED')?'UNVALIDATED':marginStatuses.includes('UNAVAILABLE')?'UNAVAILABLE':'MIXED';
 const marginSales=marginResults.reduce((s,x)=>s+num(x?.summary?.sales),0),marginCoveredSales=marginResults.reduce((s,x)=>s+num(x?.summary?.sales)*Math.min(100,Math.max(0,num(x?.margin?.coveragePct)))/100,0),marginCoveragePct=marginSales?round2(marginCoveredSales/marginSales*100):null;
 const marginBasisCoveredSales=marginResults.reduce((s,x)=>s+num(x?.summary?.sales)*Math.min(100,Math.max(0,num(x?.margin?.basisCoveragePct)))/100,0),marginBasisCoveragePct=marginSales?round2(marginBasisCoveredSales/marginSales*100):null;
 const marginKinds=[...new Set(marginResults.map(x=>x?.margin?.costKind).filter(Boolean))],marginMethods=[...new Set(marginResults.map(x=>x?.margin?.method).filter(Boolean))],marginFields=[...new Set(marginResults.map(x=>x?.margin?.costField).filter(Boolean))],marginSalesBases=[...new Set(marginResults.map(x=>x?.margin?.salesBasis).filter(Boolean))],marginSalesBasisFields=[...new Set(marginResults.map(x=>x?.margin?.salesBasisField).filter(Boolean))],marginTaxFields=[...new Set(marginResults.map(x=>x?.margin?.taxField).filter(Boolean))];
 const marginReasons=[...new Set(marginResults.map(x=>x?.margin?.reason).filter(Boolean))];
 const sanityMin=Number.isFinite(Number(process.env.RETAIL_MARGIN_SANITY_MIN))?Number(process.env.RETAIL_MARGIN_SANITY_MIN):0;
 const sanityMax=Number.isFinite(Number(process.env.RETAIL_MARGIN_SANITY_MAX))?Number(process.env.RETAIL_MARGIN_SANITY_MAX):60;
 const marginSanityOk=currentSummary.marginRate==null||currentSummary.marginRate>=sanityMin&&currentSummary.marginRate<=sanityMax;
 if(marginStatus==='VALIDATED'&&!marginSanityOk){marginStatus='UNVALIDATED';marginReasons.push('BUSINESS_MARGIN_SANITY_FAILED')}
 const storesComparison=pairs.map(x=>storeComparison(x.store,x.current,x.previous)).sort((a,b)=>num(b.sales)-num(a.sales));
 const negativeProducts=[...products].filter(x=>x.deltaSales<0).sort((a,b)=>a.deltaSales-b.deltaSales).slice(0,20),positiveProducts=[...products].filter(x=>x.deltaSales>0).sort((a,b)=>b.deltaSales-a.deltaSales).slice(0,20);
 const identifiedSales=customers.reduce((s,x)=>s+x.sales,0),repeatCustomers=customers.filter(x=>x.tickets>=2).length,frequentCustomers=customers.filter(x=>x.tickets>=4).length;
 const qualityIssues=[],truncatedStores=currentResults.filter(x=>x?.diagnostics?.truncated||x?.status==='TRUNCATED').length,unknownUnitProducts=currentProducts.filter(x=>num(x.units)!==0&&!x.quantityUnit).length;
 const productSales=round2(currentProducts.reduce((s,x)=>s+num(x.sales),0)),storeSales=round2(storesComparison.reduce((s,x)=>s+num(x.sales),0)),customerSales=round2(customers.reduce((s,x)=>s+num(x.sales),0)),customerTickets=customers.reduce((s,x)=>s+num(x.tickets),0);
 const gapPct=(a,b)=>Math.abs(num(a)-num(b))/Math.max(1,Math.abs(num(b)))*100;
 const productSalesGapPct=gapPct(productSales,currentSummary.sales),storeSalesGapPct=gapPct(storeSales,currentSummary.sales),identifiedSalesGapPct=currentSummary.identifiedSales==null?null:gapPct(customerSales,currentSummary.identifiedSales),identifiedTicketGapPct=currentSummary.identifiedTickets==null?null:gapPct(customerTickets,currentSummary.identifiedTickets);
 if(currentResults.length<stores.length)qualityIssues.push({code:'STORE_COVERAGE',level:'WARN',message:`${currentResults.length}/${stores.length} magasins ventes disponibles`});
 if(truncatedStores)qualityIssues.push({code:'SALES_TRUNCATED',level:'ERROR',message:`${truncatedStores} magasin(s) avec lecture ventes tronquée`});
 if(productSalesGapPct>0.5)qualityIssues.push({code:'PRODUCT_SALES_RECONCILIATION',level:'ERROR',message:`Somme CA articles ≠ CA total (${round2(productSalesGapPct)} % d'écart)`});
 if(storeSalesGapPct>0.1)qualityIssues.push({code:'STORE_SALES_RECONCILIATION',level:'ERROR',message:`Somme CA magasins ≠ CA réseau (${round2(storeSalesGapPct)} % d'écart)`});
 if(currentSummary.identifiedTickets!=null&&customers.length>currentSummary.identifiedTickets)qualityIssues.push({code:'CUSTOMER_CARDINALITY',level:'ERROR',message:'Clients distincts supérieurs aux tickets identifiés'});
 if(currentSummary.identifiedSales!=null&&currentSummary.sales&&currentSummary.identifiedSales>currentSummary.sales*1.001)qualityIssues.push({code:'IDENTIFIED_SALES_GT_TOTAL',level:'ERROR',message:'CA identifié supérieur au CA total'});
 if(identifiedSalesGapPct!=null&&identifiedSalesGapPct>1)qualityIssues.push({code:'IDENTIFIED_SALES_RECONCILIATION',level:'ERROR',message:`CA clients ≠ CA identifié (${round2(identifiedSalesGapPct)} % d'écart)`});
 if(identifiedTicketGapPct!=null&&identifiedTicketGapPct>1)qualityIssues.push({code:'IDENTIFIED_TICKET_RECONCILIATION',level:'WARN',message:`Tickets clients ≠ tickets identifiés (${round2(identifiedTicketGapPct)} % d'écart)`});
 if(marginBasisCoveragePct!=null&&marginBasisCoveragePct<99)qualityIssues.push({code:'MARGIN_HT_BASIS_COVERAGE',level:'ERROR',message:`Base CA HT incomplète pour la marge (${round2(marginBasisCoveragePct)} % du CA TTC couvert)`});
 if(!marginSanityOk)qualityIssues.push({code:'MARGIN_BUSINESS_SANITY',level:'ERROR',message:`Taux de marge calculé ${round2(currentSummary.marginRate)} % hors plage de contrôle ${sanityMin}–${sanityMax} % : publication bloquée`});
 if(unknownUnitProducts)qualityIssues.push({code:'UNIT_COVERAGE',level:'INFO',message:`${unknownUnitProducts} article(s) vendus sans unité transactionnelle`});
 const filterCoverage=currentResults.map(x=>x?.diagnostics?.filterCoverage||{}),mappedFields=currentResults.map(x=>x?.diagnostics?.mappedFields||{});
 const officialFilterCoverage={
  amountBounds:filterCoverage.every(x=>x.amountBounds===true),
  transactionStatus:filterCoverage.every(x=>x.transactionStatus===true),
  returnNoSale:filterCoverage.every(x=>x.returnNoSale===true),
  taxItemGroup:filterCoverage.every(x=>x.taxItemGroupMapped===true&&x.taxItemGroupExclusionConfigured===true)
 };
 if(!officialFilterCoverage.returnNoSale||!officialFilterCoverage.taxItemGroup)qualityIssues.push({code:'OFFICIAL_CA_FILTER_COVERAGE',level:'WARN',message:'Filtres CA officiels returnNoSale / ExoColl non garantis sur toutes les sources ventes'});
 const fieldCoverage={
  product:mappedFields.every(x=>x.product===true),productName:mappedFields.every(x=>x.productName===true),quantity:mappedFields.every(x=>x.quantity===true),
  salesUnit:mappedFields.every(x=>x.salesUnit===true),customer:mappedFields.every(x=>x.customer===true),staff:mappedFields.every(x=>x.staff===true),time:mappedFields.every(x=>x.time===true),marginNet:mappedFields.every(x=>x.marginNet===true),taxAmount:mappedFields.every(x=>x.taxAmount===true)
 };
 if(!fieldCoverage.customer)qualityIssues.push({code:'CUSTOMER_FIELD_COVERAGE',level:'ERROR',message:'Champ client non disponible sur toute la période : KPIs CRM bloqués'});
 if(!fieldCoverage.product)qualityIssues.push({code:'PRODUCT_FIELD_COVERAGE',level:'ERROR',message:'Champ article non disponible : analyses produits bloquées'});
 const publishMargin=marginStatus==='VALIDATED'&&marginSanityOk&&marginBasisCoveragePct!=null&&marginBasisCoveragePct>=99;
 if(!publishMargin){
  currentSummary.marginSalesBase=null;currentSummary.marginValue=null;currentSummary.marginRate=null;
  previousSummary.marginSalesBase=null;previousSummary.marginValue=null;previousSummary.marginRate=null
 }
 const hideMargin=row=>publishMargin?row:{...row,marginSalesBase:null,marginValue:null,marginRate:null,previousMarginSalesBase:null,previousMarginValue:null,deltaMargin:null,marginChangePct:null};
 const publishedProducts=products.map(hideMargin),publishedStores=storesComparison.map(hideMargin),publishedHierarchy=Object.fromEntries(Object.entries(hierarchy).map(([level,rows])=>[level,(rows||[]).map(hideMargin)]));
 const publishedDailyCurrent=mergeDaily(currentResults).map(hideMargin),publishedDailyPrevious=mergeDaily(previousResults).map(hideMargin);
 const quality={status:qualityIssues.some(x=>x.level==='ERROR')?'ERROR':qualityIssues.some(x=>x.level==='WARN')?'WARN':'OK',issues:qualityIssues,checks:{storesRequested:stores.length,storesReady:currentResults.length,truncatedStores,identifiedCustomers:customers.length,identifiedTickets:currentSummary.identifiedTickets,unknownUnitProducts,officialFilterCoverage,fieldCoverage,marginBasisCoveragePct,marginCoveragePct,marginSanity:{min:sanityMin,max:sanityMax,ok:marginSanityOk},productSales,productSalesGapPct,storeSales,storeSalesGapPct,customerIdentifiedSales:customerSales,summaryIdentifiedSales:currentSummary.identifiedSales,identifiedSalesGapPct,customerIdentifiedTickets:customerTickets,summaryIdentifiedTickets:currentSummary.identifiedTickets,identifiedTicketGapPct}};
 return{
  status:currentResults.length?'READY':'UNAVAILABLE',
  period:{startDate,endDate,days:currentResults[0]?.days||null},
  comparison:{startDate:compareStartDate,endDate:compareEndDate,days:previousResults[0]?.days||null},
  coverage:{storesRequested:stores.length,currentStoresReady:currentResults.length,comparisonStoresReady:previousResults.length},
  quality,
  summary:{
    current:currentSummary,previous:previousSummary,
    salesChangePct:previousSummary.sales?pct(currentSummary.sales,previousSummary.sales):null,
    ticketsChangePct:previousSummary.tickets?pct(currentSummary.tickets,previousSummary.tickets):null,
    basketChangePct:previousSummary.averageBasket?pct(currentSummary.averageBasket,previousSummary.averageBasket):null,
    marginChangePct:previousSummary.marginValue?pct(currentSummary.marginValue,previousSummary.marginValue):null,
    marginRateDelta:currentSummary.marginRate!=null&&previousSummary.marginRate!=null?round2(currentSummary.marginRate-previousSummary.marginRate):null,
    drivers:driverDecomposition(currentSummary,previousSummary)
  },
  margin:{status:marginStatus,available:publishMargin,basisCoveragePct:marginBasisCoveragePct,coveragePct:marginCoveragePct,salesBasis:marginSalesBases.length===1?marginSalesBases[0]:'MIXED',salesBasisField:marginSalesBasisFields.length===1?marginSalesBasisFields[0]:marginSalesBasisFields.join(',')||null,taxField:marginTaxFields.length===1?marginTaxFields[0]:marginTaxFields.join(',')||null,costKind:marginKinds.length===1?marginKinds[0]:'MIXED',method:marginMethods.length===1?marginMethods[0]:'MIXED',costField:marginFields.length===1?marginFields[0]:marginFields.join(',')||null,reason:publishMargin?null:marginReasons.join(',')||'TRANSACTION_MARGIN_NOT_VALIDATED',sanity:{min:sanityMin,max:sanityMax,ok:marginSanityOk},weightedConversions:marginResults.reduce((s,x)=>s+num(x?.margin?.weightedConversions),0),fallbackUnitCostLines:marginResults.reduce((s,x)=>s+num(x?.margin?.fallbackUnitCostLines),0),productMasterFallbackLines:marginResults.reduce((s,x)=>s+num(x?.margin?.productMasterFallbackLines),0),productMasterFallbackPct:round2(marginResults.reduce((s,x)=>s+num(x?.margin?.productMasterFallbackPct),0)/Math.max(1,marginResults.filter(x=>x?.margin?.productMasterFallbackPct!=null).length)),implausibleLines:marginResults.reduce((s,x)=>s+num(x?.margin?.implausibleLines),0),costCrossCheckPct:round2(marginResults.reduce((s,x)=>s+num(x?.margin?.costCrossCheckPct),0)/Math.max(1,marginResults.filter(x=>x?.margin?.costCrossCheckPct!=null).length)),message:publishMargin?'Marge brute calculée sur CA HT avec coût transactionnel validé.':'Marge masquée : base HT, coût ou contrôle métier non validé.'},
  daily:{current:publishedDailyCurrent,previous:publishedDailyPrevious},
  stores:publishedStores,
  products:publishedProducts,
  hierarchy:publishedHierarchy,
  contributors:{negativeProducts,positiveProducts,negativeStores:[...storesComparison].filter(x=>x.deltaSales<0).sort((a,b)=>a.deltaSales-b.deltaSales).slice(0,10),positiveStores:[...storesComparison].filter(x=>x.deltaSales>0).sort((a,b)=>b.deltaSales-a.deltaSales).slice(0,10)},
  cashiers:{status:cashiers.length?'READY':'UNAVAILABLE',items:cashiers,source:'SALES_RANGE_REUSE'},
  crm:{scope:'SELECTED_PERIOD_ONLY',identifiedCustomers:customers.length,identifiedSales:round2(identifiedSales),repeatCustomers,frequentCustomers,repeatRate:customers.length?round2(repeatCustomers/customers.length*100):null,averageVisitsPerCustomer:customers.length?round2(customers.reduce((s,x)=>s+num(x.tickets),0)/customers.length):null,cohorts,basketAnalysis,segments:Object.entries(customers.reduce((a,x)=>(a[x.segment]=(a[x.segment]||0)+1,a),{})).map(([segment,count])=>({segment,count,sharePct:customers.length?round2(count/customers.length*100):null})).sort((a,b)=>b.count-a.count),personas:Object.entries(customers.reduce((a,x)=>(a[x.persona]=(a[x.persona]||0)+1,a),{})).map(([persona,count])=>({persona,count,sharePct:customers.length?round2(count/customers.length*100):null})).sort((a,b)=>b.count-a.count),pricePreferences:Object.entries(customers.reduce((a,x)=>(a[x.pricePreference]=(a[x.pricePreference]||0)+1,a),{})).map(([preference,count])=>({preference,count,sharePct:customers.length?round2(count/customers.length*100):null})).sort((a,b)=>b.count-a.count),customerMergeRows:customers.slice(0,5000).map(x=>({customerAccount:x.customerAccount,sales:x.sales,units:x.units,tickets:x.tickets,activeDays:x.activeDays,firstDate:x.firstDate,lastDate:x.lastDate,storeCount:x.storeCount,distinctProducts:x.distinctProducts,favouriteWeekday:x.favouriteWeekday,favouriteHour:x.favouriteHour,pricePreference:x.pricePreference,priceMix:x.priceMix,topProducts:(x.topProducts||[]).slice(0,5)})),customers:customers.slice(0,750)},
  generatedAt:new Date().toISOString()
 }
}

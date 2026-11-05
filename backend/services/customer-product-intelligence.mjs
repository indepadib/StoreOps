import {customerNonreturn} from './customer-nonreturn.mjs';
import {habitCohort,pricingInterpretation,buildHabitIndex} from './analytics-action-intelligence.mjs';
import {createHash} from 'node:crypto';
const clean=v=>String(v??'').trim();
const round=v=>Number.isFinite(v)?Math.round(v*100)/100:null;
const rate=(a,b)=>b>0?round(a/b*100):null;
const change=(a,b)=>b>0?round((a-b)/b*100):null;
const anonymous=new Set(['','0','ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN']);

// Internal evidence only. The public report below never returns customer tokens.
export function basketEvidence(rows,fields,{storeId,amount}={}){
 const baskets=new Map();let rejectedIdentity=0;
 for(const row of rows){
  const sku=clean(row[fields.product]),tx=clean(row.transactionId),terminal=clean(row.terminalId);
  if(!sku||!tx||!terminal){rejectedIdentity++;continue}
  const key=JSON.stringify([row.dataAreaId,row.store,terminal,clean(row[fields.date]).slice(0,10),tx]);
  const customer=clean(row[fields.customer]),customerToken=anonymous.has(customer.toUpperCase())?null:createHash('sha256').update('storeops-customer-v1|'+customer).digest('hex');
  const b=baskets.get(key)||{key,storeId,date:clean(row[fields.date]).slice(0,10),customerToken,items:new Map()};
  if(b.customerToken!==customerToken)b.customerToken=null;
  const unit=clean(row[fields.salesUnit]||row.unit).toUpperCase(),itemKey=JSON.stringify([sku,unit]),item=b.items.get(itemKey)||{productNumber:sku,unit,sales:0,promotionSales:0,units:0,discountAmount:0,periodicDiscountAmount:0,offerIds:new Set()};
  item.discountAmount+=Math.abs(Number(row[fields.discount])||0);item.periodicDiscountAmount+=Math.abs(Number(row[fields.periodicDiscount])||0);if(row[fields.offer])item.offerIds.add(clean(row[fields.offer]));
  item.sales+=amount(row);if(Math.abs(Number(row[fields.periodicDiscount])||0)>0)item.promotionSales+=amount(row);item.units+=Math.abs(Number(row[fields.quantity])||0);b.items.set(itemKey,item);baskets.set(key,b);
 }
 return{storeId,rejectedIdentity,baskets:[...baskets.values()].map(b=>({...b,items:[...b.items.values()].map(i=>({...i,offerIds:[...i.offerIds]}))}))};
}
export function combineBasketEvidence(parts=[]){return{baskets:parts.flatMap(p=>p.baskets||[]),rejectedIdentity:parts.reduce((n,p)=>n+(p.rejectedIdentity||0),0)}}

export function customerReturnEvidence(previous,current){
 const returning=[...previous.keys()].filter(id=>current.has(id)),sum=(map,key)=>returning.reduce((n,id)=>n+map.get(id)[key],0),beforeSales=sum(previous,'sales'),afterSales=sum(current,'sales'),beforeTickets=sum(previous,'tickets'),afterTickets=sum(current,'tickets'),beforeBasket=beforeTickets?beforeSales/beforeTickets:null,afterBasket=afterTickets?afterSales/afterTickets:null,visitEffect=beforeBasket==null?null:(afterTickets-beforeTickets)*beforeBasket;
 const notObservedSales=[...previous].reduce((n,[id,c])=>n+(current.has(id)?0:c.sales),0),newlyObservedSales=[...current].reduce((n,[id,c])=>n+(previous.has(id)?0:c.sales),0);
 return{notObservedSales:round(notObservedSales),newlyObservedSales:round(newlyObservedSales),identifiedSalesDelta:round(afterSales-beforeSales+newlyObservedSales-notObservedSales),previous:previous.size,current:current.size,returning:returning.length,notObserved:previous.size-returning.length,newlyObserved:current.size-returning.length,returnRate:rate(returning.length,previous.size),beforeSales:round(beforeSales),afterSales:round(afterSales),beforeTickets,afterTickets,beforeBasket:round(beforeBasket??NaN),afterBasket:round(afterBasket??NaN),visitEffect:round(visitEffect??NaN),basketEffect:visitEffect==null?null:round(afterSales-beforeSales-visitEffect)};
}

export function customerOfferEvidence(previous,current,currentCustomers){
 const groups=new Map();let discountedTickets=0,linkedTickets=0;
 for(const [phase,evidence] of [['before',previous],['after',current]]){const seen=new Set();for(const b of evidence.baskets||[]){if(!b.key||seen.has(b.key))continue;seen.add(b.key);const discounted=b.items.filter(i=>i.periodicDiscountAmount>0);if(!discounted.length)continue;const codes=new Set(discounted.flatMap(i=>i.offerIds||[]).filter(Boolean));if(phase==='after'){discountedTickets++;if(codes.size)linkedTickets++;}for(const code of codes){const row=groups.get(code)||{code,beforeTickets:0,afterTickets:0,beforeClients:new Set(),afterClients:new Set()};row[phase+'Tickets']++;if(b.customerToken)row[phase+'Clients'].add(b.customerToken);groups.set(code,row);}}}
 const items=[...groups.values()].map(({beforeClients,afterClients,...r})=>({...r,beforeClients:beforeClients.size,afterClients:afterClients.size,beforeNotObserved:[...beforeClients].filter(id=>!currentCustomers.has(id)).length})).sort((a,b)=>b.afterTickets-a.afterTickets||b.beforeTickets-a.beforeTickets||a.code.localeCompare(b.code)).slice(0,20);
 return{discountedTickets,linkedTickets,coveragePct:rate(linkedTickets,discountedTickets),items};
}

function customerAbsenceEvidence(habits, previousEvidence, previous) {
 const storeByClient = new Map();
 for(const basket of previousEvidence.baskets || []) {
  if(!basket.customerToken) continue;
  const last = storeByClient.get(basket.customerToken);
  if(!last || basket.date > last.date) {
   storeByClient.set(basket.customerToken, {date:basket.date, stores:new Set([basket.storeId])});
  } else if(basket.date === last.date) {
   last.stores.add(basket.storeId);
  }
 }
 const stores = new Map(), products = new Map();
 let eligible = 0, overdue = 0, returned = 0, previousOverdueSales = 0;
 for(const [id, habit] of habits.previous) {
  if(new Set(habit.dates).size < 3 || !(habit.gap > 0)) continue;
  const cameBack = habits.current.has(id);
  eligible++;
  if(cameBack) returned++;
  if(habit.overdue) {
   overdue++;
   previousOverdueSales += previous.customers.get(id)?.sales || 0;
  }
  const lastStores = storeByClient.get(id)?.stores;
  const storeId = lastStores?.size === 1 ? [...lastStores][0] : null;
  const store = stores.get(storeId) || {storeId, eligible:0, overdue:0};
  store.eligible++;
  if(habit.overdue) store.overdue++;
  stores.set(storeId, store);
  if(!cameBack && !habit.overdue) continue;
  for(const [productNumber, count] of habit.articles) {
   if(count < 2 || count / habit.visits < .5) continue;
   const product = products.get(productNumber) || {productNumber, overdue:0, returned:0};
   product[cameBack?'returned':'overdue']++;
   products.set(productNumber, product);
  }
 }
 const candidates = eligible && overdue >= 5 && returned >= 5 ? [...products.values()]
  .filter(product => product.overdue >= 3 && product.overdue / overdue > product.returned / returned)
  .map(product => ({...product, overdueShare:rate(product.overdue,overdue), returnedShare:rate(product.returned,returned)}))
  .sort((a,b) => (b.overdueShare-b.returnedShare)-(a.overdueShare-a.returnedShare) || b.overdue-a.overdue)
  .slice(0,5) : [];
 return {eligible, overdue, returned, previousOverdueSales:round(previousOverdueSales), stores:[...stores.values()].sort((a,b)=>b.overdue-a.overdue), candidates};
}

function customerSalesBridge(previous, current, returning) {
 const identifiedSales = data => [...data.customers.values()].reduce((sum, customer) => sum + customer.sales, 0);
 const previousUnidentified = previous.sales - identifiedSales(previous);
 const currentUnidentified = current.sales - identifiedSales(current);
 const delta = round(current.sales - previous.sales);
 const drivers = [
  {kind:'returningVisits', amount:returning.visitEffect ?? 0},
  {kind:'returningBasket', amount:returning.basketEffect ?? 0},
  {kind:'newlyObserved', amount:returning.newlyObservedSales},
  {kind:'notObserved', amount:-returning.notObservedSales},
  {kind:'unidentified', amount:round(currentUnidentified - previousUnidentified)}
 ];
 const rounding = round(delta - drivers.reduce((sum, driver) => sum + driver.amount, 0));
 if(rounding) drivers.push({kind:'rounding', amount:rounding});
 return {
  previousSales: round(previous.sales),
  currentSales: round(current.sales),
  delta,
  drivers,
  stores: [...new Set([...previous.storeSales.keys(), ...current.storeSales.keys()])].map(storeId => {
   const before = previous.storeSales.get(storeId) || {sales:0, identifiedSales:0, tickets:0, identifiedTickets:0};
   const after = current.storeSales.get(storeId) || {sales:0, identifiedSales:0, tickets:0, identifiedTickets:0};
   const delta = after.sales - before.sales;
   const identifiedDelta = after.identifiedSales - before.identifiedSales;
   const previousBasket = before.tickets ? before.sales / before.tickets : null;
   const currentBasket = after.tickets ? after.sales / after.tickets : null;
   const trafficEffect = previousBasket!=null && currentBasket!=null ? round((after.tickets-before.tickets)*previousBasket) : null;
   const basketEffect = trafficEffect==null ? null : round(round(delta)-trafficEffect);
   const productChanges = [];
   for(const productNumber of new Set([...previous.products.keys(),...current.products.keys()])){
    const priorProduct = previous.products.get(productNumber)?.stores.get(storeId);
    const currentProduct = current.products.get(productNumber)?.stores.get(storeId);
    if(!priorProduct && !currentProduct) continue;
    const previousSales = round(priorProduct?.sales || 0), currentSales = round(currentProduct?.sales || 0);
    productChanges.push({productNumber, previousSales, currentSales, delta:round(currentSales-previousSales)});
   }
   const declines = productChanges.filter(product=>product.delta<0).sort((a,b)=>a.delta-b.delta).slice(0,5);
   return {storeId, previousSales:round(before.sales), currentSales:round(after.sales), delta:round(delta),
    identifiedDelta:round(identifiedDelta), unidentifiedDelta:round(delta-identifiedDelta),
    previousTickets:before.tickets, currentTickets:after.tickets, previousBasket:round(previousBasket), currentBasket:round(currentBasket),
    previousIdentification:rate(before.identifiedTickets,before.tickets), currentIdentification:rate(after.identifiedTickets,after.tickets),
    trafficEffect,basketEffect,declines};
  }).sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta))
 };
}

function summarize(evidence){
 const products=new Map(),customers=new Map(),pairs=new Map(),seen=new Set(),storeSales=new Map();let sales=0,tickets=0,identifiedTickets=0,oversizedAffinityBaskets=0,promotionSales=0,promotionTickets=0,discountAmount=0;
 for(const b of evidence.baskets||[]){
  if(seen.has(b.key))continue;seen.add(b.key);tickets++;
  const total=b.items.reduce((n,x)=>n+x.sales,0);sales+=total;
  const store = storeSales.get(b.storeId) || {sales:0, identifiedSales:0, tickets:0, identifiedTickets:0};
  store.sales += total;
  store.tickets++;
  if(b.customerToken){
   store.identifiedSales += total;
   store.identifiedTickets++;
  }
  storeSales.set(b.storeId, store);
  const promoted=b.items.filter(i=>i.periodicDiscountAmount>0);if(promoted.length)promotionTickets++;promotionSales+=promoted.reduce((n,i)=>n+(i.promotionSales||0),0);discountAmount+=b.items.reduce((n,i)=>n+(i.discountAmount||0),0);
  if(b.customerToken){identifiedTickets++;const c=customers.get(b.customerToken)||{sales:0,tickets:0,products:new Set()};c.sales+=total;c.tickets++;for(const i of b.items)c.products.add(i.productNumber);customers.set(b.customerToken,c)}
  const basketProducts=new Set(b.items.map(i=>i.productNumber));
  for(const sku of basketProducts){
   const p=products.get(sku)||{productNumber:sku,sales:0,promotionSales:0,discountAmount:0,tickets:0,basketSales:0,units:new Map(),customers:new Set(),daily:new Map(),stores:new Map()};
   p.tickets++;p.basketSales+=total;if(b.customerToken)p.customers.add(b.customerToken);
   const d=p.daily.get(b.date)||{date:b.date,sales:0,tickets:0,units:new Map()};d.tickets++;
   const st=p.stores.get(b.storeId)||{storeId:b.storeId,sales:0,tickets:0,basketSales:0};st.tickets++;st.basketSales+=total;
   for(const item of b.items.filter(i=>i.productNumber===sku)){p.sales+=item.sales;if(item.periodicDiscountAmount>0)p.promotionSales+=item.promotionSales||0;p.discountAmount+=item.discountAmount||0;d.sales+=item.sales;st.sales+=item.sales;p.units.set(item.unit,(p.units.get(item.unit)||0)+item.units);d.units.set(item.unit,(d.units.get(item.unit)||0)+item.units)}
   p.daily.set(b.date,d);p.stores.set(b.storeId,st);products.set(sku,p);
  }
  if(basketProducts.size>200){oversizedAffinityBaskets++;continue}
  const ids=[...basketProducts].sort();
  // No arbitrary top-N product cut: all items of each basket contribute.
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const key=JSON.stringify([ids[i],ids[j]]),p=pairs.get(key)||{productA:ids[i],productB:ids[j],tickets:0};p.tickets++;pairs.set(key,p)}
 }
 return{products,customers,pairs,storeSales,sales,tickets,identifiedTickets,oversizedAffinityBaskets,promotionSales,promotionTickets,discountAmount};
}
function measures(p,total){
 if(!p)return{sales:0,promotionSales:0,promotionSalesSharePct:null,discountAmount:0,tickets:0,penetrationPct:0,averageBasket:null,attachedBasketValue:null,unit:null,units:null,realizedUnitPrice:null};
 const unit=p.units.size===1?[...p.units.keys()][0]:null,units=unit?p.units.get(unit):null;
 return{sales:round(p.sales),promotionSales:round(p.promotionSales),promotionSalesSharePct:rate(p.promotionSales,p.sales),discountAmount:round(p.discountAmount),tickets:p.tickets,penetrationPct:rate(p.tickets,total.tickets),averageBasket:p.tickets?round(p.basketSales/p.tickets):null,attachedBasketValue:p.tickets?round((p.basketSales-p.sales)/p.tickets):null,unit:unit||null,units:units==null?null:round(units),realizedUnitPrice:units>0?round(p.sales/units):null};
}
export function compareBasketEvidence(currentEvidence,previousEvidence,{catalog=new Map(),minimumTickets=5,comparable=true,currentEndDate=null,includeNonreturn=false}={}){
 const cur=summarize(currentEvidence),prev=summarize(previousEvidence),products=[],habitIndex=buildHabitIndex(previousEvidence,currentEvidence,currentEndDate);
 for(const sku of new Set([...cur.products.keys(),...prev.products.keys()])){
  const c=cur.products.get(sku),p=prev.products.get(sku),current=measures(c,cur),previous=measures(p,prev),buyers=p?.customers||new Set();
  const repeated=[...buyers].filter(id=>c?.customers.has(id)),stoppedButReturned=[...buyers].filter(id=>cur.customers.has(id)&&!c?.customers.has(id)),notObserved=[...buyers].filter(id=>!cur.customers.has(id));
  const reliable=comparable&&current.tickets>=minimumTickets&&previous.tickets>=minimumTickets;
  const sameUnit=current.unit&&current.unit===previous.unit,priceChangePct=sameUnit?change(current.realizedUnitPrice,previous.realizedUnitPrice):null;
  const alternatives=new Map(),family=catalog.get(sku)?.hierarchy?.family?.id;
  for(const id of stoppedButReturned)for(const candidate of cur.customers.get(id).products){if(candidate===sku)continue;const sameFamily=family&&catalog.get(candidate)?.hierarchy?.family?.id===family;const alt=alternatives.get(candidate)||{productNumber:candidate,customers:0,sameFamily:!!sameFamily};alt.customers++;alternatives.set(candidate,alt)}
  const daily=[...[...(p?.daily.values()||[])].map(d=>({...d,phase:'previous'})),...[...(c?.daily.values()||[])].map(d=>({...d,phase:'current'}))].map(d=>{const u=d.units.size===1?[...d.units.keys()][0]:null,q=u?d.units.get(u):null;return{date:d.date,phase:d.phase,sales:round(d.sales),tickets:d.tickets,unit:u||null,units:q,realizedUnitPrice:q>0?round(d.sales/q):null}}).sort((a,b)=>a.date.localeCompare(b.date));
  const stores=[...new Set([...(c?.stores.keys()||[]),...(p?.stores.keys()||[])])].map(storeId=>{const a=c?.stores.get(storeId),b=p?.stores.get(storeId);return{storeId,sales:round(a?.sales||0),previousSales:round(b?.sales||0),tickets:a?.tickets||0,previousTickets:b?.tickets||0,averageBasket:a?.tickets?round(a.basketSales/a.tickets):null,previousAverageBasket:b?.tickets?round(b.basketSales/b.tickets):null}});
  const priceVolumeDecomposition=sameUnit&&current.units!=null&&previous.units!=null&&current.units>0&&previous.units>0?(()=>{const salesDelta=round(current.sales-previous.sales),priceEffect=round((current.sales/current.units-previous.sales/previous.units)*(current.units+previous.units)/2);return{priceEffect,volumeEffect:round(salesDelta-priceEffect),salesDelta}})():null;
  products.push({productNumber:sku,productName:catalog.get(sku)?.productName||null,current,previous,salesChangePct:change(current.sales,previous.sales),priceChangePct,volumeChangePct:sameUnit?change(current.units,previous.units):null,penetrationDeltaPoints:round(current.penetrationPct-previous.penetrationPct),basketChangePct:change(current.averageBasket,previous.averageBasket),priceVolumeDecomposition,quality:reliable?'SUFFICIENT_SAMPLE':'LIMITED_SAMPLE',signal:reliable&&priceChangePct>=10&&current.tickets<previous.tickets?'PRICE_UP_DEMAND_DOWN':reliable&&priceChangePct>=10?'PRICE_UP_MONITOR':reliable&&priceChangePct<=-10&&current.tickets>previous.tickets?'PRICE_DOWN_DEMAND_UP':reliable&&priceChangePct<=-10?'PRICE_DOWN_MONITOR':'MONITOR',cohort:{previousIdentifiedBuyers:buyers.size,repurchasedArticle:repeated.length,returnedWithoutArticle:stoppedButReturned.length,notObservedAgain:notObserved.length,repurchasePct:rate(repeated.length,buyers.size),notObservedPreviousSales:round(notObserved.reduce((n,id)=>n+(prev.customers.get(id)?.sales||0),0)),interpretation:'Non revu dans la période et le périmètre sélectionnés ; ne prouve pas une perte de client.'},alternatives:[...alternatives.values()].sort((a,b)=>Number(b.sameFamily)-Number(a.sameFamily)||b.customers-a.customers).slice(0,10),daily,stores});
 }
 const pairs=[...cur.pairs.values()].filter(p=>p.tickets>=3).map(p=>({...p,supportPct:rate(p.tickets,cur.tickets),lift:round(p.tickets*cur.tickets/(cur.products.get(p.productA).tickets*cur.products.get(p.productB).tickets))})).sort((a,b)=>b.tickets-a.tickets).slice(0,100);
 const customerReturn = customerReturnEvidence(prev.customers,cur.customers);
 return{status:currentEvidence.rejectedIdentity||previousEvidence.rejectedIdentity?'PARTIAL':'READY',summary:{customerReturn,...(includeNonreturn?{nonreturn:customerNonreturn(prev.customers,cur.customers,habitIndex,previousEvidence,products,minimumTickets)}:{}),customerAbsence:comparable&&!currentEvidence.rejectedIdentity&&!previousEvidence.rejectedIdentity?customerAbsenceEvidence(habitIndex,previousEvidence,prev):null,customerSalesBridge:customerSalesBridge(prev,cur,customerReturn),customerOffers:customerOfferEvidence(previousEvidence,currentEvidence,cur.customers),sales:round(cur.sales),promotionSales:round(cur.promotionSales),previousPromotionSales:round(prev.promotionSales),promotionTickets:cur.promotionTickets,previousPromotionTickets:prev.promotionTickets,promotionSalesSharePct:rate(cur.promotionSales,cur.sales),discountAmount:round(cur.discountAmount),previousSales:round(prev.sales),tickets:cur.tickets,previousTickets:prev.tickets,averageBasket:cur.tickets?round(cur.sales/cur.tickets):null,previousAverageBasket:prev.tickets?round(prev.sales/prev.tickets):null,identifiedTicketCoveragePct:rate(cur.identifiedTickets,cur.tickets),previousIdentifiedTicketCoveragePct:rate(prev.identifiedTickets,prev.tickets),identifiedCustomers:cur.customers.size,previousIdentifiedCustomers:prev.customers.size,previousCustomersNotObserved:[...prev.customers.keys()].filter(id=>!cur.customers.has(id)).length},signals:products.filter(p=>p.signal!=='MONITOR').sort((a,b)=>Math.abs(b.current.sales-b.previous.sales)-Math.abs(a.current.sales-a.previous.sales)),products:products.map(p=>({...p,regularCustomerHabit:habitCohort(previousEvidence,currentEvidence,p.productNumber,habitIndex),interpretation:pricingInterpretation(p)})).sort((a,b)=>b.current.sales-a.current.sales),affinities:pairs,quality:{comparable,minimumTickets,oversizedAffinityBaskets:cur.oversizedAffinityBaskets,rejectedIdentityRows:(currentEvidence.rejectedIdentity||0)+(previousEvidence.rejectedIdentity||0),causalClaim:false,priceBasis:'Prix TTC réalisé moyen : promotions et mix compris, pas le tarif catalogue.',limitations:['Association observée, pas une causalité prouvée.','Vérifier promotions, ruptures, saisonnalité et durée des fenêtres.','Analyse de retour client limitée aux tickets identifiés et au périmètre consulté.','Le CA antérieur des clients non revus ne doit pas être additionné entre articles.']}};
}

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

function summarize(evidence){
 const products=new Map(),customers=new Map(),pairs=new Map(),seen=new Set();let sales=0,tickets=0,identifiedTickets=0,oversizedAffinityBaskets=0,promotionSales=0,promotionTickets=0,discountAmount=0;
 for(const b of evidence.baskets||[]){
  if(seen.has(b.key))continue;seen.add(b.key);tickets++;
  const total=b.items.reduce((n,x)=>n+x.sales,0);sales+=total;const promoted=b.items.filter(i=>i.periodicDiscountAmount>0);if(promoted.length)promotionTickets++;promotionSales+=promoted.reduce((n,i)=>n+(i.promotionSales||0),0);discountAmount+=b.items.reduce((n,i)=>n+(i.discountAmount||0),0);
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
 return{products,customers,pairs,sales,tickets,identifiedTickets,oversizedAffinityBaskets,promotionSales,promotionTickets,discountAmount};
}
function measures(p,total){
 if(!p)return{sales:0,promotionSales:0,promotionSalesSharePct:null,discountAmount:0,tickets:0,penetrationPct:0,averageBasket:null,attachedBasketValue:null,unit:null,units:null,realizedUnitPrice:null};
 const unit=p.units.size===1?[...p.units.keys()][0]:null,units=unit?p.units.get(unit):null;
 return{sales:round(p.sales),promotionSales:round(p.promotionSales),promotionSalesSharePct:rate(p.promotionSales,p.sales),discountAmount:round(p.discountAmount),tickets:p.tickets,penetrationPct:rate(p.tickets,total.tickets),averageBasket:p.tickets?round(p.basketSales/p.tickets):null,attachedBasketValue:p.tickets?round((p.basketSales-p.sales)/p.tickets):null,unit:unit||null,units:units==null?null:round(units),realizedUnitPrice:units>0?round(p.sales/units):null};
}
export function compareBasketEvidence(currentEvidence,previousEvidence,{catalog=new Map(),minimumTickets=5,comparable=true,currentEndDate=null}={}){
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
  const priceVolumeDecomposition=sameUnit&&current.units!=null&&previous.units!=null&&current.units>0&&previous.units>0?{priceEffect:round((current.sales/current.units-previous.sales/previous.units)*(current.units+previous.units)/2),volumeEffect:round((current.units-previous.units)*(current.sales/current.units+previous.sales/previous.units)/2),salesDelta:round(current.sales-previous.sales)}:null;
  products.push({productNumber:sku,productName:catalog.get(sku)?.productName||null,current,previous,salesChangePct:change(current.sales,previous.sales),priceChangePct,volumeChangePct:sameUnit?change(current.units,previous.units):null,penetrationDeltaPoints:round(current.penetrationPct-previous.penetrationPct),basketChangePct:change(current.averageBasket,previous.averageBasket),priceVolumeDecomposition,quality:reliable?'SUFFICIENT_SAMPLE':'LIMITED_SAMPLE',signal:reliable&&priceChangePct>=10&&current.tickets<previous.tickets?'PRICE_UP_DEMAND_DOWN':reliable&&priceChangePct>=10?'PRICE_UP_MONITOR':reliable&&priceChangePct<=-10&&current.tickets>previous.tickets?'PRICE_DOWN_DEMAND_UP':reliable&&priceChangePct<=-10?'PRICE_DOWN_MONITOR':'MONITOR',cohort:{previousIdentifiedBuyers:buyers.size,repurchasedArticle:repeated.length,returnedWithoutArticle:stoppedButReturned.length,notObservedAgain:notObserved.length,repurchasePct:rate(repeated.length,buyers.size),notObservedPreviousSales:round(notObserved.reduce((n,id)=>n+(prev.customers.get(id)?.sales||0),0)),interpretation:'Non revu dans la période et le périmètre sélectionnés ; ne prouve pas une perte de client.'},alternatives:[...alternatives.values()].sort((a,b)=>Number(b.sameFamily)-Number(a.sameFamily)||b.customers-a.customers).slice(0,10),daily,stores});
 }
 const pairs=[...cur.pairs.values()].filter(p=>p.tickets>=3).map(p=>({...p,supportPct:rate(p.tickets,cur.tickets),lift:round(p.tickets*cur.tickets/(cur.products.get(p.productA).tickets*cur.products.get(p.productB).tickets))})).sort((a,b)=>b.tickets-a.tickets).slice(0,100);
 return{status:currentEvidence.rejectedIdentity||previousEvidence.rejectedIdentity?'PARTIAL':'READY',summary:{sales:round(cur.sales),promotionSales:round(cur.promotionSales),previousPromotionSales:round(prev.promotionSales),promotionTickets:cur.promotionTickets,previousPromotionTickets:prev.promotionTickets,promotionSalesSharePct:rate(cur.promotionSales,cur.sales),discountAmount:round(cur.discountAmount),previousSales:round(prev.sales),tickets:cur.tickets,previousTickets:prev.tickets,averageBasket:cur.tickets?round(cur.sales/cur.tickets):null,previousAverageBasket:prev.tickets?round(prev.sales/prev.tickets):null,identifiedTicketCoveragePct:rate(cur.identifiedTickets,cur.tickets),previousIdentifiedTicketCoveragePct:rate(prev.identifiedTickets,prev.tickets),identifiedCustomers:cur.customers.size,previousIdentifiedCustomers:prev.customers.size,previousCustomersNotObserved:[...prev.customers.keys()].filter(id=>!cur.customers.has(id)).length},signals:products.filter(p=>p.signal!=='MONITOR').sort((a,b)=>Math.abs(b.current.sales-b.previous.sales)-Math.abs(a.current.sales-a.previous.sales)),products:products.map(p=>({...p,regularCustomerHabit:habitCohort(previousEvidence,currentEvidence,p.productNumber,habitIndex),interpretation:pricingInterpretation(p)})).sort((a,b)=>b.current.sales-a.current.sales),affinities:pairs,quality:{comparable,minimumTickets,oversizedAffinityBaskets:cur.oversizedAffinityBaskets,rejectedIdentityRows:(currentEvidence.rejectedIdentity||0)+(previousEvidence.rejectedIdentity||0),causalClaim:false,priceBasis:'Prix TTC réalisé moyen : promotions et mix compris, pas le tarif catalogue.',limitations:['Association observée, pas une causalité prouvée.','Vérifier promotions, ruptures, saisonnalité et durée des fenêtres.','Analyse de retour client limitée aux tickets identifiés et au périmètre consulté.','Le CA antérieur des clients non revus ne doit pas être additionné entre articles.']}};
}

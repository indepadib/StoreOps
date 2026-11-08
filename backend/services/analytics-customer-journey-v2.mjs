// Second-generation customer journey model. Never return raw customer keys.
// Observations are noncausal and limited to the requested comparable windows.
const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const rnd=v=>num(v)==null?null:Math.round((Number(v)+Number.EPSILON)*100)/100;
const pct=(a,b)=>b>0?rnd(a/b*100):null;
const change=(a,b)=>b>0?rnd((a-b)/b*100):null;
const clean=v=>String(v??'').trim();
const days=(a,b)=>a&&b&&b>=a?Math.round((Date.parse(b)-Date.parse(a))/86400000)+1:null;
const name=(id,dict)=>dict?.[id]||id;
function summarize(evidence,stores){
 const clients=new Map(),products=new Map(),seen=new Set();
 let tickets=0,identified=0,promotionTickets=0,ignored=Number(evidence?.rejectedIdentity||0);
 for(const b of evidence?.baskets||[]){
  if(!b?.key||!b.date||!stores.has(b.storeId)){ignored++;continue}
  if(seen.has(b.key))continue;seen.add(b.key);tickets++;
  const items=(b.items||[]).filter(i=>i.productNumber),sales=items.reduce((a,i)=>a+(num(i.sales)||0),0),promotion=items.some(i=>(num(i.periodicDiscountAmount)||0)>0);
  if(promotion)promotionTickets++;
  if(b.customerToken){
   identified++;
   const c=clients.get(b.customerToken)||{visits:[],skus:new Set(),items:new Map(),sales:0,promotionVisits:0};
   const entry={date:b.date,storeId:b.storeId,sales:rnd(sales),promotion,items:items.map(i=>({productNumber:clean(i.productNumber),sales:rnd(i.sales)||0,unit:clean(i.unit)||null,promotion:(num(i.periodicDiscountAmount)||0)>0}))};
   c.visits.push(entry);c.sales+=sales;if(promotion)c.promotionVisits++;
   for(const i of items){const id=clean(i.productNumber);c.skus.add(id);
    c.items.set(id,(c.items.get(id)||0)+1)}
   clients.set(b.customerToken,c)
  }
  for(const i of items){
   const id=clean(i.productNumber),unit=clean(i.unit)||'UNKNOWN',p=products.get(id)||{sales:0,units:new Map(),tickets:new Set(),clients:new Set(),promotionTickets:new Set()};
   p.sales+=(num(i.sales)||0);p.units.set(unit,(p.units.get(unit)||0)+(num(i.units)||0));p.tickets.add(b.key);
   if(b.customerToken)p.clients.add(b.customerToken);
   if((num(i.periodicDiscountAmount)||0)>0)p.promotionTickets.add(b.key);
   products.set(id,p)
  }
 }
 for(const c of clients.values())c.visits.sort((a,b)=>a.date.localeCompare(b.date));
 return{clients,products,tickets,identified,promotionTickets,ignored}
}
function skuMeasures(v){
 if(!v)return{tickets:0,clients:0,sales:0,unit:null,price:null,promotionPct:null};
 const u=[...v.units].filter(x=>x[1]>0),single=u.length===1&&u[0][0]!=='UNKNOWN';
 return{tickets:v.tickets.size,clients:v.clients.size,sales:rnd(v.sales),unit:single?u[0][0]:null,
 price:single&&u[0][1]>0?rnd(v.sales/u[0][1]):null,promotionPct:pct(v.promotionTickets.size,v.tickets.size)}
}
function metricsForReturning(before,after){
 const same=[...before.clients].filter(([id])=>after.clients.has(id)),s={returned:same.length,visitsBefore:0,visitsAfter:0,
  spendBefore:0,spendAfter:0,basketDown:0,basketUp:0,frequencyDown:0,frequencyUp:0,
  ceasedAtLeastOneProduct:0,boughtNewProduct:0,
  promotionBefore:0,promotionAfter:0,previousPromoNoLongerUsed:0};
 const paths=[];
 for(const [id,b] of same){
  const a=after.clients.get(id),mb=b.sales/b.visits.length,ma=a.sales/a.visits.length,
   gone=[...b.skus].filter(sku=>!a.skus.has(sku)),newSku=[...a.skus].filter(sku=>!b.skus.has(sku));
  s.visitsBefore+=b.visits.length;s.visitsAfter+=a.visits.length;s.spendBefore+=b.sales;s.spendAfter+=a.sales;
  if(ma<mb*.9)s.basketDown++;else if(ma>mb*1.1)s.basketUp++;
  if(a.visits.length<b.visits.length)s.frequencyDown++;else if(a.visits.length>b.visits.length)s.frequencyUp++;
  if(gone.length)s.ceasedAtLeastOneProduct++;if(newSku.length)s.boughtNewProduct++;
  if(b.promotionVisits)s.promotionBefore++;if(a.promotionVisits)s.promotionAfter++;
  if(b.promotionVisits&&!a.promotionVisits)s.previousPromoNoLongerUsed++;
  paths.push({id,b,a,gone,newSku,score:gone.length*2+Math.max(0,b.visits.length-a.visits.length)*5});
 }
 s.averageBasketBefore=s.visitsBefore?rnd(s.spendBefore/s.visitsBefore):null;
 s.averageBasketAfter=s.visitsAfter?rnd(s.spendAfter/s.visitsAfter):null;
 s.averageBasketChangePct=change(s.averageBasketAfter,s.averageBasketBefore);
 s.spendBefore=rnd(s.spendBefore);s.spendAfter=rnd(s.spendAfter);
 return{summary:s,paths}
}
function productTransitions(before,after,names){
 const rows=[];
 for(const id of new Set([...before.products.keys(),...after.products.keys()])){
  const b=skuMeasures(before.products.get(id)),a=skuMeasures(after.products.get(id)),
   old=before.products.get(id)?.clients||new Set(),
   returning=[...old].filter(k=>after.clients.has(k)),drop=returning.filter(k=>!after.clients.get(k).skus.has(id)),
   comparisons=new Map();
  for(const k of drop){
   const previous=before.clients.get(k),current=after.clients.get(k);
   for(const sku of current.skus){if(sku===id||previous.skus.has(sku))continue;
    comparisons.set(sku,(comparisons.get(sku)||0)+1)}
  }
  const compatible=!!(a.unit&&a.unit===b.unit&&a.price>0&&b.price>0);
  const priceChangePct=compatible?change(a.price,b.price):null;
  rows.push({productNumber:id,productName:name(id,names),previous:b,current:a,priceChangePct,
   articleTicketChangePct:change(a.tickets,b.tickets),previousCustomerReachPct:pct(b.clients,before.clients.size),
   returnedStoreAmongPriorBuyers:returning.length,returnedButStoppedBuying:drop.length,
   notObservedAmongPriorBuyers:old.size-returning.length,
   stoppedBuyingAmongReturnersPct:pct(drop.length,returning.length),
   newProductsBoughtInstead:[...comparisons].map(([productNumber,clients])=>({productNumber,productName:name(productNumber,names),clients}))
    .sort((x,y)=>y.clients-x.clients||x.productNumber.localeCompare(y.productNumber)).slice(0,4),
   priceEvidence:compatible&&b.tickets>=10&&a.tickets>=10?'SAMPLE_COMPARABLE':'INSUFFICIENT_OR_UOM_MISMATCH',
   reviewPriority:rnd((Math.min(b.clients,100)+Math.max(priceChangePct||0,0)*.4+Math.max(0,drop.length)*2)),
   replacementIsConfirmed:false})
 }
 const sorted=(v,metric)=>v.sort((a,b)=>(b[metric]??0)-(a[metric]??0)||a.productNumber.localeCompare(b.productNumber)).slice(0,15);
 return{articlesAnalyzed:rows.length,namedArticles:rows.filter(x=>x.productName!==x.productNumber).length,
  priceIncreases:sorted(rows.filter(x=>x.priceEvidence==='SAMPLE_COMPARABLE'&&x.priceChangePct>=5),'reviewPriority'),
  stoppedPurchases:sorted(rows.filter(x=>x.returnedButStoppedBuying>=3),'returnedButStoppedBuying'),
  disappearedFromCustomers:sorted(rows.filter(x=>x.notObservedAmongPriorBuyers>=3),'notObservedAmongPriorBuyers'),
  customerReachLeaders:sorted(rows.filter(x=>x.previous.clients>=5),'previousCustomerReachPct'),
  allSkusRanked:true,priceCausalImpact:null}
}
function cohorts(before,after){
 return[
  ['ONE_VISIT','Une visite dans la première fenêtre',x=>x.visits.length===1],
  ['TWO_VISITS','Deux visites',x=>x.visits.length===2],
  ['REGULAR','Au moins trois visites',x=>x.visits.length>=3],
  ['PROMO_EXPOSED','Clients ayant bénéficié d’une promotion',x=>x.promotionVisits>0],
  ['NO_PROMO','Clients sans promotion observée',x=>x.promotionVisits===0]
 ].map(([id,label,filter])=>{
  const b=[...before.clients].filter(([,v])=>filter(v)),returned=b.filter(([k])=>after.clients.has(k));
  return{id,label,previous:b.length,returned:returned.length,notObserved:b.length-returned.length,
   returnRatePct:pct(returned.length,b.length),
   previousSalesOfNotObserved:rnd(b.filter(([k])=>!after.clients.has(k)).reduce((s,[,v])=>s+v.sales,0)),
   lostRevenueNotEstablished:true}
 })
}
function journeyCases(paths,names){
 // Selected for diagnostic contrast, not a representative sample.
 return [...paths].filter(x=>x.b.visits.length>=2).sort((a,b)=>b.score-a.score).slice(0,5).map((p,i)=>{
  const tickets=c=>c.visits.slice(-3).map(t=>({date:t.date,storeId:t.storeId,amount:t.sales,promotion:t.promotion,
   articles:t.items.slice(0,10).map(x=>({productName:name(x.productNumber,names),productNumber:x.productNumber,sales:x.sales,promotion:x.promotion}))}));
  return{label:'Parcours anonymisé '+(i+1),sampling:'DIAGNOSTIC_NON_REPRESENTATIF',
   visitsBefore:p.b.visits.length,visitsAfter:p.a.visits.length,
   salesBefore:rnd(p.b.sales),salesAfter:rnd(p.a.sales),
   oldProductsNoLongerPurchased:p.gone.slice(0,8).map(id=>name(id,names)),
   newProducts:p.newSku.slice(0,8).map(id=>name(id,names)),
   beforeTickets:tickets(p.b),afterTickets:tickets(p.a)}
 })
}
function conclusions(before,after,moves,shifts,cohortsList){
 const total=before.clients.size,nonreturn=total-shifts.summary.returned;
 const one=cohortsList.find(x=>x.id==='ONE_VISIT'),promo=cohortsList.find(x=>x.id==='PROMO_EXPOSED'),noPromo=cohortsList.find(x=>x.id==='NO_PROMO');
 return [
  {id:'OBSERVED_RETURN',severity:'HIGH',title:'Non-retour dans les fenêtres sélectionnées',value:pct(nonreturn,total),
   unit:'%',text:String(nonreturn)+' clients non revus parmi '+String(total)+' clients identifiés avant. Ils ne sont pas nécessairement définitivement perdus.',
   next:'Comparer la rétention des primo-observés et habitués, à durée comparable.'},
  {id:'SAME_CUSTOMERS',severity:'HIGH',title:'Modification du panier chez les mêmes clients',
   value:shifts.summary.averageBasketChangePct,unit:'%',
   text:String(shifts.summary.basketDown)+' anciens clients ont un panier moyen en baisse de plus de 10 % ; '+String(shifts.summary.ceasedAtLeastOneProduct)+' ne rachètent plus au moins une de leurs anciennes références.',
   next:'Consulter les articles abandonnés et les parcours anonymisés avant/après.'},
  {id:'FIRST_REPEAT',severity:'HIGH',title:'Une visite ne signifie pas automatiquement un nouveau client',
   value:one?.returnRatePct??null,unit:'%',
   text:String(one?.previous||0)+' clients n’ont qu’une visite dans la première fenêtre. Sans historique depuis l’ouverture, impossible de certifier qu’il s’agit de leur premier passage.',
   next:'Construire la courbe de deuxième achat à 7, 30, 60 et 90 jours sur des cohortes réellement nouvelles.'},
  {id:'PRICE',severity:'MEDIUM',title:'Prix réalisés en hausse et articles prioritaires',
   value:moves.priceIncreases.length,unit:'références',
   text:'La liste de vigilance explore toutes les références vendues. Une hausse du prix réalisé peut refléter un changement de remise ; elle n’est pas un changement du tarif officiel certifié.',
   next:'Vérifier prix catalogue datés, promotions, stock historique et évolution des visites après changement.'},
  {id:'PROMOTIONS',severity:'MEDIUM',title:'Exposition aux promotions et retours',value:promo?.returnRatePct??null,unit:'%',
   text:'Retour des clients exposés à une promo : '+String(promo?.returnRatePct??'N/D')+' % ; autres : '+String(noPromo?.returnRatePct??'N/D')+' %. Les groupes ne sont pas équivalents.',
   next:'Comparer des clients de fréquence et panier antérieurs similaires avant de parler d’effet promotion.'}
 ]
}
export function buildCustomerJourneyEvidence({previousEvidence,currentEvidence,productNames={},storeIds=[],period={},comparison={}}={}){
 const allowed=new Set(storeIds),before=summarize(previousEvidence,allowed),after=summarize(currentEvidence,allowed);
 const shifts=metricsForReturning(before,after),products=productTransitions(before,after,productNames);
 const cohortsList=cohorts(before,after);
 return{version:'CUSTOMER_JOURNEY_V2',causal:false,
  coverage:{stores:[...allowed],period,comparison,daysBefore:days(comparison.start,comparison.end),daysAfter:days(period.start,period.end),
   comparable:days(comparison.start,comparison.end)===days(period.start,period.end),
   previousTickets:before.tickets,currentTickets:after.tickets,previousIdentifiedTickets:before.identified,
   currentIdentifiedTickets:after.identified,previousCustomerCount:before.clients.size,currentCustomerCount:after.clients.size,
   identificationBeforePct:pct(before.identified,before.tickets),identificationAfterPct:pct(after.identified,after.tickets),
   rejectedRows:before.ignored+after.ignored,productNameCoveragePct:pct(products.namedArticles,products.articlesAnalyzed),
   trueHistorySinceOpening:false,stockHistoryJoined:false,officialPriceChangeDatesJoined:false},
  evolution:{observedPrior:before.clients.size,observedCurrent:after.clients.size,returned:shifts.summary.returned,
   nonObserved:before.clients.size-shifts.summary.returned,returnRatePct:pct(shifts.summary.returned,before.clients.size),
   newlyObserved:[...after.clients.keys()].filter(k=>!before.clients.has(k)).length},
  cohorts:cohortsList,returning:shifts.summary,products,journeys:journeyCases(shifts.paths,productNames),
  insights:conclusions(before,after,products,shifts,cohortsList),
  limitations:['Une absence de retour dans cette fenêtre ne prouve pas une perte définitive.',
   'Prix TTC réalisés = panier et remises, pas preuve d’une hausse du tarif officiel.',
   'Les substitutions proposées sont des achats nouveaux concomitants, pas des substitutions avérées.',
   'Les histoires client sont des cas diagnostiques non représentatifs et ne révèlent aucun identifiant.',
   'On ne peut attribuer une part de clients perdus aux prix, promotions ou ruptures sans historique cohérent et stratégie de comparaison.',
   'L’historique de stocks horodaté et la vraie première adhésion sont requis pour conclure aux causes.']}
}

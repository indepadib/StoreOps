// Evidence-only customer retention and pricing research.
// Transient customer tokens remain in local maps and NEVER leave this module.
// Observational comparisons must not be labelled causal price effects.
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const round=x=>num(x)==null?null:Math.round((Number(x)+Number.EPSILON)*100)/100;
const rate=(x,n)=>n>0?round(x/n*100):null;
const percentChange=(a,b)=>num(a)!=null&&num(b)>0?round((a-b)/b*100):null;
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const groups=Object.freeze([
 {id:'JUICE_ORANGE',label:"Jus d’orange",tokens:[/\bjus\b.*\borange\b/,/\borange\b.*\bjus\b/]},
 {id:'CHICKEN',label:'Poulet',tokens:[/\bpoulet\b/,/\bchicken\b/],exclude:/\b(bouillon|assaisonnement|epice|arome|saveur|sauce|flavour|flavor)\b/}
]);
const missing='NON_MESURE';
function scopeProducts(names,observed){
 const seen=new Map();
 for(const [sku,label] of Object.entries(names||{})){
  const text=normalize(label);for(const group of groups){
   if(group.tokens.some(r=>r.test(text))&&!(group.exclude?.test(text)))seen.set(sku,{sku,label,group:group.id});
  }
 }
 for(const [sku,v] of Object.entries(observed||{}))if(!seen.has(sku)&&v?.label){const text=normalize(v.label);for(const group of groups)if(group.tokens.some(r=>r.test(text))&&!(group.exclude?.test(text)))seen.set(sku,{sku,label:v.label,group:group.id})}
 return [...seen.values()].sort((a,b)=>a.group.localeCompare(b.group)||a.label.localeCompare(b.label));
}
function index(evidence,allowedStores){
 const tickets=new Map(),customers=new Map(),products=new Map(),days=new Set();
 let rejected=Number(evidence?.rejectedIdentity||0);
 for(const b of evidence?.baskets||[]){
  if(!b.key||!b.date||!allowedStores.has(b.storeId)){rejected++;continue}
  if(tickets.has(b.key))continue;
  tickets.set(b.key,b);days.add(b.date);
  if(b.customerToken){
   const c=customers.get(b.customerToken)||{visits:0,stores:new Set(),sku:new Set(),promoTickets:0,sales:0,dates:new Set()};
   c.visits++;c.stores.add(b.storeId);c.dates.add(b.date);c.sales+=(b.items||[]).reduce((n,i)=>n+(num(i.sales)||0),0);
   if((b.items||[]).some(i=>num(i.periodicDiscountAmount)>0))c.promoTickets++;
   for(const i of b.items||[])if(i.productNumber)c.sku.add(i.productNumber);
   customers.set(b.customerToken,c)
  }
  for(const item of b.items||[]){
   if(!item.productNumber)continue;
   const p=products.get(item.productNumber)||{tickets:new Set(),customers:new Set(),units:new Map(),sales:0,remised:0,promoTickets:new Set()};
   p.tickets.add(b.key);if(b.customerToken)p.customers.add(b.customerToken);
   const unit=String(item.unit||'').toUpperCase()||'UNKNOWN';
   p.units.set(unit,(p.units.get(unit)||0)+(num(item.units)||0));
   p.sales+=(num(item.sales)||0);p.remised+=(num(item.discountAmount)||0);
   if((num(item.periodicDiscountAmount)||0)>0)p.promoTickets.add(b.key);
   products.set(item.productNumber,p)
  }
 }
 const identifiedTickets=[...tickets.values()].filter(b=>!!b.customerToken).length;
 return{tickets,customers,products,days,rejected,identifiedTickets,
  sales:[...tickets.values()].reduce((n,b)=>n+(b.items||[]).reduce((x,i)=>x+(num(i.sales)||0),0),0)};
}
const obs=(p)=>{if(!p)return{tickets:0,buyers:0,unit:null,quantity:null,realizedPrice:null,promotionTickets:0,sales:0};
 const units=[...p.units].filter(([,v])=>v>0),single=units.length===1&&units[0][0]!=='UNKNOWN';
 return{tickets:p.tickets.size,buyers:p.customers.size,unit:single?units[0][0]:null,quantity:single?round(units[0][1]):null,
  realizedPrice:single&&units[0][1]>0?round(p.sales/units[0][1]):null,promotionTickets:p.promoTickets.size,sales:round(p.sales)};
};
const segment=c=>c.visits===1?'ONE_VISIT':c.visits===2?'TWO_VISITS':'THREE_PLUS';
const weightedDiff=(exposed,controls,next)=>{
 const e=[...exposed].filter(id=>next.has(id)),c=[...controls].filter(id=>next.has(id));
 void e;void c;
 const nE=exposed.size,nC=controls.size;
 if(nE<10||nC<10)return{status:'INSUFFICIENT_SAMPLE',exposed:nE,control:nC,deltaPoints:null,ci95:null};
 const pE=[...exposed].filter(id=>next.has(id)).length/nE,pC=[...controls].filter(id=>next.has(id)).length/nC;
 const delta=(pE-pC)*100,se=Math.sqrt(pE*(1-pE)/nE+pC*(1-pC)/nC)*100;
 return{status:'OBSERVATIONAL',exposed:nE,control:nC,exposedReturnRate:round(pE*100),
 controlReturnRate:round(pC*100),deltaPoints:round(delta),ci95:[round(delta-1.96*se),round(delta+1.96*se)]};
};
function perProduct(p,prev,cur){
 const before=obs(prev.products.get(p.sku)),after=obs(cur.products.get(p.sku));
 const comparable=before.unit&&before.unit===after.unit&&before.realizedPrice>0&&after.realizedPrice>0&&before.tickets>=10&&after.tickets>=10&&prev.rejected===0&&cur.rejected===0;
 const priceChangePct=comparable?percentChange(after.realizedPrice,before.realizedPrice):null;
 const exposed=prev.products.get(p.sku)?.customers||new Set(),control=new Set([...prev.customers.keys()].filter(id=>!exposed.has(id)));
 const all=weightedDiff(exposed,control,cur.customers);
 const buckets={};
 for(const s of ['ONE_VISIT','TWO_VISITS','THREE_PLUS']){
  const a=new Set([...exposed].filter(id=>segment(prev.customers.get(id))===s));
  const b=new Set([...control].filter(id=>segment(prev.customers.get(id))===s));
  buckets[s]=weightedDiff(a,b,cur.customers);
 }
 const previousBuyerReturned=[...exposed].filter(id=>cur.customers.has(id));
 const returnedWithout=previousBuyerReturned.filter(id=>!cur.products.get(p.sku)?.customers.has(id)).length;
 return{
  productNumber:p.sku,productName:p.label,group:p.group,
  previous:before,current:after,priceChangePct,
  priceObservation:priceChangePct==null?'NOT_COMPARABLE':priceChangePct>=5?'INCREASE_OBSERVED':priceChangePct<=-5?'DECREASE_OBSERVED':'NO_MATERIAL_CHANGE',
  salesChangePct:percentChange(after.sales,before.sales),ticketChangePct:percentChange(after.tickets,before.tickets),
  exposedPreviousBuyers:exposed.size,returnedToStore:previousBuyerReturned.length,returnedWithoutArticle:returnedWithout,
  notSeenAgain:exposed.size-previousBuyerReturned.length,control:all,frequencyAdjusted:buckets,
  signal:priceChangePct>=5&&all.status==='OBSERVATIONAL'&&all.deltaPoints<0?'PRICE_UP_LOWER_RETURN_ASSOCIATION':
   priceChangePct>=5?'PRICE_INCREASE_UNCONFIRMED_RETENTION':'NO_CONSISTENT_PRICE_UP_SIGNAL',
  warnings:[
   'Le prix TTC réalisé comprend les remises et variations de mix. Il ne prouve pas une modification du tarif de base.',
   'Le groupe témoin regroupe les autres acheteurs identifiés ; ses motivations et sa composition peuvent différer.',
   'Aucun stock historique quotidien ni prix concurrent n’est ici certifié.'
  ]
 }
}
export function buildCustomerRetentionResearch({currentEvidence,previousEvidence,productNames={},storeIds=[],period,comparison,historyIsComplete=false}={}){
 const stores=new Set(storeIds),cur=index(currentEvidence,stores),prev=index(previousEvidence,stores);
 const previousCustomers=[...prev.customers],currentCustomers=cur.customers;
 const returning=previousCustomers.filter(([id])=>currentCustomers.has(id)),nonreturning=previousCustomers.filter(([id])=>!currentCustomers.has(id));
 const newObserved=[...currentCustomers].filter(([id])=>!prev.customers.has(id));
 const oneVisit=previousCustomers.filter(([,c])=>c.visits===1),oneNotSeen=oneVisit.filter(([id])=>!currentCustomers.has(id));
 const repeat=previousCustomers.filter(([,c])=>c.visits>=2),repeatNotSeen=repeat.filter(([id])=>!currentCustomers.has(id));
 const scopedProducts=scopeProducts(productNames),skuResults=scopedProducts.map(p=>perProduct(p,prev,cur))
  .filter(r=>r.previous.tickets||r.current.tickets)
  .sort((a,b)=>b.previous.tickets-a.previous.tickets);
 const exposedUnion=new Set(skuResults.filter(p=>p.priceObservation==='INCREASE_OBSERVED').flatMap(p=>{
  return [...(prev.products.get(p.productNumber)?.customers||[])];
 }));
 const missingExposed=nonreturning.filter(([id])=>exposedUnion.has(id)).length;
 const allProductBuyersUnion=new Set(skuResults.flatMap(p=>[...(prev.products.get(p.productNumber)?.customers||[])]));
 const diagnosis=[
  {id:'PRICE',label:'Prix réalisé plus élevé',state:skuResults.some(p=>p.signal==='PRICE_UP_LOWER_RETURN_ASSOCIATION')?'OBSERVATIONAL_SIGNAL':'NOT_DEMONSTRATED',
   evidence:'Comparer le retour des acheteurs exposés à des clients non exposés, par fréquence initiale. Prix moyen ≠ changement tarifaire.'},
  {id:'FIRST_VISIT',label:'Clients observés une seule fois',state:oneVisit.length?'MEASURED':'INSUFFICIENT_DATA',
   evidence:'La notion une seule fois porte sur la fenêtre analysée, pas nécessairement depuis la première visite en magasin.'},
  {id:'PRODUCT_ABANDON',label:'Clients qui reviennent sans leur article',state:skuResults.some(p=>p.returnedWithoutArticle>0)?'OBSERVED':'NOT_OBSERVED',
   evidence:'Certains reviennent au magasin mais pas sur cet article ; l’abandon du produit ne prouve pas une perte du client.'},
  {id:'STOCKOUT',label:'Ruptures historiques',state:'SOURCE_REQUIRED',evidence:'Il faut des stocks horodatés par magasin et article pendant les dates étudiées. Le stock actuel ne suffit pas.'},
  {id:'ASSORTMENT',label:'Offre et assortiment',state:'HYPOTHESIS',evidence:'La disparition des ventes d’une référence ne prouve pas son retrait de rayon. Croiser assortiment, détention et catalogue historisés.'},
  {id:'PROMOTION',label:'Pression promotionnelle',state:'DESCRIPTIVE',evidence:'Comparer les tickets avec remise et les clients revus ; aucune incrémentalité/causalité démontrée.'},
  {id:'SERVICE',label:'Expérience magasin',state:'SOURCE_REQUIRED',evidence:'Réclamations, files d’attente, NPS/CSAT, visites mystère et anomalies terrain à joindre.'}
 ];
 return {
  status:cur.rejected||prev.rejected?'PARTIAL':'READY',source:'D365 tickets identifiés',period,comparison,
  coverage:{storeIds:[...stores],currentTickets:cur.tickets.size,previousTickets:prev.tickets.size,
   currentIdentifiedTickets:cur.identifiedTickets,previousIdentifiedTickets:prev.identifiedTickets,
   currentIdentificationRate:rate(cur.identifiedTickets,cur.tickets.size),
   previousIdentificationRate:rate(prev.identifiedTickets,prev.tickets.size),
   rejectedIdentityRows:cur.rejected+prev.rejected,historyIsComplete,
   lifetimeCertified:false},
  customers:{
   observedPrevious:prev.customers.size,observedCurrent:cur.customers.size,
   observedUnion:new Set([...prev.customers.keys(),...cur.customers.keys()]).size,
   returned: returning.length,notObserved:nonreturning.length,
   returnRate:rate(returning.length,prev.customers.size),
   newObservedInCurrent:newObserved.length,
   oneVisitPrevious:oneVisit.length,oneVisitShare:rate(oneVisit.length,prev.customers.size),
   oneVisitNotObserved:oneNotSeen.length,oneVisitNotObservedRate:rate(oneNotSeen.length,oneVisit.length),
   repeatPrevious:repeat.length,repeatNotObserved:repeatNotSeen.length,
   repeatNotObservedRate:rate(repeatNotSeen.length,repeat.length),
   knownPreviousExposedToStudiedArticles:allProductBuyersUnion.size,
   priceIncreaseExposedPrevious:exposedUnion.size,priceIncreaseExposedNotObserved:missingExposed,
   nonreturnObservedWithPriceExposureShare:rate(missingExposed,nonreturning.length)
  },
  products:skuResults.slice(0,40),candidates:scopedProducts.length,diagnosis,
  studyConclusion:skuResults.some(p=>p.signal==='PRICE_UP_LOWER_RETURN_ASSOCIATION')?
   'Association entre prix réalisé plus élevé et retour client plus faible sur certaines références. Un lien causal ou une part de départ attribuable au prix ne sont pas démontrés.':
   'Les preuves ne permettent pas de démontrer que les hausses de prix expliquent une part substantielle des clients non revus.',
  limitations:[
   'Le non-retour est défini uniquement sur deux fenêtres observées : ce n’est pas un départ définitif.',
   'Client observé ≠ nouveau recrutement de fidélité. Le cumul d’adhésions doit venir de la source d’enrôlement.',
   'La première visite dans cette fenêtre n’est pas forcément la première visite depuis l’ouverture.',
   'Comparer jours, promotions, unités (g/kg) et répartition des magasins. Les stocks historiques et la concurrence restent non observés.',
   'Les clients anonymes ne peuvent pas être suivis. Les valeurs individuelles et tokens restent côté serveur.'
  ],
  causal:false
 }
}

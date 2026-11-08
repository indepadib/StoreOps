// Pure, traceable executive reading of the already-loaded decision evidence.
// No second D365 query, no inferred cost/margin and no extrapolated comparisons.
const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const round=v=>numeric(v)===null?null:Math.round((Number(v)+Number.EPSILON)*100)/100;
const pct=(a,b)=>numeric(a)!==null&&numeric(b)!==null&&Number(b)!==0?round(Number(a)/Number(b)*100):null;
const difference=(a,b)=>numeric(a)!==null&&numeric(b)!==null?round(Number(a)-Number(b)):null;
const days=(a,b)=>{
 const first=Date.parse(String(a||'')+'T00:00:00Z'),last=Date.parse(String(b||'')+'T00:00:00Z');
 return Number.isFinite(first)&&Number.isFinite(last)&&last>=first?Math.floor((last-first)/86400000)+1:null;
};
const compare=(a,b)=>numeric(a)!==null&&numeric(b)!==null&&Number(b)!==0?round((Number(a)-Number(b))/Math.abs(Number(b))*100):null;
const byAbsDelta=rows=>[...(rows||[])].filter(r=>numeric(r?.deltaSales)!==null).sort((a,b)=>Math.abs(b.deltaSales)-Math.abs(a.deltaSales));
export function buildBusinessStory(data){
 if(!data?.summary?.current||!data?.period||!data?.comparison)return null;
 const current=data.summary.current,previous=data.summary.previous||{},period=data.period,comparison=data.comparison;
 const currentDays=days(period.startDate,period.endDate),previousDays=days(comparison.startDate,comparison.endDate);
 const ready=data.status==='READY'&&data.quality?.status!=='ERROR'&&
   data.coverage?.storesRequested>0&&
   data.coverage?.currentStoresReady===data.coverage.storesRequested&&
   data.coverage?.comparisonStoresReady===data.coverage.storesRequested;
 const sales=numeric(current.sales),previousSales=numeric(previous.sales),tickets=numeric(current.tickets),previousTickets=numeric(previous.tickets);
 const basket=tickets>0&&sales!==null?round(sales/tickets):null,previousBasket=previousTickets>0&&previousSales!==null?round(previousSales/previousTickets):null;
 const delta=difference(sales,previousSales),salesChange=compare(sales,previousSales),ticketsChange=compare(tickets,previousTickets),basketChange=compare(basket,previousBasket);
 const dailySales=currentDays&&sales!==null?round(sales/currentDays):null,previousDailySales=previousDays&&previousSales!==null?round(previousSales/previousDays):null;
 const dailyTickets=currentDays&&tickets!==null?round(tickets/currentDays):null,previousDailyTickets=previousDays&&previousTickets!==null?round(previousTickets/previousDays):null;
 const discountSales=numeric(current.promotionSales),promotionShare=pct(discountSales,sales);
 const identifiedShare=numeric(current.identifiedSalesShare)??pct(current.identifiedSales,sales);
 const drivers=data.summary.drivers||{},trafficEffect=numeric(drivers.trafficEffect),basketEffect=numeric(drivers.basketEffect);
 const bridgeSafe=ready&&trafficEffect!==null&&basketEffect!==null&&delta!==null&&
  Math.abs(trafficEffect+basketEffect-delta)<=Math.max(1,Math.abs(delta)*.005);
 const products=byAbsDelta(data.products).filter(r=>r.deltaSales<0);
 const stores=byAbsDelta(data.stores).filter(r=>r.deltaSales<0);
 const topProduct=products[0]||null,topStore=stores[0]||null;
 const metrics=[
  {id:'sales_ttc',label:'CA TTC',value:sales,unit:'money',previous:previousSales,change:salesChange,source:'D365 ventes'},
  {id:'tickets',label:'Tickets',value:tickets,unit:'number',previous:previousTickets,change:ticketsChange,source:'Transactions distinctes'},
  {id:'average_basket',label:'Panier moyen',value:basket,unit:'money',previous:previousBasket,change:basketChange,source:'CA TTC / tickets'},
  {id:'sales_per_day',label:'CA / jour',value:dailySales,unit:'money',previous:previousDailySales,change:compare(dailySales,previousDailySales),source:'Jours calendaires'},
  {id:'tickets_per_day',label:'Tickets / jour',value:dailyTickets,unit:'number',previous:dailyTickets===null||previousDailyTickets===null?null:previousDailyTickets,change:compare(dailyTickets,previousDailyTickets),source:'Jours calendaires'},
  {id:'identified_sales_share',label:'Poids CA identifié',value:identifiedShare,unit:'percent',previous:numeric(previous.identifiedSalesShare),change:identifiedShare!==null&&numeric(previous.identifiedSalesShare)!==null?difference(identifiedShare,previous.identifiedSalesShare):null,changeUnit:'points',source:'Compte client identifié'},
  {id:'promotion_sales_share',label:'CA avec remise',value:promotionShare,unit:'percent',previous:pct(previous.promotionSales,previousSales),change:promotionShare!==null&&pct(previous.promotionSales,previousSales)!==null?difference(promotionShare,pct(previous.promotionSales,previousSales)):null,changeUnit:'points',source:'Lignes avec remise'}
 ];
 const actions=[];
 if(topStore&&numeric(topStore.deltaSales)<0)actions.push({title:'Magasin à examiner',detail:(topStore.storeName||topStore.storeId)+' : '+Math.abs(topStore.deltaSales).toFixed(2)+' DH de recul vs comparaison.',question:'Compare les magasins par CA, tickets et panier moyen. Lequel explique le recul ?',
   evidence:'D365 ventes · écart magasin TTC',kind:'store'});
 if(topProduct&&numeric(topProduct.deltaSales)<0)actions.push({title:'Article à investiguer',detail:(topProduct.label||topProduct.key||'Article')+' : '+Math.abs(topProduct.deltaSales).toFixed(2)+' DH de recul.',question:'Quels sont les 10 articles en plus forte baisse de CA ?',
   evidence:'D365 ventes · différence de CA article',kind:'article'});
 if(bridgeSafe){
  const trafficDominant=Math.abs(trafficEffect)>=Math.abs(basketEffect);
  actions.push({title:trafficDominant?'Priorité fréquentation':'Priorité panier',detail:'Décomposition de l’écart : '+(trafficDominant?'effet tickets':'effet panier')+' dominant en valeur absolue.',question:'Pourquoi le CA baisse ? Compare la fréquentation et le panier moyen.',
   evidence:'Pont arithmétique tickets × panier · pas de causalité',kind:'bridge'});
 }else actions.push({title:'Contrôler la comparabilité',detail:'L’effet fréquentation / panier ne peut pas être certifié sur cette fenêtre.',question:'Compare le CA, les tickets et le panier moyen sur la période.',
   evidence:'Vérifier les deux périodes et le statut des sources',kind:'quality'});
 const warnings=[];
 if(!ready)warnings.push('Lecture partielle ou non réconciliée : ne pas interpréter les variations comme définitives.');
 if(currentDays!==previousDays)warnings.push('Les fenêtres comptent '+currentDays+' et '+previousDays+' jours : utiliser aussi les valeurs par jour.');
 if(!data.margin?.available)warnings.push('Marge globale masquée : base HT ou coût non certifié (conversion g/kg comprise).');
 if(data.margin?.estimated)warnings.push('Marge estimée : certains coûts ne sont pas historiques.');
 if(!numeric(previousSales))warnings.push('Évolution en % indisponible sans CA comparable de référence.');
 const quality={status:ready?'READY':data.quality?.status||'PARTIAL',coverage:(data.coverage?.currentStoresReady??0)+'/'+(data.coverage?.storesRequested??0),issues:(data.quality?.issues||[]).slice(0,4).map(x=>x.message||x.code)};
 return{ready,period,comparison,currentDays,previousDays,delta,metrics,bridge:bridgeSafe?{trafficEffect,basketEffect,delta}:null,
  topStores:stores.slice(0,3).map(x=>({label:x.storeName||x.storeId,delta:x.deltaSales})),
  topProducts:products.slice(0,3).map(x=>({label:x.label||x.key,code:x.key,delta:x.deltaSales})),
  actions:actions.slice(0,3),warnings,quality};
}

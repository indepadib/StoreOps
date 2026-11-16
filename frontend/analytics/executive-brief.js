import {calendarDays, dailyComparison, evolution, marginEvidence} from './performance-evidence.js';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const number=(value,digits=1)=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:digits}).format(value);
const dateFormat=new Intl.DateTimeFormat('fr-MA',{day:'numeric',month:'short',timeZone:'UTC'});
const asDate=iso=>dateFormat.format(new Date(iso+'T00:00:00Z'));
const money=value=>number(value)+' DH';

export function executiveTrend(data,period,{currentReady,comparisonReady,provisional}){
 const days=calendarDays(period.periodStart,period.periodEnd);
 const compareDays=calendarDays(period.compareStart,period.compareEnd);
 if(!currentReady||!days||days<3)return null;
 const series=(rows,start,count)=>{
  const byDay=new Map((rows||[]).map(row=>[row.date,row.sales]));
  return Array.from({length:count},(_,i)=>{
   const day=new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10);
   const value=byDay.get(day);
   return finite(value)?value:null;
  });
 };
 const current=series(data?.daily?.current,period.periodStart,days);
 if(provisional)current[days-1]=null;
 if(current.filter(finite).length<3)return null;
 const previous=comparisonReady&&compareDays===days?series(data?.daily?.previous,period.compareStart,days):[];
 const values=[...current,...previous].filter(finite);
 let min=0,max=0;
 for(const value of values){min=Math.min(min,value);max=Math.max(max,value);}
 const line=series=>{
  let last=false;
  return series.map((value,index)=>{
   if(value===null){last=false;return '';}
   const x=24+index/(days-1)*592,y=106-(value-min)/(max-min||1)*86;
   const isolated=!last&&series[index+1]==null;
   const command=last?'L':'M';last=true;
   const point=command+x.toFixed(1)+','+y.toFixed(1);
   return isolated?point+' h1':point;
  }).filter(Boolean).join(' ');
 };
 const dateLabels=[asDate(period.periodStart),asDate(period.periodEnd)];
 const recordedDays=current.filter(finite).length;
 return {current:line(current),previous:previous.filter(finite).length>=2?line(previous):null,
  low:min,high:max,dateLabels,caption:`CA TTC par jour · ${recordedDays}/${days} jours renseignés${provisional?' · journée en cours exclue':''}`};
}

function businessSignals(data,current,comparable){
 const cards=[];
 const row=(label,value,tone='')=>({label,value,tone});
 const signedMoney=value=>(value>0?'+':'')+money(value);
 const add=(title,rows,section,action)=>{if(rows.length)cards.push({title,rows,section,action});};
 const drivers=data.summary?.drivers||{};
 if(comparable)add('Ce qui explique l’écart de CA',[
  ['Effet tickets',drivers.trafficEffect],['Effet panier',drivers.basketEffect],['Écart résiduel',drivers.reconciliationGap]
 ].filter(([,v])=>finite(v)).map(([label,value])=>row(label,signedMoney(value),value<0?'down':value>0?'up':'')),'sales','Vérifier les contributions');
 const shops=(data.stores||[]).filter(store=>store.status==='READY'&&finite(store.sales));
 const ranked=[...shops].sort((a,b)=>b.sales-a.sales);
 const declining=comparable?shops.filter(store=>finite(store.previousSales)&&store.sales<store.previousSales).sort((a,b)=>(a.sales-a.previousSales)-(b.sales-b.previousSales)):[];
 add(declining.length?'Magasins qui pèsent sur la baisse':'CA par magasin',(declining.length?declining:ranked).slice(0,3).map(store=>
  row(store.storeName||store.storeCode||store.storeId,declining.length?signedMoney(store.sales-store.previousSales):money(store.sales),declining.length?'down':'')
 ),'network','Comparer les magasins');
 const clientRows=[
  ['Part du CA identifié',current.identifiedSalesShare,'%'],
  ['Tickets identifiés',current.identifiedTicketRate,'%'],
  ['Clients distincts identifiés',data.crm?.identifiedCustomers,''],
 ].filter(([,v])=>finite(v)).map(([label,value,unit])=>row(label,number(value)+(unit?' '+unit:'')));
 add('Fidélité et identification',clientRows,'loyalty','Analyser la fidélité');
 const promoRows=[
  ['CA des ventes sous promotion',current.promotionSales,'DH'],
  ['Tickets concernés',current.promotionTickets,''],
  ['Remises enregistrées',current.discountAmount,'DH'],
 ].filter(([,v])=>finite(v)).map(([label,value,unit])=>row(label,number(value)+(unit?' '+unit:'')));
 add('Exposition aux promotions',promoRows,'promotions','Analyser les offres');
 return cards;
}

function dailyPace(data,period,today,current,previous,referenceReady){
 const days=calendarDays(period.periodStart,period.periodEnd);
 const referenceDays=calendarDays(period.compareStart,period.compareEnd);
 const dateAt=(start,index)=>new Date(Date.parse(start)+index*86400000).toISOString().slice(0,10);
 const closed=days?Math.max(0,Math.min(days,Math.floor((Date.parse(today)-Date.parse(period.periodStart))/86400000))):0;
 const provisional=closed!==days;
 const read=(rows,start,count,key)=>{
  if(!count)return null;
  const values=new Map((rows||[]).map(row=>[row.date,row[key]]));
  let sum=0;
  for(let index=0;index<count;index++){
   const value=values.get(dateAt(start,index));
   if(!finite(value))return null;
   sum+=value;
  }
  return sum;
 };
 const matched=provisional&&referenceReady&&closed>0&&closed<=referenceDays;
 const currentScope=closed?{...period,periodEnd:dateAt(period.periodStart,closed-1),compareEnd:matched?dateAt(period.compareStart,closed-1):period.compareEnd}:period;
 const indicators=[['CA TTC moyen / jour','sales',' DH'],['Tickets moyens / jour','tickets','']].map(([label,key,unit])=>{
  const total=provisional?read(data.daily?.current,period.periodStart,closed,key):current[key];
  const reference=provisional?(matched?read(data.daily?.previous,period.compareStart,closed,key):null):previous[key];
  const pace=dailyComparison(total,reference,currentScope);
  const format=value=>number(value,2)+unit;
  const signed=(value,suffix)=>(value>0?'+':'')+number(value,2)+suffix;
  return {
   label,value:pace.value==null?'Indisponible':format(pace.value),
   detail:pace.previous==null?'Comparaison indisponible':`Avant : ${format(pace.previous)} / jour · ${pace.pct==null?(pace.delta===0?'Stable · base nulle':'Base précédente nulle'):signed(pace.pct,' %')} · ${signed(pace.delta,unit)} / jour`,
  };
 });
 const caption=provisional?closed?`${closed} jour(s) clos · jusqu’au ${asDate(currentScope.periodEnd)}${matched?` · comparaison du ${asDate(period.compareStart)} au ${asDate(currentScope.compareEnd)}`:''}`:'Aucune journée close dans cette période.':`${days} jours calendaires${referenceReady&&referenceDays?` · comparaison sur ${referenceDays} jours`:''}`;
 return {indicators,caption};
}

export function buildExecutiveBrief({data,period,selectedStores,scopeLabel,today,priority}){
 const ready=selectedStores>0&&data?.coverage?.storesRequested===selectedStores;
 const truncated=(data?.quality?.checks?.truncatedStores||0)>0||data?.quality?.issues?.some(issue=>issue.code==='SALES_TRUNCATED');
 const currentReady=ready&&data.coverage.currentStoresReady===selectedStores&&!truncated;
 const comparisonReady=ready&&data.coverage.comparisonStoresReady===selectedStores;
 const provisional=period.periodEnd>=today||period.compareEnd>=today;
 const sameDays=calendarDays(period.periodStart,period.periodEnd)===calendarDays(period.compareStart,period.compareEnd);
 const referenceReady=currentReady&&comparisonReady&&!priority?.evidenceConflict&&['OK','WARN'].includes(data?.quality?.status)&&period.compareEnd<period.periodStart&&period.compareEnd<today;
 const comparable=referenceReady&&sameDays&&!provisional;
 const current=currentReady?data.summary?.current||{}:{};const previous=comparable?data.summary?.previous||{}:{};
 const margin=marginEvidence(currentReady?data:null);
 const marginNote=margin.rate==null?'Coût ou base HT à qualifier':(margin.estimated?'Coût courant estimé · ':'')+'Montant HT : '+money(margin.value)+(margin.coverage==null?'':` · coût couvert ${number(margin.coverage)} %`);
 const movementMetric=(label,key,unit)=>({
  label,value:current[key],previous:previous[key],unit,positiveGood:true,changeMode:comparable?'percent':'none',
 });
 const comparisons=[
  movementMetric('Chiffre d’affaires TTC','sales','money'),
  movementMetric('Tickets','tickets','number'),
  movementMetric('Panier moyen','averageBasket','money'),
  {label:margin.kind==='PARTIAL'?'Marge HT sur ventes couvertes':'Taux de marge HT',value:margin.rate,unit:'percent',changeMode:'none',emphasis:true,estimated:margin.estimated,note:marginNote}
 ];
 const kpis=comparisons.map(metric=>{
  const value=finite(metric.value)?(metric.estimated?'≈ ':'')+number(metric.value,2)+({money:' DH',percent:' %'}[metric.unit]||''):'Indisponible';
  const delta=evolution(metric.value,metric.previous).pct;
  return [metric.label,value,metric.note||(delta==null?'':`${delta>0?'+':''}${number(delta,2)} % vs comparaison`)];
 });
 const exception=priority?.items?.find(item=>item.id.startsWith('store:')||item.id.startsWith('product:'));
 let decision={title:'Poursuivre la surveillance',text:'Aucun recul prioritaire n’est ressorti des ventes comparables.',section:'sales',action:'Consulter le détail des ventes'};
 if(!data)decision={title:'Lecture du périmètre',text:'Les chiffres s’affichent après lecture des magasins sélectionnés.'};
 else if(!comparable)decision={title:'Vérifier avant de décider',text:priority?.items?.find(item=>item.id==='evidence')?.evidence||'La comparaison n’est pas suffisamment documentée.',section:'sales',action:'Ouvrir les contrôles de ventes'};
 else if(exception)decision={title:exception.title,text:exception.evidence,lines:[exception.action],section:exception.section,action:exception.section==='network'?'Comparer les magasins':'Examiner les ventes'};
 const pace=currentReady?dailyPace(data,period,today,current,referenceReady?data.summary?.previous||{}:{},referenceReady):null;
 const trend=executiveTrend(data,period,{currentReady,comparisonReady:comparable,provisional});
 const generatedAt=data?.generatedAt?new Date(data.generatedAt):null;
 const read=generatedAt&&Number.isFinite(generatedAt.valueOf())?generatedAt.toLocaleString('fr-MA',{timeZone:'Africa/Casablanca',dateStyle:'short',timeStyle:'short'}):null;
 const quality=!data?'Lecture des sources en cours.':[
  `Magasins lus : ${data.coverage?.currentStoresReady??0}/${selectedStores} · comparaison ${data.coverage?.comparisonStoresReady??0}/${selectedStores}`,
  truncated?'Lecture des ventes tronquée':null,
  provisional?'Période provisoire':!sameDays?'Durées différentes':null,
  data.quality?.status==='OK'?'Contrôles OK':data.quality?.status?'Contrôles à examiner':null,
  read?`Lu le ${read}`:null,
 ].filter(Boolean).join(' · ');
 return {comparisons,kpis,trend,decision,quality,pace,signals:currentReady?businessSignals(data,current,comparable):[],title:'Vue exécutive',
  period:`${period.periodStart} → ${period.periodEnd} · comparaison ${period.compareStart} → ${period.compareEnd} · ${scopeLabel}`};
}

// Research panel: incremental loading keeps Dynamics calls out of synchronous
// report generation and avoids multi-minute "infinite loading" states.
const $=id=>document.getElementById(id);
const core=window.RETAIL_INTELLIGENCE;
const host=$('customerResearch'),content=$('customerResearchContent'),base=$('customerBaseContent'),status=$('customerResearchStatus');
let generation=0,controller=null,running=false,preparedCount=0;
const nf=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2});
const number=v=>v==null||!Number.isFinite(Number(v))?'Non mesuré':nf.format(v);
const pct=v=>v==null||!Number.isFinite(Number(v))?'Non mesuré':nf.format(v)+' %';
const money=v=>v==null||!Number.isFinite(Number(v))?'Non mesuré':nf.format(v)+' DH';
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n};
function add(parent,tag,cls,text){const n=node(tag,cls,text);parent.append(n);return n}
const shiftDay=(day,offset)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
const daysBetween=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)+1;
const dates=()=>{
 const s=core.getState(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date()),
 yesterday=shiftDay(today,-1);
 let start=s.periodStart,end=s.periodEnd,compareStart=s.compareStart,compareEnd=s.compareEnd;
 if(end>=today){
  if(start>yesterday){start=yesterday;end=yesterday;compareStart=compareEnd=shiftDay(yesterday,-1)}
  else{end=yesterday;const count=daysBetween(start,end);compareStart=shiftDay(compareEnd,-(count-1))}
 }
 return{start,end,compareStart,compareEnd,storeIds:core.getSelectedStores().map(x=>x.id).join(','),storeId:'ALL'}
};
const key=()=>JSON.stringify(dates());
function summaryCard(label,value,detail){
 const card=node('article','customer-research-metric');add(card,'small',null,label);add(card,'strong',null,value);add(card,'span',null,detail);return card
}
function render(report){
 content.replaceChildren();
 if(!report||!report.customers)return;
 const h=node('div','customer-research-result-heading');
 add(h,'strong',null,'Étude comparative · '+report.comparison.start+' → '+report.comparison.end+' / '+report.period.start+' → '+report.period.end);
 add(h,'small',null,'Tickets identifiés · '+report.coverage.storeIds.length+' magasin(s) · source '+report.source);
 content.append(h);
 const metrics=node('div','customer-research-metrics'),c=report.customers;
 metrics.append(
  summaryCard('Clients identifiés précédemment',number(c.observedPrevious),'Dans la fenêtre de comparaison'),
  summaryCard('Taux de retour observé',pct(c.returnRate),number(c.returned)+' clients revus sur la fenêtre actuelle'),
  summaryCard('Non revus',number(c.notObserved),'Non revus ≠ clients définitivement perdus'),
  summaryCard('Une seule visite observée',pct(c.oneVisitShare),number(c.oneVisitPrevious)+' clients avec un seul ticket avant'),
  summaryCard('Non revus après une visite',pct(c.oneVisitNotObservedRate),number(c.oneVisitNotObserved)+' clients concernés'),
  summaryCard('Exposés aux prix en hausse',number(c.priceIncreaseExposedPrevious),number(c.priceIncreaseExposedNotObserved)+' non revus, chevauchements dédoublonnés')
 );
 content.append(metrics);
 const section=node('section','customer-research-panel');
 add(section,'h4',null,'Jus d’orange et poulet · analyse référence par référence');
 const desc=add(section,'p','customer-research-desc',"Une baisse de fréquentation chez les acheteurs d’un produit ne prouve pas que son prix l’a causée. L’étude compare le retour des autres acheteurs et distingue les clients qui reviennent sans cet article.");
 if(!report.products.length)desc.textContent+=" Le rapprochement avec le catalogue articles manque : vérifiez les libellés et codes Dynamics.";
 const productArea=node('div','customer-research-products');
 for(const group of [{id:'JUICE_ORANGE',label:'Jus d’orange'},{id:'CHICKEN',label:'Poulet'}]){
  const groupNode=node('div','customer-research-product-group');
  add(groupNode,'h5',null,group.label);
  const products=report.products.filter(x=>x.group===group.id);
  if(!products.length)add(groupNode,'p','research-empty','Aucune référence identifiée dans les ventes préparées ; impossible de conclure.');
  for(const p of products.slice(0,8)){
   const article=node('article','customer-research-product');
   const head=node('div','research-product-head');
   add(head,'strong',null,p.productName||p.productNumber);
   add(head,'small',null,p.productNumber+' · unité : '+(p.previous.unit||'non comparable'));
   article.append(head);
   const grid=node('div','research-product-stats');
   grid.append(summaryCard('Prix réellement payé',money(p.previous.realizedPrice)+' → '+money(p.current.realizedPrice),p.priceChangePct==null?'Changement non qualifiable':'Évolution '+pct(p.priceChangePct)),
    summaryCard('Tickets avec cet article',number(p.previous.tickets)+' → '+number(p.current.tickets),'Évolution '+pct(p.ticketChangePct)),
    summaryCard('Acheteurs identifiés auparavant',number(p.exposedPreviousBuyers),number(p.notSeenAgain)+' non revus'),
    summaryCard('Revenus sans racheter',number(p.returnedWithoutArticle),'Clients encore actifs dans le magasin'));
   article.append(grid);
   if(p.control?.status==='OBSERVATIONAL'){
    add(article,'p','research-control',
      'Retour des anciens acheteurs : '+pct(p.control.exposedReturnRate)+' · autres clients : '+pct(p.control.controlReturnRate)+
      ' · écart observé '+number(p.control.deltaPoints)+' points · IC indicatif 95 % ['+p.control.ci95.map(number).join(' ; ')+']');
   }else add(article,'p','research-control','Groupe témoin ou exposition trop petits : association de retour non estimable (minimum de 10 clients dans chaque groupe).');
   add(article,'p','research-signal',p.signal==='PRICE_UP_LOWER_RETURN_ASSOCIATION'?'Signal à investiguer : prix réalisé en hausse et retour des acheteurs plus faible que celui des autres clients. Causalité non démontrée.':
    p.priceObservation==='INCREASE_OBSERVED'?'Hausse du prix réalisé détectée, sans effet négatif robuste sur le retour client démontré.':'Aucune hausse comparable du prix réalisé démontrée sur cette période.');
   groupNode.append(article);
  }
  productArea.append(groupNode)
 }
 section.append(productArea);content.append(section);
 const analyses=node('section','customer-research-panel');
 add(analyses,'h4',null,'Autres explications possibles · distinguer preuves et hypothèses');
 const factors=node('div','customer-research-factors');
 const states={OBSERVATIONAL_SIGNAL:'Signal observé',MEASURED:'Mesuré',OBSERVED:'Observé',SOURCE_REQUIRED:'Source manquante',HYPOTHESIS:'Hypothèse à vérifier',DESCRIPTIVE:'Descriptif',NOT_OBSERVED:'Non observé',NOT_DEMONSTRATED:'Non démontré',INSUFFICIENT_DATA:'Base insuffisante'};
 for(const factor of report.diagnosis){
  const item=node('article','research-factor');
  add(item,'strong',null,factor.label);add(item,'span','research-factor-state',states[factor.state]||factor.state);
  add(item,'p',null,factor.evidence);factors.append(item)
 }
 analyses.append(factors);content.append(analyses);
 const quality=node('section','customer-research-quality');
 add(quality,'strong',null,'Conclusion fondée sur les preuves');add(quality,'p',null,report.studyConclusion);
 for(const warning of report.limitations)add(quality,'p',null,'• '+warning);
 add(quality,'p',null,'Couverture des identifications : '+pct(report.coverage.previousIdentificationRate)+' avant, '+pct(report.coverage.currentIdentificationRate)+' après ; lignes de tickets rejetées : '+number(report.coverage.rejectedIdentityRows)+'.');
 content.append(quality)
}
function renderBase(response){
 base.replaceChildren();const section=node('section','customer-research-panel');
 add(section,'h4',null,'Base fidélité et recrutements enregistrés');
 if(!response||response.status==='UNAVAILABLE'){add(section,'p',null,'La source fidélité est indisponible.');base.append(section);return}
 const metrics=node('div','customer-research-metrics');
 metrics.append(summaryCard('Adhésions enregistrées',number(response.enrollments),'Depuis le '+response.historyStart),
  summaryCard('Comptes distincts',number(response.distinctRegisteredCustomers),'Dédoublonnés entre magasins seulement si le compte client est disponible'),
  summaryCard('Statut des sources',response.status,'Comptage non publié si historique tronqué ou partiel'));
 section.append(metrics);add(section,'p','customer-research-warning',response.note);
 for(const store of response.stores||[]){
  const p=add(section,'p','research-base-store',store.storeName+' · '+number(store.enrollments)+' adhésions · '+store.status+' · '+(store.source||'source inconnue'));
  if(store.error)p.textContent+=' · '+(store.error.message||store.error.code)
 }
 base.append(section)
}
function setStatus(message,isError=false){
 status.textContent=message;status.classList.toggle('research-error',isError)
}
async function prepare(tasks,signal){
 let position=0,completed=0,error=null;
 const workers=Array.from({length:Math.min(2,tasks.length)},async()=>{
  while(position<tasks.length&&!error){
   const task=tasks[position++];
   if(signal.aborted)return;
   try{
    await core.api('/api/analytics/customer-intelligence/prepare?'+new URLSearchParams({storeId:task.storeId,date:task.date}),{noRetry:true,signal});
    completed++;preparedCount++;setStatus('Préparation historique · '+preparedCount+' journées récupérées ; dernières : '+task.date+' / '+task.storeId+'. Vous pouvez changer de page sans invalider les dates déjà mises en cache.')
   }catch(e){error=e;return}
  }
 });
 await Promise.all(workers);if(error)throw error
}
async function runResearch(){
 if(running)return;running=true;const run=$('customerResearchRun'),currentKey=key(),myGeneration=++generation;
 controller?.abort();controller=new AbortController();const signal=controller.signal;
 run.disabled=true;run.textContent='Analyse en cours…';preparedCount=0;
 try{
  for(let round=0;round<28;round++){
   if(signal.aborted||currentKey!==key()||myGeneration!==generation){setStatus('Périmètre modifié : anciens résultats écartés.');return}
   const data=await core.api('/api/analytics/customer-research?'+new URLSearchParams(dates()),{noRetry:true,signal});
   if(data.status!=='PREPARATION_REQUIRED'){
    render(data);
    setStatus('Étude calculée sur les journées terminées indiquées dans le rapport · les journées en cours sont exclues · aucune causalité inventée.');
    return
   }
   setStatus(data.missingDays+' journées de paniers à préparer, par lots de 12. Lecture contrôlée pour éviter les délais 504.');
   await prepare(data.tasks||[],signal)
  }
  setStatus('Historique volumineux. Les journées déjà préparées sont conservées : relancez pour poursuivre les lots.',true)
 }catch(error){if(!signal.aborted)setStatus('Étude suspendue : '+(error.message||'lecture indisponible')+'. Les journées validées restent en cache.',true)}
 finally{run.disabled=false;run.textContent='Construire / reprendre le rapport';running=false}
}
let baseController=null;
async function runCustomerBase(){
 const historyStart=$('customerHistoryStart').value,historyEnd=dates().end,btn=$('customerBaseRun');
 if(!historyStart){setStatus('Renseignez et vérifiez la date officielle de début d’historique fidélité ; aucune date d’ouverture n’est supposée.',true);$('customerHistoryStart').focus();return}
 if(baseController)baseController.abort();
 const signal=(baseController=new AbortController()).signal;
 btn.disabled=true;$('customerBaseCancel').hidden=false;
 const params=new URLSearchParams({...dates(),historyStart,end:historyEnd});
 try{
  for(let attempt=0;attempt<90;attempt++){
   if(signal.aborted)return;
   const r=await core.api('/api/analytics/customer-base?'+params,{noRetry:true,signal});
   if(r.status!=='PREPARATION_REQUIRED'){
    renderBase(r);
    setStatus(r.status==='READY'?'Adhésions historiques vérifiées sur la fenêtre choisie. Attention : date d’ouverture à certifier.':'Historique partiel ; aucun total inventé.');
    return
   }
   setStatus('Base historique · '+r.coveredMonths+'/'+r.totalMonths+' périodes mensuelles contrôlées. Lecture de '+r.tasks.length+' mois supplémentaires…');
   let cursor=0,completed=0,error=null;const tasks=r.tasks;
   await Promise.all(Array.from({length:Math.min(2,tasks.length)},async()=>{
    while(cursor<tasks.length&&!error&&!signal.aborted){
     const task=tasks[cursor++];
     try{
      const p=new URLSearchParams({storeId:task.storeId,start:task.start,end:task.end});
      await core.api('/api/analytics/customer-base/prepare?'+p,{noRetry:true,signal});
      completed++;
      setStatus('Base historique · '+(r.coveredMonths+completed)+'/'+r.totalMonths+' mois préparés. Données enregistrées et réutilisables.')
     }catch(e){if(!signal.aborted)error=e;return}
    }
   }));
   if(error)throw error
  }
  setStatus('Historique important : les périodes certifiées ont été conservées. Relancez pour reprendre le traitement.',true);
 }catch(e){if(!signal.aborted)setStatus('Historique fidélité interrompu : '+(e.message||'source indisponible')+'. Les mois déjà sauvegardés seront réutilisés.',true)}
 finally{btn.disabled=false;$('customerBaseCancel').hidden=true;baseController=null}
}
$('customerBaseCancel')?.addEventListener('click',()=>baseController?.abort());
$('customerResearchRun')?.addEventListener('click',runResearch);
$('customerBaseRun')?.addEventListener('click',runCustomerBase);
document.addEventListener('retail-intelligence:section',()=>{if(controller&&running)controller.abort()});

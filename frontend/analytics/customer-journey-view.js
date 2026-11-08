// Plain-text HTML-free customer diagnosis UI. User-facing explanations are
// only produced for the currently selected evidence period and stores.
const E=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=String(text);return el};
const put=(root,tag,cls,text)=>{const el=E(tag,cls,text);root.append(el);return el};
const num=v=>v==null||!Number.isFinite(Number(v))?'N/D':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(v);
const pct=v=>v==null||!Number.isFinite(Number(v))?'N/D':num(v)+' %';
const dh=v=>v==null||!Number.isFinite(Number(v))?'N/D':num(v)+' DH';
const summary=(host,title,description)=>{
 const section=put(host,'section','customer-research-panel customer-journey-section');
 put(section,'h4',null,title);if(description)put(section,'p','customer-research-desc',description);return section
};
const table=(host,headers,rows)=>{
 const box=put(host,'div','customer-journey-table-scroll'),t=put(box,'table','customer-journey-table');
 const tr=put(t.createTHead(),'tr');
 for(const x of headers)put(tr,'th',null,x);
 const body=t.createTBody();
 for(const row of rows){
  const line=put(body,'tr');
  for(const [index,entry] of row.entries())put(line,'td',index===0?'journey-first':'',entry)
 }
 if(!rows.length){const tr=put(body,'tr'),td=put(tr,'td',null,'Aucune observation exploitable sur ce périmètre.');td.colSpan=headers.length}
 return t
};
function evidenceCards(container,journey){
 const m=journey.evolution,s=journey.returning;
 const cards=put(container,'div','customer-research-metrics');
 for(const [label,value,desc] of[
  ['Clients identifiés avant',num(m.observedPrior),'Comparaison · tous magasins autorisés'],
  ['Clients identifiés revus',num(m.returned),pct(m.returnRatePct)+' de retour observé'],
  ['Non revus',num(m.nonObserved),'Ce n’est pas un départ définitif'],
  ['Panier moyen des mêmes clients',dh(s.averageBasketBefore)+' → '+dh(s.averageBasketAfter),'Évolution '+pct(s.averageBasketChangePct)],
  ['Fréquence en recul',num(s.frequencyDown),'Mêmes clients, nombre de tickets inférieur'],
  ['Articles abandonnés',num(s.ceasedAtLeastOneProduct),'Clients revenus sans certains articles']
 ]){
  const card=put(cards,'article','customer-research-metric');
  put(card,'small',null,label);put(card,'strong',null,value);put(card,'span',null,desc)
 }
}
function insightCards(container,journey){
 const section=summary(container,'Ce que nous pouvons expliquer maintenant',
  'Lecture priorisée sur les mêmes clients et tous les produits vendus, avant toute hypothèse de prix.');
 const cards=put(section,'div','customer-journey-insights');
 for(const insight of journey.insights||[]){
  const article=put(cards,'article','customer-journey-insight');
  put(article,'div','customer-journey-insight-title',insight.title);
  put(article,'strong','customer-journey-insight-value',insight.unit==='%'?pct(insight.value):num(insight.value)+' '+insight.unit);
  put(article,'p',null,insight.text);
  put(article,'small',null,'À approfondir : '+insight.next)
 }
}
function changesSection(container,journey){
 const s=summary(container,'Quels articles les clients ont-ils abandonnés ?',
  'Uniquement les clients identifiés présents dans les deux fenêtres. Une absence de réachat ne signifie pas nécessairement rupture, mauvaise qualité ou prix trop élevé.');
 const rows=(journey.products?.stoppedPurchases||[]).slice(0,12).map(p=>[
  p.productName,p.productNumber,num(p.returnedButStoppedBuying),
  num(p.returnedStoreAmongPriorBuyers),pct(p.stoppedBuyingAmongReturnersPct),
  (p.newProductsBoughtInstead||[]).slice(0,2).map(x=>x.productName+' ('+x.clients+')').join(' ; ')||'Rien de concluant'
 ]);
 table(s,['Article abandonné','Référence','Revenus sans article','Anciens acheteurs revenus','Part abandonnant','Achats nouvellement observés'],rows);
 const note=put(s,'small','customer-research-warning',
  'Les articles nouvellement achetés ne sont pas nécessairement des substituts. Une substitution crédible nécessite famille/usage comparable et disponibilité historique.');
 void note
}
function priceSection(container,journey){
 const s=summary(container,'Prix : les références qui méritent une investigation',
  'Classement automatique sur toutes les références avec prix TTC réalisé comparable, au moins 10 tickets dans chaque fenêtre et hausse d’au moins 5 %. Ce seuil est un filtre d’investigation, pas une preuve de sensibilité prix.');
 const rows=(journey.products?.priceIncreases||[]).slice(0,12).map(p=>[
  p.productName,p.productNumber,
  dh(p.previous.price)+' → '+dh(p.current.price),pct(p.priceChangePct),
  num(p.previous.clients),pct(p.articleTicketChangePct),num(p.returnedButStoppedBuying),
  num(p.notObservedAmongPriorBuyers)
 ]);
 table(s,['Article','Référence','Prix TTC réalisé','Évol.','Acheteurs avant','Évol. tickets','Revenus sans article','Non revus'],rows);
 put(s,'p','customer-research-warning','À compléter : tarifs officiels historisés, remises, prix à l’unité, positionnement versus articles comparables et stocks au moment des visites.');
}
function cohortSection(container,journey){
 const s=summary(container,'Les comportements de retour selon le profil de départ',
  'Les segments se chevauchent : ne pas additionner les effectifs entre lignes. Première visite observée ≠ première visite depuis ouverture.');
 const rows=(journey.cohorts||[]).map(c=>[c.label,num(c.previous),num(c.returned),pct(c.returnRatePct),num(c.notObserved),dh(c.previousSalesOfNotObserved)]);
 table(s,['Profil','Clients avant','Revenus','Retour','Non revus','Dépense passée des non-revus'],rows);
 put(s,'p','customer-research-warning','La dépense passée des clients non revus n’est PAS du chiffre d’affaires perdu démontré. Il faut un contrefactuel de fréquence d’achat.');
}
function journeyCases(container,journey){
 const s=summary(container,'Leurs paniers avant → après : exemples détaillés',
  'Parcours de clients identifiés revenus, anonymisés et sélectionnés pour leurs changements marqués ; ces exemples ne représentent pas statistiquement toute la clientèle.');
 for(const v of journey.journeys||[]){
  const details=put(s,'details','customer-journey-case'),head=put(details,'summary');
  put(head,'strong',null,v.label);
  put(head,'span',null,num(v.visitsBefore)+' → '+num(v.visitsAfter)+' visites · '+dh(v.salesBefore)+' → '+dh(v.salesAfter));
  const body=put(details,'div','customer-journey-case-body');
  put(body,'p','customer-research-warning','Ne rachète plus : '+(v.oldProductsNoLongerPurchased.join(' · ')||'Aucune référence'));
  put(body,'p','customer-research-warning','Nouveaux articles : '+(v.newProducts.join(' · ')||'Aucune référence'));
  for(const [title,baskets] of [['AVANT',v.beforeTickets],['APRÈS',v.afterTickets]]){
   put(body,'strong','customer-journey-phase',title);
   for(const t of baskets){
    const row=put(body,'div','customer-journey-basket');
    put(row,'small',null,t.date+' · '+t.storeId+' · '+dh(t.amount)+(t.promotion?' · ticket remisé':''));
    put(row,'p',null,(t.articles||[]).map(x=>x.productName+' '+dh(x.sales)+(x.promotion?' [remise]':'')).join(' · '))
   }
  }
 }
 if(!journey.journeys?.length)put(s,'p','research-empty','Aucun ancien client ayant au moins deux visites dans la fenêtre avant et revenu ensuite : pas de parcours comparatif suffisamment renseigné.');
}
export function renderCustomerJourney(host,journey){
 if(!host||!journey)return;
 const container=put(host,'div','customer-journey-v2');
 const caption=put(container,'div','customer-research-result-heading');
 put(caption,'strong',null,'Analyse de parcours · ventes et clients identifiés · toutes les références');
 put(caption,'small',null,'Fiabilité : '+pct(journey.coverage.identificationBeforePct)+' → '+pct(journey.coverage.identificationAfterPct)+' des tickets identifiés ; '+pct(journey.coverage.productNameCoveragePct)+' des noms d’articles disponibles.');
 evidenceCards(container,journey);insightCards(container,journey);changesSection(container,journey);
 priceSection(container,journey);cohortSection(container,journey);journeyCases(container,journey);
 const quality=summary(container,'Limites et sources manquantes','Les conclusions ci-dessus ne sont pas des attributions causales.');
 for(const q of journey.limitations||[])put(quality,'p','customer-research-warning','• '+q);
 if(!journey.coverage.comparable)put(quality,'p','research-empty','Attention : fenêtres de durées différentes, ne pas comparer les fréquences brutes.');
 if(journey.coverage.rejectedRows)put(quality,'p','research-empty',journey.coverage.rejectedRows+' lignes de transactions rejetées pour défaut d’identité ticket.');
 if((journey.coverage.productNameCoveragePct??0)<60)put(quality,'p','research-empty','Le catalogue articles est insuffisamment résolu : les références SKU sont affichées sans supposer leurs noms.');
}

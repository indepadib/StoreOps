import {analyticsCacheKey} from './analytics-persistent-cache.mjs';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,' ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const n=v=>v==null?'Non mesuré':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(v);
const pct=v=>v==null?'Non mesuré':n(v)+' %';
const money=v=>v==null?'Non mesuré':n(v)+' DH';
export function classifyCustomerResearchQuestion(question){
 const q=norm(question),customer=/client|fidel|adherent|recrut|carte|cohorte|premier achat|premiere visite|churn|attrition|retention|revien|revu/.test(q);
 const lifetime=/depuis (?:l )?(?:ouverture|debut|lancement|creation)|toute (?:notre|la) base|base (?:de )?clients|combien.*recrut|cumul.*(?:adhesion|client|recrut)|historique.*(?:fidel|client)/.test(q);
 const pricing=/hausse|augmentation|prix|tarif|plus cher|cherte|effet prix/.test(q);
 const product=/orange|jus|poulet|chicken|produit|article/.test(q);
 const churn=/ne revien|ne reven|plus revu|non revu|perdu|perte.*client|parti|retour|retention|une seule fois|premiere fois|abandonn|plus maintenant|attrition|rupture|causes|raisons|frequentation/.test(q);
 if(lifetime&&customer)return{kind:'CUSTOMER_LIFETIME',aspects:['recrutement','base','historique']};
 if((pricing&&product&&(customer||churn))||(customer&&churn&&/(?:raison|cause|pourquoi|expliqu|une seule fois|premiere fois|ne revient plus|ne reviennent plus|plus maintenant|rupture|abandonn)/.test(q)))return{kind:'CUSTOMER_RETENTION_RESEARCH',aspects:[...(pricing?['price']:[]),...(product?['article']:[]),'retention','hypotheses']};
 return null
}
export async function customerResearchQuestion(stores,input,{read}){
 const intent=classifyCustomerResearchQuestion(input.question);if(!intent)return null;
 const scope=stores.map(s=>s.id).sort().join(',');
 const period={start:input.start,end:input.end,compareStart:input.compareStart,compareEnd:input.compareEnd};
 if(intent.kind==='CUSTOMER_LIFETIME'){
  return{engine:'CUSTOMER_RESEARCH',status:'NEEDS_HISTORICAL_START',providerDataSent:false,
   answer:'La base historique nécessite la date de départ officielle et les adhésions Dynamics. Je distingue : 1) adhésions enregistrées, 2) clients distincts sur carte, 3) clients identifiés dans les tickets. Une première apparition en caisse ne prouve pas un recrutement. Ouvrez Clients & CRM → Adhésions depuis cette date et renseignez la date historique vérifiée. Sans elle, je ne publierai pas de chiffre « depuis l’ouverture ».',
   sections:[{title:'Base clients depuis ouverture',headline:'Date de démarrage officielle non certifiée dans StoreOps.',lines:['Source : D365 Loyalty Card / date d’adhésion, par unité commerciale.','Dédoublonnage entre magasins lorsque le compte client est disponible.','Le nombre de tickets identifiés n’est pas le nombre d’adhésions.']}],
   suggestedSection:'crm',sources:[{id:'LOYALTY',name:'D365 adhésions fidélité : lecture requise'}],context:period}
 }
 const cacheKey=analyticsCacheKey('customer-research-v2',[scope,period.start,period.end,period.compareStart,period.compareEnd]);
 const result=await read(cacheKey);
 if(!result){
  return{engine:'CUSTOMER_RESEARCH',status:'NEEDS_RESEARCH',providerDataSent:false,
   answer:'Je comprends la demande : établir si les hausses de prix du jus d’orange et du poulet sont associées à une baisse de rétention, et isoler les clients venus une seule fois, ceux qui ne reviennent plus et ceux qui reviennent sans l’article. La preuve n’est pas encore préparée pour '+period.compareStart+' → '+period.compareEnd+' et '+period.start+' → '+period.end+'. Ouvrez Clients & CRM puis « Construire le rapport » : je ne substitue pas un simple classement CA à cette étude.',
   sections:[{title:'Investigation à préparer',headline:'Deux fenêtres exactes, mêmes magasins, tickets identifiés et produits comparables.',lines:['Prix TTC réellement payé ≠ tarif catalogue.','Ruptures historiques et concurrence : données datées nécessaires pour conclure.','Les clients non revus ne sont pas nécessairement perdus.']}],
   suggestedSection:'crm',sources:[],context:period}
 }
 const c=result.customers||{},group=kind=>result.products?.filter(p=>p.group===kind)||[],priceRows=[...group('JUICE_ORANGE'),...group('CHICKEN')],journey=result.journey||{};
 const rows=priceRows.slice(0,12).map(x=>[x.productName||x.productNumber,
  money(x.previous.realizedPrice)+' → '+money(x.current.realizedPrice),
  pct(x.priceChangePct),n(x.exposedPreviousBuyers),n(x.returnedWithoutArticle),n(x.notSeenAgain),
  x.control?.status==='OBSERVATIONAL'?n(x.control.deltaPoints)+' pts':'Base insuffisante']);
 const traced=(journey.insights||[]).map(x=>[x.title,
  x.unit==='%'?pct(x.value):n(x.value)+' '+(x.unit||''),
  x.text,x.next]);
 const summary=journey.returning||{},visible=(journey.products||{});
 const productTransitions=(visible.stoppedPurchases||[]).slice(0,12).map(x=>[
  x.productName,x.productNumber,n(x.returnedButStoppedBuying),
  n(x.returnedStoreAmongPriorBuyers),pct(x.stoppedBuyingAmongReturnersPct),
  (x.newProductsBoughtInstead||[]).slice(0,2).map(y=>y.productName+' ('+y.clients+')').join('; ')||'Non déterminé'
 ]);
 const priceWatch=(visible.priceIncreases||[]).slice(0,12).map(x=>[
  x.productName,x.productNumber,money(x.previous.price)+' → '+money(x.current.price),
  pct(x.priceChangePct),n(x.previous.clients),pct(x.articleTicketChangePct),
  n(x.returnedButStoppedBuying),n(x.notObservedAmongPriorBuyers)
 ]);
 const cohorts=(journey.cohorts||[]).map(x=>[x.label,n(x.previous),n(x.returned),pct(x.returnRatePct),n(x.notObserved)]);
 const sections=[
  {title:'Clients observés, première visite et rétention',headline:n(c.observedPrevious)+' clients identifiés auparavant · '+pct(c.returnRate)+' revus',
   columns:['Indicateur','Valeur'],rows:[['Non revus',n(c.notObserved)],['Vus une fois dans la période antérieure',n(c.oneVisitPrevious)],['Non revus parmi ces clients',n(c.oneVisitNotObserved)+' ('+pct(c.oneVisitNotObservedRate)+')'],['Habitués non revus',n(c.repeatNotObserved)],['Exposés à un prix réalisé en hausse, non revus',n(c.priceIncreaseExposedNotObserved)]],
   lines:['La première visite est définie dans la fenêtre observée ; un historique depuis ouverture est nécessaire pour une vraie cohorte de première visite.']},
  {title:'Jus d’orange et poulet · prix et retour',headline:priceRows.length+' référence(s) identifiée(s). Analyse SKU par SKU, pas un prix moyen de produits différents.',
   columns:['Article','Prix TTC réalisé','Évolution prix','Anciens acheteurs','Revenus sans article','Non revus','Écart de retour vs autres'],rows,
   lines:['Écart de retour : différence descriptive, pas effet causal du prix. Les groupes peuvent différer en fidélité, panier ou promo.']},
  {title:'Hypothèses à départager',columns:['Facteur','Statut','Interprétation'],
   rows:(result.diagnosis||[]).map(x=>[x.label,({OBSERVATIONAL_SIGNAL:'Signal observé',MEASURED:'Mesuré',SOURCE_REQUIRED:'Source manquante',HYPOTHESIS:'À vérifier',DESCRIPTIVE:'Descriptif',NOT_DEMONSTRATED:'Non démontré',OBSERVED:'Observé'}[x.state]||x.state),x.evidence]),
   lines:result.limitations||[]}
 ];
 if(journey.version==='CUSTOMER_JOURNEY_V2'){
  sections.unshift(
   {title:'Ce qui explique réellement le changement observé',headline:'Indicateurs suivis des interprétations et vérifications nécessaires',
    columns:['Constat','Mesure','Lecture prudente','À vérifier'],rows:traced,
    lines:['Ce sont des constats descriptifs, pas des causes confirmées. Les facteurs prix, ruptures, assortiment, promotions et expérience peuvent se combiner.']},
   {title:'Avant / après : exactement les mêmes clients',headline:n(summary.returned)+' clients identifiés revus dans les deux périodes',
    columns:['Comportement','Avant','Après / évolution'],
    rows:[['Nombre de visites',n(summary.visitsBefore),n(summary.visitsAfter)],
      ['CA de ces clients',money(summary.spendBefore),money(summary.spendAfter)],
      ['Panier moyen',money(summary.averageBasketBefore),money(summary.averageBasketAfter)+' ('+pct(summary.averageBasketChangePct)+')'],
      ['Clients dont la fréquence recule',n(summary.returned),n(summary.frequencyDown)],
      ['Clients au panier moyen en baisse >10 %',n(summary.returned),n(summary.basketDown)],
      ['Clients ayant abandonné une référence',n(summary.returned),n(summary.ceasedAtLeastOneProduct)],
      ['Clients ayant adopté une nouvelle référence',n(summary.returned),n(summary.boughtNewProduct)]],
    lines:['Comparaison sur la population exactement commune aux deux fenêtres, sans mélange des nouveaux et des non-revus.']},
   {title:'Articles que les clients ne rachètent plus',headline:'Toutes les références observées, pas uniquement le jus ou le poulet',
    columns:['Article','Code','Revenus sans article','Acheteurs revenus','Abandon parmi revenus','Nouveaux achats associés'],
    rows:productTransitions,lines:['Achats nouveaux associés ne démontrent pas une substitution ; vérifier les familles et prix au même format.']},
   {title:'Hausses de prix à investiguer sur tout le catalogue',headline:'Prix payé comparable, hausse >=5 %, au moins 10 tickets par période',
    columns:['Article','Code','Prix réalisé','Hausse','Acheteurs avant','Évol. tickets','Revenus sans','Non revus'],
    rows:priceWatch,lines:['Prix réalisé incluant remises ≠ tarif catalogue. Il faut recouper prix officiel, calendrier promos, disponibilité et jour de changement.']},
   {title:'Rétention et promotions selon profil de départ',
    columns:['Segment client','Avant','Revenus','Taux de retour','Non revus'],rows:cohorts,
    lines:['Segments non exclusifs ; différences descriptives non ajustées à l’ancienneté, la fréquence et au mix.']}
  );
 }
 return{engine:'CUSTOMER_RESEARCH',status:result.status,providerDataSent:false,
 answer:(journey.version==='CUSTOMER_JOURNEY_V2'?
  'Analyse des mêmes clients, changements de panier, articles abandonnés, promotions et prix sur toutes les références : '+n(journey.evolution?.observedPrior)+' clients avant, '+n(journey.evolution?.returned)+' revus, '+n(journey.evolution?.nonObserved)+' non revus. '+n(journey.returning?.basketDown)+' clients revenus présentent un panier moyen en recul de plus de 10 %. Les hypothèses de prix, ruptures et offres doivent encore être départagées.':
  result.studyConclusion)+' Fenêtres : '+period.compareStart+' → '+period.compareEnd+' puis '+period.start+' → '+period.end+'.',
 sections,scope:stores.map(s=>s.name).join(' + '),period,suggestedSection:'crm',
 sources:[{id:'D365',name:'Tickets identifiés · paniers / prix payés · fenêtres exactes'}],researchStatus:result.status,causal:false}
}

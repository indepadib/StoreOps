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
 const churn=/ne revien|ne reven|plus revu|non revu|perdu|perte.*client|parti|retour|retention|une seule fois|premiere fois|abandonn|plus maintenant|attrition|rupture|causes|raisons/.test(q);
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
 const cacheKey=analyticsCacheKey('customer-research-v1',[scope,period.start,period.end,period.compareStart,period.compareEnd]);
 const result=await read(cacheKey);
 if(!result){
  return{engine:'CUSTOMER_RESEARCH',status:'NEEDS_RESEARCH',providerDataSent:false,
   answer:'Je comprends la demande : établir si les hausses de prix du jus d’orange et du poulet sont associées à une baisse de rétention, et isoler les clients venus une seule fois, ceux qui ne reviennent plus et ceux qui reviennent sans l’article. La preuve n’est pas encore préparée pour '+period.compareStart+' → '+period.compareEnd+' et '+period.start+' → '+period.end+'. Ouvrez Clients & CRM puis « Construire le rapport » : je ne substitue pas un simple classement CA à cette étude.',
   sections:[{title:'Investigation à préparer',headline:'Deux fenêtres exactes, mêmes magasins, tickets identifiés et produits comparables.',lines:['Prix TTC réellement payé ≠ tarif catalogue.','Ruptures historiques et concurrence : données datées nécessaires pour conclure.','Les clients non revus ne sont pas nécessairement perdus.']}],
   suggestedSection:'crm',sources:[],context:period}
 }
 const c=result.customers||{},group=kind=>result.products?.filter(p=>p.group===kind)||[],priceRows=[...group('JUICE_ORANGE'),...group('CHICKEN')];
 const rows=priceRows.slice(0,12).map(x=>[x.productName||x.productNumber,
  money(x.previous.realizedPrice)+' → '+money(x.current.realizedPrice),
  pct(x.priceChangePct),n(x.exposedPreviousBuyers),n(x.returnedWithoutArticle),n(x.notSeenAgain),
  x.control?.status==='OBSERVATIONAL'?n(x.control.deltaPoints)+' pts':'Base insuffisante']);
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
 return{engine:'CUSTOMER_RESEARCH',status:result.status,providerDataSent:false,
 answer:result.studyConclusion+' Fenêtres : '+period.compareStart+' → '+period.compareEnd+' puis '+period.start+' → '+period.end+'.',
 sections,scope:stores.map(s=>s.name).join(' + '),period,suggestedSection:'crm',
 sources:[{id:'D365',name:'Tickets identifiés · paniers / prix payés · fenêtres exactes'}],researchStatus:result.status,causal:false}
}

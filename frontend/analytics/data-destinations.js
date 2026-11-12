export const dataDestinations=[
 {id:'turnover',title:'CA, tickets et panier moyen',section:'sales',target:'salesDiagnostic',terms:'chiffre d affaires ca ttc ventes transactions variation baisse trafic',description:'Ventes · résultats et facteurs de variation'},
 {id:'store-comparison',title:'Comparer les magasins',section:'network',target:'storeBenchmark',terms:'ca chiffre d affaires magasin jour benchmark réseau exploitation',description:'Réseau · écarts par magasin'},
 {id:'category',title:'Performance article, rayon et catégorie',section:'categories',target:'productPerformance',terms:'category manager catman marge mix g kg unité assortiment',description:'Produits & catégories · contributions et filtres'},
 {id:'service',title:'Taux de service fournisseur',section:'suppliers',target:'supplierServiceDefinition',terms:'achats acheteur direction achats réception commandé reçu taux service fournisseur',description:'Fournisseurs · taux et couverture des réceptions'},
 {id:'purchase',title:'Proposer un PO ou un TO',section:'replenishment',target:'replenishmentPanel',terms:'achat commande fournisseur transfert entrepôt magasin approvisionnement min max',description:'Réapprovisionnement · propositions calculées'},
 {id:'availability',title:'Ruptures, stocks négatifs et couverture',section:'inventory',target:'inventoryIntelligence',terms:'exploitation disponibilité inventaire stock rupture',description:'Stock · disponibilité et anomalies'},
 {id:'historical-range',title:'Assortiment et réceptions historiques',section:'detention',target:'detentionViews',terms:'détention articles reçus référencement article magasin entrepôt',description:'Détention · présence sur le référentiel historique'},
 {id:'promotion',title:'Ventes et remises promotionnelles',section:'promotions',target:'promotionIntelligence',terms:'marketing promo offre impact promotion discount',description:'Promotions · ventes, remises et mesure'},
 {id:'retention',title:'Clients non revus et paniers avant/après',section:'crm',target:'customerResearch',terms:'marketing fidélité rétention cohortes clients paniers avant après non retour fréquence',description:'Clients & CRM · étude par période'},
 {id:'identification',title:'Identification des clients et cartes fidélité',section:'loyalty',target:'loyaltyIntelligence',terms:'fidélité recrutement inscription enrôlement carte nouveaux comptes client',description:'Fidélité · tickets identifiés et données du programme'},
 {id:'price',title:'Prix article et conditions commerciales',section:'sales',target:'pricingLab',terms:'prix pricing promotion trade agreement tarif ean article',description:'Ventes · prix applicable par article, magasin et date'},
 {id:'catalog',title:'Fiche article et hiérarchie D365',section:'reference',target:'referenceSearch',terms:'ean sku code interne référentiel article fournisseur unité rayon famille',description:'Référentiel · caractéristiques et classement'},
 {id:'cashier-results',title:'Résultats par caissier',section:'cashiers',target:'cashierIntelligence',terms:'caissiers caisse tickets identification recrutement équipe',description:'Caissiers · tickets et identification par personne'},
];

export const normalizeSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ignored=new Set(['a','au','aux','avec','d','de','des','du','et','l','la','le','les','mes','par','pour','sur','un','une']);
export function rankDestinations(entries,value){
 const query=normalizeSearch(value);
 const tokens=query.split(' ').filter(token=>token&&!ignored.has(token));
 return entries.map(entry=>{
  const title=normalizeSearch(entry.title),description=normalizeSearch(entry.description),terms=normalizeSearch(entry.terms);
  const words=new Set((title+' '+description+' '+terms).split(' '));
  const match=tokens.length&&tokens.every(token=>words.has(token)||token.length>3&&[...words].some(word=>word.startsWith(token)));
  const score=!query?1:title===query?12:title.startsWith(query)?10:title.includes(query)?8:match?6:terms.includes(query)?4:description.includes(query)?2:0;
  return {...entry,score};
 }).filter(entry=>entry.score>0).sort((a,b)=>b.score-a.score);
}

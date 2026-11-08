// Retail Intelligence semantic contract v1. Pure module consumed by API and AI.
// Definitions are not observations: a metric is publishable only when its
// required source is present and its quality requirements pass for the scope.
const kpi=(id,domain,label,formula,unit,source,availability,warning='',aliases=[])=>Object.freeze({id,domain,label,formula,unit,source,availability,warning,aliases});
export const semanticMetrics=Object.freeze([
 kpi('sales_ttc','VENTES','Chiffre d’affaires TTC','Somme des montants de lignes de vente incluses selon le mapping de ventes Dynamics','DH','D365 RetailTransactionSalesTransBIEntities','SOURCE_CHECK','À rapprocher avec Retail & Commerce : annulations, retours, no-sale et filtres fiscaux.', ['ca','chiffre affaires','ventes ttc']),
 kpi('sales_ht','VENTES','Chiffre d’affaires HT','CA TTC moins taxes de ligne, uniquement avec champ fiscal et périmètre complet','DH','D365 ventes + taxes','CONDITIONAL','Ne pas convertir le TTC en HT avec un taux supposé.', ['ca ht','chiffre affaires ht']),
 kpi('tickets','VENTES','Nombre de tickets','Nombre de transactions commerciales distinctes, selon règles d’inclusion D365','tickets','D365 ventes','SOURCE_CHECK','Un ticket n’est pas un client unique.', ['frequentation','nombre tickets']),
 kpi('average_basket','VENTES','Panier moyen TTC','CA TTC / nombre de tickets valides','DH/ticket','D365 ventes','DERIVED','Non calculable si aucun ticket.', ['panier moyen','valeur panier']),
 kpi('sales_per_day','VENTES','CA TTC par jour calendaire','CA TTC / nombre de jours calendaires inclus dans la période','DH/jour','D365 ventes + période','DERIVED','Ce n’est pas le CA par jour d’ouverture.', ['ca jour','ventes par jour','ca quotidien']),
 kpi('tickets_per_day','VENTES','Tickets par jour calendaire','Nombre de tickets / nombre de jours calendaires de la période','tickets/jour','D365 ventes + période','DERIVED','Prudence pour une journée en cours.', ['tickets jour','frequentation quotidienne']),
 kpi('sales_change_pct','ÉVOLUTION','Évolution du CA','(CA période − CA comparaison) / |CA comparaison| × 100','%','D365 ventes N et comparaison','DERIVED','N/D si CA de comparaison égal à zéro. Durées et jours comparables.', ['evolution ca','variation ca','croissance ventes']),
 kpi('sales_delta','ÉVOLUTION','Écart de CA','CA période − CA comparaison','DH','D365 ventes N et comparaison','DERIVED','Décomposer les écarts avant toute conclusion causale.', ['ecart ca','variation ventes dh']),
 kpi('traffic_effect','ÉVOLUTION','Effet fréquentation estimé','(Tickets N − Tickets comparaison) × panier moyen comparaison','DH','D365 ventes N et comparaison','DERIVED','Décomposition arithmétique, pas une preuve de causalité.', ['effet frequentation','effet tickets']),
 kpi('basket_effect','ÉVOLUTION','Effet panier estimé','Tickets N × (panier moyen N − panier moyen comparaison)','DH','D365 ventes N et comparaison','DERIVED','Effet fréquentation + effet panier = variation CA, sous données complètes.', ['effet panier']),
 kpi('sales_share','MIX','Poids dans le CA','CA article, magasin ou rayon / CA total du même périmètre × 100','%','D365 ventes + hiérarchie','DERIVED','Ne jamais mélanger réseau et magasins dans le même dénominateur.', ['poids ca','poids du ca','part du ca','contribution ca','part de ventes']),
 kpi('abc_class','MIX','Classe ABC par CA','A jusqu’à 80 % du CA positif cumulé ; B jusqu’à 95 % ; C au-delà','classe','D365 ventes + classement articles','DERIVED','Seuils conventionnels ; ne mesure ni marge ni fréquence.', ['abc','pareto']),
 kpi('units_sold','MIX','Quantités vendues','Somme des quantités de vente en unité homogène','unité','D365 ventes + unités','CONDITIONAL','Ne pas additionner G, KG, unités et litres.', ['quantites vendues','volume ventes']),
 kpi('realized_price','PRIX','Prix moyen réalisé','CA TTC article / quantité vendue dans la même unité','DH/unité','D365 lignes de vente','CONDITIONAL','Prix réalisé, pas tarif catalogue. Les mélanges d’unités bloquent la mesure.', ['prix moyen realise','prix paye']),
 kpi('price_effect','PRIX','Effet prix / mix estimé','Quantité N × (prix moyen N − prix moyen comparaison)','DH','D365 lignes de vente','CONDITIONAL','Uniquement unités comparables ; prix moyen varie aussi avec remises et mix.', ['effet prix','effet mix prix']),
 kpi('volume_effect','PRIX','Effet volume estimé','(Quantité N − quantité comparaison) × prix moyen comparaison','DH','D365 lignes de vente','CONDITIONAL','N/D si unité de vente non comparable.', ['effet volume']),
 kpi('promotion_sales','PROMOTIONS','CA réalisé avec remise','CA des lignes identifiées comme remisées sur les tickets','DH','D365 lignes de vente, champs remise','CONDITIONAL','Une vente remisée n’est pas nécessairement une vente incrémentale.', ['ca remisé','ventes promo','ca promotion']),
 kpi('promotion_sales_share','PROMOTIONS','Poids du CA remisé','CA sur lignes avec remise / CA TTC total × 100','%','D365 ventes + remise','CONDITIONAL','Mesure la dépendance aux remises, pas le ROI promo.', ['poids ca remisé','poids du ca remis','poids du ca remisé','part du ca remisé','taux promo','part ca promo']),
 kpi('promotion_tickets','PROMOTIONS','Tickets avec promotion','Nombre de tickets distincts avec au moins une ligne remisée','tickets','D365 lignes et tickets','CONDITIONAL','Nécessite identifiants de tickets et champs remise fiables.', ['tickets promo','tickets avec remise']),
 kpi('discount_amount','PROMOTIONS','Montant des remises','Somme des remises de lignes selon la convention de signe D365','DH','D365 lignes, montants de remise','CONDITIONAL','Attention double décompte entre promotions périodiques et remises lignes.', ['montant remises','valeur remises']),
 kpi('identified_sales','FIDÉLITÉ','CA identifié','CA lié à un compte client identifié dans les ventes','DH','D365 ventes + identifiant client','CONDITIONAL','Anonymes exclus. Vérifier couverture du champ client.', ['ca fidelise','ca identifie']),
 kpi('identified_sales_share','FIDÉLITÉ','Poids du CA identifié','CA identifié / CA TTC total × 100','%','D365 ventes + identifiant client','CONDITIONAL','La somme clients n’est pas une preuve de recrutement fidélité.', ['poids ca fidelise','poids du ca fidelise','poids du ca identifie','part du ca identifie','part ca identifie']),
 kpi('identified_ticket_rate','FIDÉLITÉ','Taux de tickets identifiés','Tickets avec client identifié / total de tickets × 100','%','D365 tickets + identifiant client','CONDITIONAL','Ce taux est différent du taux de recrutement sur tickets non encartés.', ['taux identification','tickets identifies']),
 kpi('recruitment_rate','FIDÉLITÉ','Taux de recrutement sur éligibles','Nouvelles adhésions attribuées / tickets éligibles non encartés × 100','%','Événements de recrutement + tickets éligibles','NEEDS_SOURCE','Non calculable sur la seule table de ventes sans événements d’adhésion.', ['taux recrutement','recrutement fidélité']),
 kpi('distinct_identified_customers','CLIENTS','Clients distincts identifiés','Nombre de comptes clients identifiés distincts sur la fenêtre','clients','D365 ventes, compte client','CONDITIONAL','Ne compte pas les clients anonymes ; dédoublonnage entre magasins requis.', ['clients distincts','nombre clients']),
 kpi('customer_return_rate','CLIENTS','Taux de retour observé','Clients identifiés de la période précédente revus / clients identifiés précédents × 100','%','Cohortes tickets identifiés, périodes comparables','CONDITIONAL','Non-revu sur fenêtre ne signifie pas client définitivement perdu.', ['retour clients','retention clients','taux de retour']),
 kpi('basket_penetration','PANIERS','Pénétration article dans les paniers','Tickets contenant l’article / tickets analysés × 100','%','Tickets détaillés préparés','CONDITIONAL','Ne pas afficher 0 lorsque les preuves paniers sont indisponibles.', ['penetration article','presence panier']),
 kpi('basket_affinity_lift','PANIERS','Lift d’association de panier','P(A et B) / [P(A) × P(B)]','indice','Tickets détaillés préparés','CONDITIONAL','Affinité statistique, pas causalité ou recommandation automatique.', ['lift','association articles']),
 kpi('gross_margin_ht','MARGE','Marge brute HT','CA HT valorisé − coût de revient sur unités inventaire converties','DH','D365 ventes + base HT + coût transactionnel','CONDITIONAL','Bloquer si couverture coûts/base HT insuffisante ; g/kg à vérifier. Ne pas publier marge totale extrapolée.', ['marge','marge brute']),
 kpi('gross_margin_rate','MARGE','Taux de marge brute HT','Marge brute HT / CA HT valorisé × 100','%','D365 coût, taxes et ventes','CONDITIONAL','Le taux sur seules ventes couvertes n’est pas le taux global.', ['taux marge','taux de marge','taux de marge brute']),
 kpi('cost_coverage','QUALITÉ','Couverture des coûts','CA dont le coût est valorisable / CA total du même périmètre × 100','%','D365 coût et ventes','CONDITIONAL','Ne pas confondre couverture des coûts et certitude comptable.', ['couverture cout','cout couvert']),
 kpi('stockout_current','STOCK','Rupture de stock actuelle','Références actives avec stock disponible = 0, selon périmètre et configuration','articles','D365 stocks et assortiment','CONDITIONAL','Une photo de stock actuelle ne permet pas d’expliquer une vente historique.', ['rupture','stock zero']),
 kpi('on_hand_available','STOCK','Stock disponible actuel','Stock physique moins quantités réservées selon mapping du magasin','unités','D365 OnHand, dimensions magasin/entrepôt','CONDITIONAL','Stock actuel ; unités et dimensions à contrôler avant approvisionnement.', ['stock disponible'])
]);
export const semanticVersion='RI-SEMANTIC-1.0';
export const semanticPublicModel=()=>({
 version:semanticVersion,
 principle:'Un indicateur absent n’est jamais égal à zéro. Chaque réponse cite sa source, son unité, sa fenêtre et sa limite.',
 metrics:semanticMetrics.map(({aliases,...m})=>m),
 domains:[...new Set(semanticMetrics.map(x=>x.domain))],
 coverageLevels:{SOURCE_CHECK:'Rapprochement métier nécessaire',DERIVED:'Calcul à partir des données disponibles',CONDITIONAL:'Affiché uniquement si la source est complète',NEEDS_SOURCE:'Source supplémentaire requise'}
});
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,' ').replace(/[^a-z0-9% ]+/g,' ').replace(/\s+/g,' ').trim();
export function lookupSemanticMetrics(query,{limit=3}={}){
 const q=norm(query);
 if(!q)return[];
 const scored=semanticMetrics.map(m=>{
  const candidates=[m.label,...m.aliases].map(norm);
  const exact=candidates.some(x=>q===x),mentioned=candidates.filter(x=>x.length>=3&&q.includes(x));
  const strength=Math.max(...mentioned.map(s=>s.length),0);
  return{metric:m,score:exact?1000+strength:strength};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 return scored.slice(0,limit).map(x=>x.metric)
}
export function semanticDefinitionAnswer(question){
 const q=norm(question);
 if(!/(comment.*calcul|comment.*mesur|formule|definition|que signifie|que veut dire|c est quoi|explique moi le kpi|quelle.*difference.*entre)/.test(q))return null;
 const found=lookupSemanticMetrics(question,{limit:3});
 if(!found.length)return null;
 const sections=found.map(m=>({
  title:m.label,
  headline:m.formula,
  columns:['Contrat','Définition'],rows:[['Unité',m.unit],['Périmètre',m.domain],['Source',m.source],['Disponibilité',m.availability]],
  lines:[m.warning||'À vérifier sur le périmètre sélectionné.'],
  actions:[]
 }));
 return{answer:'Dictionnaire sémantique StoreOps · définitions et conditions de validité, sans chiffres inventés.',engine:'QUERY_GROUNDED',providerDataSent:false,aiPlanUsed:false,semanticVersion,sections,sources:[{id:'S0',name:'Catalogue de définitions StoreOps'}]}
}

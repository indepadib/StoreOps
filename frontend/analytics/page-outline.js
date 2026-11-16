export const pageOutline={
 overview:[['Chiffres clés','briefKpis'],['Points à surveiller','briefGrid'],['Qualité des données','briefQuality']],
 sales:[['Résultats','decisionSalesKpis'],['Tickets et panier','salesDriversWaterfall'],['Détail par jour et magasin','salesProof'],['Ventes par heure','hourlyDepartmentFilter'],['Prix et concurrence','pricingLab']],
 network:[['Synthèse','benchmarkSummary'],['Comparaison','benchmarkVisual'],['Tableau magasins','benchmarkBody']],
 categories:[['Synthèse filtrée','performanceQuadrants'],['Tableau et export','performanceTableTools']],
 suppliers:[['Indicateurs','supplierKpis'],['Actions','supplierActions'],['Tableau fournisseurs','supplierBody'],['Taux de service','supplierServiceDefinition']],
 crm:[['Indicateurs','crmKpis'],['Étude avant/après','customerResearch'],['Cohortes','crmCohorts'],['Liste clients','crmBody']],
 loyalty:[['Indicateurs','loyaltyKpis'],['Détail par magasin','loyaltyBody'],['Couverture','loyaltyCoverage']],
 cashiers:[['Indicateurs','cashierSummary'],['Résultats par personne','cashierBody']],
 promotions:[['Indicateurs','promotionKpis'],['Offres','promotionOfferBody'],['Articles','promotionBody'],['Mesure et preuve','promotionMeasurement']],
 inventory:[['Indicateurs','inventoryKpis'],['Articles et anomalies','inventoryBody'],['Démarque et inventaire','lossInventory']],
 detention:[['Historique de réception','detentionViews'],['Stock par article','bi-stockRows']],
 replenishment:[['Choisir le flux','replenishmentPanel'],['Résultat de la proposition','replenishmentResult']],
 reference:[['Recherche article','referenceSearch'],['Couverture','referenceSummary'],['Détail article','referenceTable']],
};

export function jumpToPagePanel(target,{showAll,reduceMotion=false}={}){
 if(!target||target.closest('[hidden]'))return false;
 if(!target.getClientRects().length)showAll?.();
 if(!target.getClientRects().length)return false;
 if(target.tabIndex<0&&!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
 target.focus({preventScroll:true});
 target.scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'start'});
 return true;
}

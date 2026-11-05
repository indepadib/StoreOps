const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function articlePerformanceQuestion(question){
 const q=norm(question);
 return /pourquoi|expliqu|raison|probleme|mal|pas bien|moins|baisse|chute|ralenti|ne.*plus/.test(q)&&/vend|vente|achat|demande|panier|client|performance|marche/.test(q);
}
export function requiresArticleInvestigation(input={}){
 const q=norm(input.question);if((q.match(/\b[a-z]{1,8}-(?=[a-z0-9_.-]*\d)[a-z0-9_.-]{2,48}\b/g)||[]).length>1)return false;if(input.analysisMode==='ARTICLE_IMPACT')return true;const article=/\b[a-z]{1,8}-(?=[a-z0-9_.-]*\d)[a-z0-9_.-]{2,48}\b|jus|poulet|cet article|ce produit/.test(q)||/[«"]/.test(String(input.question));
 if(/\btop\b|classement|meilleurs|liste des|tous les articles/.test(q))return false;
 const impact=/impact|effet|elasticit|sensibilit/.test(q)&&/prix|tarif|client|panier/.test(q),returning=/client|acheteur|habitue/.test(q)&&/reven|revien|revu|retour|rachat|reachat|rachet|perdu|perte|ne.*plus/.test(q),performance=articlePerformanceQuestion(q);
 const generic=new Set('pourquoi comment explique expliquer raison raisons probleme probleme est ce que le la les des du de une un nos notre mon mes se ne pas plus moins bien mal vend vends vendent vente ventes vendu vendue baisse baissent chute chutent ralenti panier paniers moyen moyens client clients performance activite demande achat achats marche ca chiffre affaires quel quelle quels quelles impact effet effets prix tarifs tarif hausse hausses changement sensibilite elasticite sont etaient ils elles identifie identifies identifiees retour retours revenu revenus reviennent revien revus acheteur acheteurs habitue habitues perdu perdus perte pertes rachat reachat rachetent malgre avec sans depuis pendant toujours autant autant cette cet ces sur dans pourquoi expliquez baisse baissees diminue diminuent recule reculent promo promos promotion promotions fidelite fidelises identification recurrent recurrence globale general generale aujourd hier semaine mois'.split(' '));
 const namedPerformance=(performance||impact||returning&&/acheteurs? (?:du |de |d[’'])/.test(q))&&!/magasin|reseau|categorie|departement|rayon|fournisseur|caissier|frequentation|\bpgc\b|\bapls\b|\bfleg\b|\bimport\b|\blocal\b/.test(q)&&q.split(/[^a-z0-9]+/).some(w=>w.length>2&&!generic.has(w));
 const follow=!!input.followUp?.article&&!(performance&&!article&&/magasin|reseau|departement|categorie/.test(q))&&/^(et\b|idem\b|pareil\b|pour ce\b|sur ce\b|cote\b)/.test(q);
 return article&&(impact||returning||performance)||namedPerformance||follow;
}

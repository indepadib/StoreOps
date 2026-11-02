const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function articlePerformanceQuestion(question){
 const q=norm(question);
 return /pourquoi|expliqu|raison|probleme|mal|pas bien|moins|baisse|chute|ralenti|ne.*plus/.test(q)&&/vend|vente|achat|demande|panier|client|performance|marche/.test(q);
}
export function requiresArticleInvestigation(input={}){
 if(input.analysisMode==='ARTICLE_IMPACT')return true;
 const q=norm(input.question),article=/\b[a-z]{1,8}-(?=[a-z0-9_.-]*\d)[a-z0-9_.-]{2,48}\b|jus|poulet|cet article|ce produit/.test(q)||/[«"]/.test(String(input.question));
 if(/\btop\b|classement|meilleurs|liste des|tous les articles/.test(q))return false;
 const impact=/impact|effet|elasticit|sensibilit/.test(q)&&/prix|tarif|client|panier/.test(q),returning=/client|acheteur|habitue/.test(q)&&/reven|revien|revu|retour|rachat|reachat|rachet|perdu|perte|ne.*plus/.test(q),performance=articlePerformanceQuestion(q);
 const namedPerformance=performance&&!/magasin|reseau|categorie|departement|rayon|fournisseur|caissier|frequentation|nos clients|les clients/.test(q);
 const follow=!!input.followUp?.article&&!(performance&&!article&&/magasin|reseau|departement|categorie/.test(q))&&/^(et\b|idem\b|pareil\b|pour ce\b|sur ce\b|cote\b)/.test(q);
 return article&&(impact||returning||performance)||namedPerformance||follow;
}

// H&S contract reading: evidence-aware aggregation of specialized model passes.
// No numbers are certified; unresolved conflicts remain visible to a human reviewer.
const txt=(x,n=500)=>String(x??'').trim().slice(0,n);
const normalizeKey=x=>txt(x,1500).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').replace(/[^\p{L}\p{N}%]/gu,'').slice(0,350);
const list=x=>Array.isArray(x)?x:[];
const TOPICS=[
  ['Identité fournisseur','identity',/fournisseur|prestataire|distributeur|parties|raison sociale|siret|ice|rc\b/i],
  ['Durée, renouvellement et préavis','validity',/durée|date d'effet|échéance|renouvellement|reconduction|préavis|résiliation|expiration/i],
  ['Prix, remises sur facture et révisions','pricing',/prix|tarif|remise|rabais|ristourne|révision|indexation|promotion/i],
  ['RFA, marges arrière et assiette','rebates',/rfa|marge arrière|coopération commerciale|ristourne annuelle|remise de fin d'année|bonus|seuil|palier/i],
  ['Facturation, paiement et avoirs','payments',/factur|paiement|règlement|avoir|crédit|délais de paiement|compensation/i],
  ['Logistique, livraison et retour','logistics',/livraison|transport|retour|réception|rupture|stock|commande|franco|pénurie/i],
  ['Pénalités, garanties et qualité','penalties',/pénalité|indemnité|non-conformité|qualité|garantie|litige|responsabilité/i],
  ['Exclusivité et périmètre enseignes','exclusivity',/exclusivité|territoire|enseigne|magasin|réseau|groupe|périmètre/i],
  ['Annexes et justificatifs','annexes',/annexe|avenant|appendice|barème|grille tarifaire|pièce jointe|justificatif/i],
];
const uniqueBy=(rows,key,limit)=>{
  const out=[],used=new Set();
  for(const r of rows){
    const k=key(r);
    if(!k||used.has(k))continue;
    used.add(k);out.push(r);
  }
  return{items:out.slice(0,limit),dropped:Math.max(0,out.length-limit)};
};
const evidenceKey=r=>normalizeKey(r.quote||'')?
  'q:'+normalizeKey(r.quote)+'|'+normalizeKey(r.page):
  't:'+normalizeKey(r.title)+'|'+normalizeKey(r.details)+'|'+normalizeKey(r.page);
const obligationKey=r=>normalizeKey(r.title)+'|'+txt(r.dueDate||'');
const tierKey=r=>txt(r.threshold)+'|'+txt(r.rateBps)+'|'+normalizeKey(r.quote);
const clauseList=x=>list(x).filter(r=>r&&typeof r==='object');
function choose(a,b,name,conflicts){
  const v=a??null,w=b??null;
  if(v!==null&&v!==''&&w!==null&&w!==''&&String(v).trim().toUpperCase()!==String(w).trim().toUpperCase()){
    conflicts.push({field:name,commercial:txt(v,150),operational:txt(w,150),
      note:'Les deux lectures divergent : vérifier le PDF avant de reprendre cette valeur.'});
    return null;
  }
  return v||w||null;
}
function classify(clauses,risks,obligations,references){
  const evidence=[...clauses,...risks,...obligations];
  const titles=evidence.map(r=>txt(r.title)+' '+txt(r.details||'')+' '+txt(r.quote||''));
  const statuses=TOPICS.map(([label,id,rx])=>{
    const matches=evidence.filter((r,i)=>rx.test(titles[i]||''));
    const cited=matches.filter(r=>r.page&&r.quote).length;
    let state=matches.length?'MENTIONED':'NOT_VERIFIED';
    if(id==='rebates'&&references.rebateTiers?.length)state='MENTIONED';
    if(id==='payments'&&references.paymentTermsDays!==null)state='MENTIONED';
    if(id==='validity'&&references.startDate&&references.endDate)state='MENTIONED';
    if(id==='identity'&&references.supplierName)state='MENTIONED';
    return{topic:id,label,status:state,evidenceCount:matches.length,citedCount:cited};
  });
  return statuses;
}
export function consolidateReadings(commercial,operational){
  if(!commercial||!operational)throw Error('Les deux lectures spécialisées sont requises.');
  const conflicts=[],qualityIssues=[];
  const fields=['supplierName','title','startDate','endDate','currency','paymentTermsDays','rebateMode','rebateBase'];
  const combined={...commercial};
  for(const field of fields)combined[field]=choose(commercial[field],operational[field],field,conflicts);
  combined.summary=[commercial.summary,operational.summary].filter(Boolean).map(x=>txt(x,2200)).join('\n\n');
  const merged={};
  for(const [k,key,cap] of [
    ['clauses',evidenceKey,70],['obligations',obligationKey,50],['risks',evidenceKey,40],
    ['rebateTiers',tierKey,30]
  ]){
    merged[k]=uniqueBy([...clauseList(commercial[k]),...clauseList(operational[k])],key,cap);
    if(merged[k].dropped)qualityIssues.push(k+': '+merged[k].dropped+' éléments au-delà de la limite de restitution');
    combined[k]=merged[k].items;
  }
  combined.missing=uniqueBy([...list(commercial.missing),...list(operational.missing)]
    .map(x=>txt(x,220)).filter(Boolean),normalizeKey,50).items;
  const emptyEvidence=[...combined.clauses,...combined.risks,...combined.obligations]
    .filter(x=>!x.quote||!x.page).length;
  const unprovenTiers=combined.rebateTiers.filter(x=>!x.quote||!x.page).length;
  if(emptyEvidence)qualityIssues.push(emptyEvidence+' point(s) sans citation complète et numéro de page');
  if(unprovenTiers)qualityIssues.push(unprovenTiers+' palier(s) RFA sans preuve vérifiable');
  if(conflicts.length)qualityIssues.push(conflicts.length+' divergence(s) entre lectures spécialisées');
  if(!combined.supplierName)qualityIssues.push('Fournisseur non confirmé');
  if(!combined.startDate||!combined.endDate)qualityIssues.push('Dates de validité non confirmées');
  if(combined.rebateTiers.length&&!combined.rebateMode)qualityIssues.push('Méthode de calcul des RFA ambiguë');
  if(combined.rebateTiers.length&&!combined.rebateBase)qualityIssues.push('Assiette des RFA non confirmée');
  const coverage=classify(combined.clauses,combined.risks,combined.obligations,combined);
  const unverified=coverage.filter(x=>x.status==='NOT_VERIFIED').map(x=>x.label);
  if(unverified.length)qualityIssues.push('Domaines à relire : '+unverified.join(' ; '));
  // No synthetic accuracy score: coverage only means "mentioned", not "correct".
  combined.quality={
    version:2,status:'HUMAN_REVIEW_REQUIRED',passCount:2,
    passes:['COMMERCIAL_FINANCIAL','LEGAL_OPERATIONS'],conflicts,
    uncitedPoints:emptyEvidence+unprovenTiers,coverage,
    gaps:unverified,warnings:qualityIssues,
    limits:'Une mention détectée ne prouve ni exactitude ni exhaustivité. Vérifier document, annexes et avenants.',
    humanReviewRequired:true
  };
  combined.guidance='Proposition non certifiée, non exhaustive : vérifier chaque taux, seuil, date et preuve dans le PDF source et ses annexes.';
  return combined;
}
export const readingTopics=TOPICS.map(([label,id])=>({label,id}));

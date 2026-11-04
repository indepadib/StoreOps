// Shared, source-evidence-first reading. Never imply that AI fields are certified.
const items=x=>Array.isArray(x)?x:[];
const asNumber=n=>Number.isFinite(Number(n))?new Intl.NumberFormat('fr-MA',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(n)):'—';
export function renderDetailedReading(a,e){
  if(!a||typeof a!=='object')return '';
  const safe=x=>e(String(x??''));
  const quote=(r)=>'<div class="hqr-source">'+
    (r.quote?'« '+safe(r.quote)+' »':'<strong>Extrait justificatif non fourni</strong>')+
    '<span>Page : '+safe(r.page||'non précisée')+'</span></div>';
  const quality=a.quality,coverage=items(quality?.coverage);
  const proofList=entries=>entries.map(x=>
    '<article class="hqr-entry"><strong>'+safe(x.title||'Clause sans intitulé')+'</strong>'+
    (x.kind?'<small>'+safe(x.kind)+(x.dueDate?' · Échéance : '+safe(x.dueDate):'')+(x.owner?' · '+safe(x.owner):'')+'</small>':'')+
    (x.details?'<p>'+safe(x.details)+'</p>':'')+
    quote(x)+'</article>').join('');
  let result='<div class="hqr">';
  result+='<section class="hqr-quality"><div class="hqr-subtitle">Contrôle de couverture <span>Vérification humaine indispensable</span></div>';
  if(!quality){
    result+='<p class="hqr-warning">Ancienne analyse courte : aucune vérification de couverture disponible. Relancer une lecture approfondie pour examiner séparément les finances et les clauses opérationnelles.</p>';
  }else{
    result+='<p class="hqr-note">Lecture '+safe(quality.passCount||'?')+' passes : conditions commerciales, puis juridique et opérations. « Mentionné » ne signifie pas « vérifié ».</p>';
    result+='<div class="hqr-coverage">'+coverage.map(x=>
      '<div class="hqr-topic '+(x.status==='MENTIONED'?'hqr-mentioned':'hqr-unverified')+'">'+
      '<span>'+safe(x.label)+'</span><strong>'+(x.status==='MENTIONED'?'Mention détectée':'À contrôler')+'</strong>'+
      '</div>').join('')+'</div>';
    if(items(quality.conflicts).length){
      result+='<div class="hqr-conflict"><strong>Contradictions à résoudre</strong>'+
      items(quality.conflicts).map(c=>'<div><strong>'+safe(c.field)+'</strong> : lecture commerciale « '+
        safe(c.commercial)+' » / opérationnelle « '+safe(c.operational)+' ».</div>').join('')+'</div>';
    }
    const warnings=items(quality.warnings);
    if(warnings.length)result+='<details class="hqr-more" open><summary>'+warnings.length+' point(s) à vérifier</summary><ul>'+
      warnings.map(x=>'<li>'+safe(x)+'</li>').join('')+'</ul></details>';
  }
  result+='</section>';
  result+='<section class="hqr-section"><div class="hqr-subtitle">Conditions financières et marges arrière</div>'+
    '<div class="hqr-financial"><div><small>Assiette contractuelle proposée</small><strong>'+safe(a.rebateBase||'Non identifiée')+'</strong></div>'+
    '<div><small>Mode de calcul proposé</small><strong>'+safe(a.rebateMode||'Non identifié')+'</strong></div>'+
    '<div><small>Conditions de paiement</small><strong>'+(a.paymentTermsDays==null?'À vérifier':safe(a.paymentTermsDays)+' jours')+'</strong></div>'+
    '<div><small>Devise détectée</small><strong>'+safe(a.currency||'À vérifier')+'</strong></div></div>';
  if(items(a.rebateTiers).length){
    result+='<div class="hqr-table-wrap"><table class="hqr-table"><thead><tr><th>Seuil</th><th>Taux RFA</th><th>Preuve et page</th></tr></thead><tbody>'+
      items(a.rebateTiers).map(t=>'<tr><td>'+asNumber(t.threshold)+' '+safe(a.currency||'')+'</td>'+
        '<td><strong>'+asNumber(Number(t.rateBps)/100)+' %</strong></td><td>'+quote(t)+'</td></tr>').join('')+
      '</tbody></table></div>';
  }else result+='<p class="hqr-warning">Aucun palier RFA identifié. Cela ne prouve pas que le contrat ne prévoit pas de marges arrière : vérifier les annexes, grilles et avenants.</p>';
  result+='</section>';
  result+='<section class="hqr-section"><div class="hqr-subtitle">Obligations et échéances ('+items(a.obligations).length+')</div>'+
    (items(a.obligations).length?proofList(items(a.obligations)):
      '<p class="hqr-warning">Aucune obligation extraite : vérifier les échéances contractuelles et annexes.</p>')+'</section>';
  result+='<details class="hqr-more" open><summary>Clauses commerciales, juridiques et opérationnelles ('+items(a.clauses).length+')</summary>'+
    (items(a.clauses).length?proofList(items(a.clauses)):'<p class="hqr-warning">Aucune clause structurée détectée.</p>')+'</details>';
  result+='<details class="hqr-more" open><summary>Risques et points d’attention ('+items(a.risks).length+')</summary>'+
    (items(a.risks).length?proofList(items(a.risks)):
      '<p class="hqr-note">Aucun risque détecté par l’IA ne garantit pas l’absence de risque.</p>')+'</details>';
  if(items(a.missing).length)result+='<details class="hqr-more" open><summary>Éléments absents ou ambigus ('+items(a.missing).length+')</summary><ul>'+
    items(a.missing).map(x=>'<li>'+safe(x)+'</li>').join('')+'</ul></details>';
  return result+'<p class="hqr-footnote">Ce relevé est une aide à la lecture, pas une certification. Les clauses non identifiées peuvent toujours exister dans le document, ses annexes ou ses avenants.</p></div>';
}

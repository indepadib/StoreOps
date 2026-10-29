const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const finite=v=>v!=null&&Number.isFinite(Number(v));
const num=v=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(v);
export function rankingIntent(question){
 const q=norm(question);if(!/top\b|meilleur|moins vendu|plus vendu|classement|premier|flop|plus forte|plus faible/.test(q))return null;
 const entity=/categorie|departement|rayon|famille/.test(q)?'categories':/magasin|reseau/.test(q)&&!/produit|article|reference/.test(q)?'stores':'products';
 const count=Math.min(50,Math.max(1,Number(q.match(/\b(\d{1,3})\b/)?.[1]||10)));
 const metric=/marge/.test(q)?'marginValue':/volume|quantite|unite|plus vendu|moins vendu/.test(q)?'units':/progress|croissance|hausse|baisse|variation|contribut|chute/.test(q)?'delta':'sales';
 const ascending=/flop|moins|faible|baisse|chute|pire/.test(q);
 const codes=[...new Set((String(question).toUpperCase().match(/\b[A-Z]{1,8}-[A-Z0-9_.-]{1,48}\b/g)||[]))];
 const storeHint=/val[ -]?fleuri/.test(q)?'val fleuri':/trefle/.test(q)?'trefle':null;
 const level=/departement/.test(q)?'department':/famille/.test(q)?'family':'rayon';
 return{entity,count,metric,ascending,codes,storeHint,level};
}
export function rankedAnswer(question,f){
 const intent=rankingIntent(question);if(!intent)return null;
 const {entity,count,metric,ascending,codes,storeHint,level}=intent;
 if(entity==='products'&&/fournisseur|categorie|rayon|famille|departement|\bpgc\b|penetration|ticket|panier/.test(norm(question)))return{answer:'Ce classement demande un croisement suppl�mentaire (cat�gorie, fournisseur ou paniers) qui n�est pas pr�sent dans les preuves de ce moteur. Utilisez les filtres Ventes pour ce p�rim�tre, ou pr�cisez un classement par CA, variation ou marge. Je ne remplace pas ce filtre par un classement global.',engine:'QUERY_GROUNDED',providerDataSent:false,sources:f.sources};
 let rows=entity==='categories'?(f.hierarchy?.[level]||[]):entity==='stores'?(f.stores||[]):(storeHint?f.productsByStore?.filter(s=>norm(s.store).replaceAll('-',' ').includes(storeHint)).flatMap(s=>s.products)||[]:f.allProducts||f.products||[]);
 if(codes.length)rows=rows.filter(r=>codes.includes(r.article||r.key));
 const label={sales:'CA TTC',units:'quantité vendue',marginValue:'marge brute HT',delta:'variation de CA TTC'}[metric];
 if(metric==='units'){
  const units=new Set(rows.filter(r=>Number(r.units)>0).map(r=>r.quantityUnit||'INCONNUE'));
  if(units.size!==1||units.has('INCONNUE'))return{answer:'Classement par quantité non comparable : plusieurs unités ou des unités inconnues sont présentes. Choisissez une famille et une unité communes, ou demandez le classement par CA TTC.',engine:'QUERY_GROUNDED',providerDataSent:false,sources:f.sources};
 }
 const value=r=>metric==='delta'?(r.delta??r.deltaSales??(finite(r.sales)&&finite(r.previousSales)?r.sales-r.previousSales:null)):r[metric];
 const available=rows.filter(r=>finite(value(r))&&(metric==='delta'||Number(r.sales)>0));
 const ranked=available.sort((a,b)=>(ascending?1:-1)*(value(a)-value(b))||String(a.article||a.key||a.store).localeCompare(String(b.article||b.key||b.store))).slice(0,count);
 const total=(f.allProducts||f.products||[]).reduce((n,r)=>n+Number(r.sales||0),0);
 const lines=[`${ascending?'CLASSEMENT CROISSANT':'TOP'} ${count} · ${entity==='categories'?level==='department'?'DÉPARTEMENTS':level==='family'?'FAMILLES':'RAYONS':entity==='stores'?'MAGASINS':'PRODUITS'} · ${label.toUpperCase()} [S1]`,`${f.period.start} → ${f.period.end}${storeHint?' · '+storeHint:''}. Comparaison : ${f.period.compareStart} → ${f.period.compareEnd}. Critère par défaut : CA TTC, hors annulations selon les filtres de ventes.`];
 lines.push(...ranked.map((r,i)=>`${i+1}. ${r.label||r.store||r.article||r.key}${r.article||r.key?' ('+(r.article||r.key)+')':''} : ${num(value(r))}${metric==='units'?' '+r.quantityUnit:' DH'} ; CA ${num(r.sales)} DH ; variation ${finite(r.delta??r.deltaSales)?num(r.delta??r.deltaSales)+' DH':'non disponible'}${entity==='products'&&!storeHint&&total>0?' ; poids '+num(r.sales/total*100)+' %':''}.`));
 if(!ranked.length)lines.push('Aucune ligne disposant de cette mesure dans les preuves disponibles. Aucun classement de substitution n’est produit.');
 lines.push(`${ranked.length} lignes affichées sur ${available.length} comparables, ${rows.length-available.length} sans mesure exploitable ou sans ventes.${metric==='marginValue'?' Les coûts manquants ne valent pas zéro ; estimation si coût courant.':''}`);
 return{answer:lines.join('\n\n'),engine:'QUERY_GROUNDED',providerDataSent:false,sources:f.sources,period:f.period,ranking:{...intent,returned:ranked.length}};
}

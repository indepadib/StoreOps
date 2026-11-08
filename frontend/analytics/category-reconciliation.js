/**
 * Single reliable rayon summary for the executive brief and category drilldown.
 * StoreOps decision snapshots can contain a 100% "__UNCLASSIFIED__" bucket
 * because decision-intelligence uses the local hierarchy snapshot, while
 * the asynchronous product catalogue may enrich the same SKU from D365.
 *
 * We reconcile against the PRODUCT sales base, never sum both competing
 * hierarchy sources and never label an unknown rayon with an invented name.
 */
const number=value=>value==null||value===''||!Number.isFinite(Number(value))?0:Number(value);
const amount=value=>Math.round((value+Number.EPSILON)*100)/100;
const reasonableLabel=(value,id)=>{
 const label=String(value||'').trim(),code=String(id||'').trim();
 return label&&label!==code&&!/^(?:non class[eé]|unclassified|unknown|n\/a|non renseign[eé])$/i.test(label)
};
const nodeFromCatalog=ref=>{
 const hierarchy=ref?.hierarchy||{},rayon=hierarchy.rayon,dep=hierarchy.department;
 if(rayon?.id&&reasonableLabel(rayon.label,rayon.id)&&rayon.labelStatus!=='AMBIGUOUS')
  return{id:rayon.id,label:rayon.label,level:'rayon'};
 if(dep?.id&&reasonableLabel(dep.label,dep.id)&&dep.labelStatus!=='AMBIGUOUS')
  return{id:dep.id,label:'Département · '+dep.label,level:'department'};
 return null
};
const classifiedRow=row=>row?.key!=='__UNCLASSIFIED__'&&row?.key!=='UNKNOWN'&&
 reasonableLabel(row?.label,row?.key)&&Number.isFinite(Number(row?.sales));

function fromServer(rows,base){
 const byKey=new Map(),unknown=[];
 for(const r of rows||[]){
  if(!Number.isFinite(Number(r.sales)))continue;
  if(!classifiedRow(r)){unknown.push(r);continue}
  const key=String(r.key),value=byKey.get(key)||{key,label:String(r.label),sales:0,previousSales:0,articles:0};
  value.sales+=number(r.sales);value.previousSales+=number(r.previousSales);
  value.articles+=number(r.articles);byKey.set(key,value)
 }
 const total=Number.isFinite(Number(base))?number(base):[...byKey.values(),...unknown].reduce((s,x)=>s+number(x.sales),0);
 const known=[...byKey.values()],classified=known.reduce((s,x)=>s+x.sales,0);
 return{source:'DECISION_LOCAL_HIERARCHY',known,total,classified,unknownSales:amount(total-classified)}
}
function fromCatalog(products,catalog){
 const groups=new Map();
 let total=0,classified=0,missingProducts=0,knownProducts=0;
 const lookup=k=>catalog instanceof Map?catalog.get(k):catalog?.[k];
 for(const p of products||[]){
  const sku=String(p.key||p.productNumber||'').trim();
  const sales=number(p.sales),previousSales=number(p.previousSales);
  total+=sales;
  const node=nodeFromCatalog(lookup(sku));
  if(!node){missingProducts++;continue}
  knownProducts++;classified+=sales;
  const key=node.level+'|'+node.id,entry=groups.get(key)||{key,label:node.label,level:node.level,sales:0,previousSales:0,articles:0};
  entry.sales+=sales;entry.previousSales+=previousSales;entry.articles++;
  groups.set(key,entry)
 }
 return{source:'PRODUCT_CATALOG_HIERARCHY',known:[...groups.values()],total,classified,missingProducts,knownProducts,unknownSales:amount(total-classified)}
}
function finalize(raw,source,period){
 const total=amount(raw.total),classified=amount(raw.classified),unknownSales=amount(total-classified);
 const coveragePct=total>0?Math.max(0,Math.min(100,amount(classified/total*100))):null;
 const rows=raw.known.map(x=>{
  const sales=amount(x.sales),previousSales=amount(x.previousSales),delta=amount(sales-previousSales);
  return{...x,sales,previousSales,delta,change:previousSales>0?amount(delta/previousSales*100):null,sharePct:total>0?amount(sales/total*100):null}
 }).sort((a,b)=>b.sales-a.sales||a.label.localeCompare(b.label,'fr'));
 return{source,period,rows,total,classified,unknownSales,coveragePct,
  status:total<=0?'NO_SALES':!rows.length?'UNAVAILABLE':unknownSales>Math.max(.02,total*.001)?'PARTIAL':'READY',
  categoryCount:rows.length}
}
export function buildReliableCategories(decision,catalog=new Map()){
 const products=decision?.products||[],base=number(decision?.summary?.current?.sales);
 const local=fromServer(decision?.hierarchy?.rayon||[],base);
 const enriched=fromCatalog(products,catalog);
 // Only pick an enriched grouping if it is tied to exactly the same sales
 // population and provably classifies more CA than the server grouping.
 // The catalogue is incremental: 0% initial coverage must never hide
 // already-classified server hierarchy or fabricate a complete breakdown.
 const reconciled=Math.abs(enriched.total-base)<=Math.max(.02,Math.abs(base)*.001);
 const improved=reconciled&&enriched.classified>local.classified+Math.max(.02,Math.abs(base)*.00001);
 const selected=improved?enriched:local;
 return finalize(selected,selected.source,decision?.period||null)
}
export function categorySummaryLines(report,money,number){
 if(!report||report.status==='NO_SALES')return['Aucune vente exploitable sur la période sélectionnée.'];
 if(report.status==='UNAVAILABLE')return[
  'Répartition par rayon indisponible · 0 % du CA classé.',
  'Le CA est conservé : '+money(report.total)+' à rattacher aux catégories.',
  'Vérifier les affectations articles → catégories dans Dynamics et l’enrichissement du catalogue.'
 ];
 const lines=report.rows.slice(0,4).map(x=>
  x.label+' · '+money(x.sales)+' · '+number(x.sharePct)+' % du CA'+
  (x.change!=null?' · évolution '+number(x.change)+' %':' · évolution N/D'));
 if(report.unknownSales>Math.max(.02,report.total*.001))
  lines.push('Articles non classés · '+money(report.unknownSales)+
   ' · couverture rayon '+number(report.coveragePct)+' % du CA');
 return lines
}

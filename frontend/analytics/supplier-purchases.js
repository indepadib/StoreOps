import {filterSupplierPurchases,supplierEvidenceCsv,purchaseEvidencePage} from './supplier-purchase-analysis.js';
export function supplierPurchaseSummary(rows){
 const seen=new Map(),vendors=new Map(),products=new Map();let unresolved=0;
 for(const row of rows){
  const prior=seen.get(row.id);
  if(prior){if(JSON.stringify(prior)!==JSON.stringify(row))throw Error('Une ligne de facture a changé pendant la lecture. Relancer.');continue}
  seen.set(row.id,row);
  const account=row.vendorAccount||null,key=JSON.stringify([account,row.currency]);
  const v=vendors.get(key)||{account,name:row.vendorName||row.vendorAccount||'Fournisseur non résolu',currency:row.currency,amount:0,products:new Set(),invoices:new Set(),lines:0};
  v.amount+=row.amountHT;v.products.add(row.productNumber);v.invoices.add(JSON.stringify([row.invoice,row.date]));v.lines++;vendors.set(key,v);
  if(!row.vendorAccount)unresolved++;
  else if(row.amountHT>0){const ids=products.get(row.productNumber)||new Set();ids.add(row.vendorAccount);products.set(row.productNumber,ids)}
 }
 return{items:[...vendors.values()].map(v=>({...v,products:[...v.products],invoices:v.invoices.size})).sort((a,b)=>a.currency.localeCompare(b.currency)||b.amount-a.amount),multiple:[...products].filter(([,v])=>v.size>1).map(([sku,v])=>({sku,vendors:[...v]})),lines:seen.size,unresolved};
}

export function mountSupplierPurchases(){
 const root=document.getElementById('supplierIntelligence'),select=document.getElementById('supplierAttributionView');
 if(!root||!select)return;
 const primary=document.getElementById('supplierPrimaryView'),panel=document.getElementById('supplierPurchasesView'),button=document.getElementById('supplierPurchasesLoad'),status=document.getElementById('supplierPurchasesStatus'),body=document.getElementById('supplierPurchasesBody'),summary=document.getElementById('supplierPurchasesSummary');
 const core=()=>window.RETAIL_INTELLIGENCE||window.ONE_RETAIL_ANALYTICS;
 const vendor=document.getElementById('supplierPurchaseVendor'),article=document.getElementById('supplierPurchaseArticle'),exporter=document.getElementById('supplierEvidenceExport'),cancel=document.getElementById('supplierPurchasesCancel'),evidence=document.getElementById('supplierEvidenceBody'),previous=document.getElementById('supplierEvidencePrevious'),next=document.getElementById('supplierEvidenceNext'),pageStatus=document.getElementById('supplierEvidencePage');
 if([primary,panel,button,status,body,summary,vendor,article,exporter,cancel,evidence,previous,next,pageStatus,document.getElementById('supplierPurchaseReset'),document.getElementById('supplierMultiSource')].some(node=>!node)){if(status)status.textContent='La page et le module fournisseurs ne sont pas de la même version. Actualise la page.';return}
 let generation=0,controller=null,loaded=[],filtered=[],page=0,hasLoaded=false,searchTimer=null,articleCache=null;
 const fill=(target,rows)=>{target.replaceChildren();const fragment=document.createDocumentFragment();for(const values of rows){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=String(value??'N/D');tr.append(td)}fragment.append(tr)}target.append(fragment)};
 const formatters=new Map();
 const money=(n,c)=>{if(!formatters.has(c))formatters.set(c,new Intl.NumberFormat('fr-FR',{style:'currency',currency:c}));return formatters.get(c).format(n)};
 function renderEvidence(){
  const result=purchaseEvidencePage(filtered,page);page=result.index;
  fill(evidence,result.items.map(r=>[r.date,r.invoice,r.productNumber,r.vendorName||r.vendorAccount||'Non résolu',r.quantity,r.unit,money(r.amountHT,r.currency),r.currency,r.vendorStatus==='RESOLVED'?'Identifié':r.vendorStatus==='AMBIGUOUS'?'Ambigu':'Absent']));
  previous.disabled=page===0;next.disabled=page===result.pages-1;
  pageStatus.textContent=result.total?`Page ${page+1} / ${result.pages} · ${result.total} lignes filtrées · export complet disponible`:'Aucune ligne correspondant aux filtres.';
 }
 function render(){
  if(!hasLoaded)return;
  const account=vendor.value.startsWith('account:')?vendor.value.slice(8):'';
  if(articleCache?.query!==article.value){const rows=filterSupplierPurchases(loaded,{article:article.value});articleCache={query:article.value,rows,summary:supplierPurchaseSummary(rows)}}
  filtered=filterSupplierPurchases(articleCache.rows,{vendor:account,unresolvedOnly:vendor.value==='missing'});
  const result=vendor.value?supplierPurchaseSummary(filtered):articleCache.summary;
  fill(body,result.items.map(v=>[v.name,v.account||'N/D',v.currency,money(v.amount,v.currency),v.products.length,v.invoices,v.lines]));
  // Keep the other suppliers visible even when inspecting a single supplier.
  const context=articleCache.summary,names=new Map(context.items.map(v=>[v.account,v.name]));
  const multiple=context.multiple.filter(p=>vendor.value!=='missing'&&(!account||p.vendors.includes(account)));
  fill(document.getElementById('supplierMultiSource'),multiple.map(p=>[p.sku,p.vendors.map(v=>(names.get(v)||v)+' ['+v+']').join(' · '),p.vendors.length]));
  summary.textContent=result.lines+' / '+loaded.length+' lignes après filtres · '+multiple.length+' articles multi-fournisseurs · '+result.unresolved+' lignes sans attribution certaine. Les totaux fournisseurs suivent les filtres ci-dessus.';
  exporter.disabled=!filtered.length;renderEvidence();
 }
 const clear=()=>{generation++;controller?.abort();controller=null;clearTimeout(searchTimer);articleCache=null;loaded=[];filtered=[];page=0;hasLoaded=false;button.disabled=false;cancel.hidden=true;exporter.disabled=true;vendor.disabled=true;article.disabled=true;vendor.replaceChildren(new Option('Tous les fournisseurs',''));article.value='';summary.textContent='';body.replaceChildren();evidence.replaceChildren();pageStatus.textContent='';previous.disabled=next.disabled=true;document.getElementById('supplierMultiSource').replaceChildren();status.textContent='Choisis la période puis lance la lecture des achats facturés. Périmètre société, non ventilé par magasin.'};
 const visibility=()=>{primary.hidden=select.value!=='primary';panel.hidden=select.value==='primary';document.dispatchEvent(new CustomEvent('retail-intelligence:section'))};
 select.addEventListener('change',visibility);
 document.addEventListener('retail-intelligence:period',clear);
 vendor.addEventListener('change',()=>{page=0;render()});article.addEventListener('input',()=>{clearTimeout(searchTimer);exporter.disabled=true;searchTimer=setTimeout(()=>{page=0;render()},150)});
 document.getElementById('supplierPurchaseReset').addEventListener('click',()=>{vendor.value='';article.value='';page=0;render()});
 previous.addEventListener('click',()=>{page--;renderEvidence()});next.addEventListener('click',()=>{page++;renderEvidence()});
 cancel.addEventListener('click',()=>{clear();status.textContent='Lecture annulée. Aucun total partiel affiché.'});
 exporter.addEventListener('click',()=>{if(!hasLoaded||!filtered.length)return;const url=URL.createObjectURL(new Blob([supplierEvidenceCsv(filtered)],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='achats-factures-filtres.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
 button.addEventListener('click',async()=>{
  clear();const own=generation,api=core(),s=api?.getState(),scope=[s?.tenant,s?.periodStart,s?.periodEnd].join('|');
  if(!api||!s)return;
  controller=new AbortController();const abort=controller;button.disabled=true;cancel.hidden=false;
  try{
   const rows=[],cursors=new Set();let cursor=null,source;
   do{
    const q=new URLSearchParams({start:s.periodStart,end:s.periodEnd});if(cursor)q.set('cursor',cursor);
    const page=await api.api('/api/analytics/supplier-purchases?'+q,{noRetry:true,signal:abort.signal});
    if(own!==generation||[core()?.getState()?.tenant,core()?.getState()?.periodStart,core()?.getState()?.periodEnd].join('|')!==scope)return;
    if(page.status!=='READY')throw Error(page.message||'Source de factures indisponible.');
    rows.push(...page.items);if(rows.length>100000)throw Error('Lecture trop volumineuse.');
    source=page;cursor=page.nextCursor;
    if(cursor&&cursors.has(cursor))throw Error('Pagination répétée.');if(cursor)cursors.add(cursor);
    status.textContent=rows.length+' lignes de factures lues · calcul des totaux à la fin de la lecture complète.';
   }while(cursor);
   supplierPurchaseSummary(rows); // Validate conflicting source IDs before exposing any total.
   loaded=[...new Map(rows.map(r=>[r.id,r])).values()];hasLoaded=true;
   const accounts=new Map(loaded.filter(r=>r.vendorAccount).map(r=>[r.vendorAccount,r.vendorName||r.vendorAccount]));
   vendor.replaceChildren(new Option('Tous les fournisseurs',''),...([...accounts].sort((a,b)=>a[1].localeCompare(b[1],'fr')).map(([id,name])=>new Option(name+' ['+id+']','account:'+id))));
   if(loaded.some(r=>!r.vendorAccount))vendor.append(new Option('Fournisseur non résolu','missing'));
   vendor.disabled=article.disabled=false;render();
   status.textContent='Lecture terminée · société '+source.company+' · '+s.periodStart+' → '+s.periodEnd+' · '+source.source+'. Les montants HT restent séparés par devise. Les magasins sélectionnés ne filtrent pas les factures société. Le CA vendu ne peut pas être affecté à un fournisseur sans traçabilité des lots.';
  }catch(error){if(!abort.signal.aborted&&own===generation){clear();status.textContent='Achats non disponibles : '+error.message}}
  finally{if(own===generation){button.disabled=false;cancel.hidden=true;controller=null}}
 });
 clear();primary.hidden=true;panel.hidden=false;
}
if(typeof document!=='undefined')mountSupplierPurchases();

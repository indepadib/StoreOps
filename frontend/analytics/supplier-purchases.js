export function supplierPurchaseSummary(rows){
 const seen=new Map(),vendors=new Map(),products=new Map();let unresolved=0;
 for(const row of rows){
  const prior=seen.get(row.id);
  if(prior){if(JSON.stringify(prior)!==JSON.stringify(row))throw Error('Une ligne de facture a changé pendant la lecture. Relancer.');continue}
  seen.set(row.id,row);
  const account=row.vendorAccount||'NON_RESOLU',key=JSON.stringify([account,row.currency]);
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
 let generation=0,controller=null;
   const clear=()=>{generation++;controller?.abort();controller=null;button.disabled=false;summary.textContent='';body.replaceChildren();document.getElementById('supplierMultiSource').replaceChildren();status.textContent='Choisis la période puis lance la lecture des achats facturés. Périmètre société, non ventilé par magasin.'};
 const visibility=()=>{primary.hidden=select.value!=='primary';panel.hidden=select.value==='primary';document.dispatchEvent(new CustomEvent('retail-intelligence:section'))};
 select.addEventListener('change',visibility);
 document.addEventListener('retail-intelligence:period',clear);
 button.addEventListener('click',async()=>{
  clear();const own=generation,api=core(),s=api?.getState(),scope=[s?.tenant,s?.periodStart,s?.periodEnd].join('|');
  if(!api||!s)return;
  controller=new AbortController();const abort=controller;button.disabled=true;
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
   const result=supplierPurchaseSummary(rows),money=(n,c)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:c}).format(n);
   const names=new Map(result.items.filter(v=>v.account!=='NON_RESOLU').map(v=>[v.account,v.name]));
   for(const v of result.items){const tr=document.createElement('tr');for(const value of [v.name,v.account==='NON_RESOLU'?'N/D':v.account,v.currency,money(v.amount,v.currency),v.products.length,v.invoices,v.lines]){const td=document.createElement('td');td.textContent=String(value);tr.append(td)}body.append(tr)}
   summary.textContent=result.lines+' lignes · '+result.multiple.length+' articles achetés à plusieurs fournisseurs · '+result.unresolved+' lignes sans attribution certaine.';
   const multi=document.getElementById('supplierMultiSource');multi.replaceChildren();
   for(const p of result.multiple){const tr=document.createElement('tr');for(const value of [p.sku,p.vendors.map(v=>names.get(v)||v).join(' · '),p.vendors.length]){const td=document.createElement('td');td.textContent=String(value);tr.append(td)}multi.append(tr)}
   status.textContent='Lecture terminée · société '+source.company+' · '+s.periodStart+' → '+s.periodEnd+' · '+source.source+'. Les montants HT restent séparés par devise. Les magasins sélectionnés ne filtrent pas les factures société. Le CA vendu ne peut pas être affecté à un fournisseur sans traçabilité des lots.';
  }catch(error){if(!abort.signal.aborted&&own===generation){body.replaceChildren();document.getElementById('supplierMultiSource').replaceChildren();summary.textContent='';status.textContent='Achats non disponibles : '+error.message}}
  finally{if(own===generation){button.disabled=false;controller=null}}
 });
 clear();primary.hidden=true;panel.hidden=false;
}
if(typeof document!=='undefined')mountSupplierPurchases();

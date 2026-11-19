import {filterAndSortRows} from './table-analysis.js';
const core=window.RETAIL_INTELLIGENCE,host=document.getElementById('detentionViews');
if(host&&core){
 const panel=document.createElement('section');panel.className='sales-proof';
 panel.innerHTML=`<header class="sales-proof-header"><div><h3>Ventes et détention par magasin</h3><p>Ventes des 28 derniers jours clos et stock actuel.</p></div><button type="button" data-load>Croiser ventes et stock</button></header><div class="studio-filters"><label>Magasin<select data-store></select></label><label>Lecture<select data-view><option value="ALL">Tous les articles</option><option value="UNSOLD">Stock actuel sans vente</option><option value="MISSING_SELLER">Vendus, actuellement non détenus</option><option value="HELD_SELLER">Vendus et détenus</option></select></label><label>Article<input data-search placeholder="Code ou libellé"></label><button type="button" data-export disabled>Télécharger le CSV</button></div><p data-status role="status"></p><div class="sales-proof-table"><table class="decision-table"><thead></thead><tbody></tbody></table></div><button type="button" data-more hidden>Afficher 100 lignes de plus</button>`;
 host.append(panel);
 const el=selector=>panel.querySelector(selector),escape=core.escapeHtml;
 const columns=[['rank','Rang CA',true],['productNumber','Code'],['productName','Article'],['reading','Lecture'],['storeAvailable','Stock actuel',true],['unit','Unité stock'],['sales','CA sur 28 j',true],['dailySales','CA / jour',true],['quantity','Ventes par unité']].map(([key,label,numeric])=>({key,label,numeric:!!numeric,value:row=>row[key]}));
 let stock=[],report=null,generation=0,limit=100,sort={key:'sales',desc:true},visible=[];
 function render(){
  const mode=el('[data-view]').value,query=el('[data-search]').value.trim();
  visible=filterAndSortRows((report||[]).filter(row=>mode==='ALL'||row.kind===mode),columns,{productName:query},sort);
  // Code searches and names share the same entry point.
  if(query)visible=filterAndSortRows((report||[]).filter(row=>(mode==='ALL'||row.kind===mode)&&[row.productNumber,row.productName].join(' ').toLowerCase().includes(query.toLowerCase())),columns,{},sort);
  el('thead').innerHTML='<tr>'+columns.map(column=>`<th scope="col"${sort.key===column.key?` aria-sort="${sort.desc?'descending':'ascending'}"`:''}><button type="button" data-sort="${column.key}">${escape(column.label)}${sort.key===column.key?(sort.desc?' ↓':' ↑'):''}</button></th>`).join('')+'</tr>';
  el('tbody').innerHTML=visible.slice(0,limit).map(row=>'<tr>'+columns.map(column=>'<td>'+escape(row[column.key]==null?'N/D':typeof row[column.key]==='number'?core.number(row[column.key]):row[column.key])+'</td>').join('')+'</tr>').join('');
  el('[data-more]').hidden=visible.length<=limit;el('[data-export]').disabled=!report;
 }
 function reset(){generation++;report=null;limit=100;el('[data-status]').textContent='Choisir le magasin puis croiser ses ventes et son stock.';render();}
 document.addEventListener('retail-intelligence:stock',event=>{
  stock=event.detail.complete?event.detail.rows:[];
  const selected=el('[data-store]').value,stores=new Map(stock.map(row=>[row.storeId,row.storeName]));
  el('[data-store]').innerHTML=[...stores].map(([id,name])=>`<option value="${escape(id)}">${escape(name)}</option>`).join('');
  if(stores.has(selected))el('[data-store]').value=selected;
  reset();
 });
 document.addEventListener('retail-intelligence:section',reset);
 el('[data-store]').addEventListener('change',reset);
 el('[data-load]').onclick=async()=>{
  const storeId=el('[data-store]').value,ownGeneration=++generation;
  if(!storeId){el('[data-status]').textContent='Lire les stocks de la page Détention avant de croiser les ventes.';return;}
  report=null;render();el('[data-status]').textContent='Lecture des ventes du magasin…';
  try{
   const data=await core.api('/api/analytics/detention/sales?'+new URLSearchParams({storeId}),{noRetry:true});
   if(ownGeneration!==generation)return;
   const sales=new Map(data.products.map(row=>[row.productNumber,row]));
   const ranked=[...data.products].filter(row=>row.sales>0).sort((a,b)=>b.sales-a.sales),ranks=new Map(ranked.map((row,index)=>[row.productNumber,index+1]));
   report=stock.filter(row=>row.storeId===storeId).map(row=>{
    const sale=sales.get(row.productNumber),amount=sale?sale.sales:0;
    const noSales=amount===0&&(!sale||sale.units===0);
    const kind=amount>0?(row.storeHeld===true?'HELD_SELLER':row.storeHeld===false?'MISSING_SELLER':'UNKNOWN'):row.storeHeld===true&&noSales?'UNSOLD':'OTHER';
    const reading={UNSOLD:'Stock actuel sans vente',MISSING_SELLER:'Vendu · actuellement absent',HELD_SELLER:'Vendu · détenu',UNKNOWN:'Stock inconnu',OTHER:'Autre'}[kind];
    return{...row,productName:row.productName||row.productNumber,kind,reading,rank:ranks.get(row.productNumber),sales:amount,dailySales:amount==null?null:amount/28,quantity:sale?Object.entries(sale.quantityByUnit||{}).map(([unit,value])=>core.number(value)+' '+unit).join(' · '):'0'};
   });
   el('[data-status]').textContent=`${data.startDate} au ${data.endDate} · ${report.filter(row=>row.kind==='UNSOLD').length} références en stock sans vente · ${report.filter(row=>row.kind==='MISSING_SELLER').length} vendues mais absentes actuellement. Le stock est une observation actuelle.`;
   render();
  }catch(error){if(ownGeneration===generation)el('[data-status]').textContent=error.message;}
 };
 el('[data-view]').onchange=()=>{limit=100;render();};el('[data-search]').oninput=()=>{limit=100;render();};
 el('[data-more]').onclick=()=>{limit+=100;render();};
 panel.addEventListener('click',event=>{const key=event.target.closest('[data-sort]')?.dataset.sort;if(!key)return;sort={key,desc:sort.key===key?!sort.desc:columns.find(column=>column.key===key).numeric};render();});
 el('[data-export]').onclick=()=>core.downloadCsv('detention-ventes-'+el('[data-store]').value+'.csv',[columns.map(column=>column.label),...visible.map(row=>columns.map(column=>typeof row[column.key]==='string'&&/^\s*[=+@-]/.test(row[column.key])?"'"+row[column.key]:row[column.key]))]);
 render();
}

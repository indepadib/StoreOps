import {buildSalesProof} from './sales-proof-model.js';
import {filterAndSortRows} from './table-analysis.js';

const scope=()=>window.RETAIL_INTELLIGENCE?.getState?.();
const currentDecision=()=>window.RETAIL_DECISION_INTELLIGENCE?.getData?.();
const modelCache=new WeakMap();
const size=25;
const common=[['sales','CA actuel','money'],['previousSales','CA comparé','money'],['delta','Écart CA','money'],['change','Évolution CA','percent']];
const trade=[['tickets','Tickets','number'],['previousTickets','Tickets comparés','number'],['ticketsDelta','Écart tickets','number'],['averageBasket','Panier','money'],['previousBasket','Panier comparé','money'],['basketDelta','Écart panier','money']];
const margin=[['margin','Marge HT','money'],['marginRate','Taux de marge','percent']];
const sections={
 days:{label:'Jours',title:'Comparer les jours',note:'Les jours sont alignés par leur rang dans chaque période. Un jour manquant reste N/A.', columns:[['date','Jour actuel','date'],['compareDate','Jour comparé','date'],...common,...trade,...margin,['identifiedSales','CA identifié','money']]},
 stores:{label:'Magasins',title:'Trouver les magasins qui expliquent l’écart',note:'Totaux par magasin pour toute la période sélectionnée.',columns:[['name','Magasin','text'],...common,...trade,...margin,['status','Source','text']]},
 departments:{label:'Départements',title:'Trouver les départements qui expliquent l’écart',note:'Les catégories non classées restent dans le tableau quand la source les expose.',columns:[['name','Département','text'],['code','Code','text'],...common,['weight','Poids CA','percent'],...margin]},
 products:{label:'Articles',title:'Voir la contribution de chaque article',note:'Les lignes correspondent aux articles transmis par l’analyse des ventes.',columns:[['name','Article','text'],['code','Code interne','text'],...common,['weight','Poids CA','percent'],...margin]},
};
const essentialColumns={
 days:['date','sales','delta','change','tickets','averageBasket'],
 stores:['name','sales','delta','change','tickets','averageBasket'],
 departments:['name','sales','delta','change','weight'],
 products:['name','code','sales','delta','change','weight'],
};
const dateFormat=new Intl.DateTimeFormat('fr-MA',{dateStyle:'medium',timeZone:'UTC'});
const formatDate=value=>dateFormat.format(new Date(value+'T00:00:00Z'));
const text=key=>['text','date'].includes(key);
const sameScope=(data,selected)=>{
 if(!data||!selected)return false;
 if(data.period?.startDate!==selected.periodStart||data.period?.endDate!==selected.periodEnd||data.comparison?.startDate!==selected.compareStart||data.comparison?.endDate!==selected.compareEnd)return false;
 const chosen=selected.selectedStoreIds?.length?selected.selectedStoreIds:selected.stores?.map(store=>store.id);
 const sources=new Set((data.stores||[]).map(store=>store.storeId));
 return !chosen?.length||chosen.length===sources.size&&chosen.every(id=>sources.has(id));
};

function install(host){
 const api=window.RETAIL_INTELLIGENCE,escape=api.escapeHtml;
 let section='days',page=0,filters={},sort={},showFilters=false,showAllColumns=false,source=null,filtered=[];
 const money=value=>api.money(value);
 const format=(value,type)=>{
  if(value===null||value===undefined)return 'N/A';
  if(type==='money')return money(value);
  if(type==='percent')return api.percent(value);
  if(type==='number')return api.number(value);
  if(type==='date')return formatDate(value);
  return String(value);
 };
 host.className='sales-proof';
 host.innerHTML=`<header class="sales-proof-header"><div><h3>Détail des ventes</h3><p data-sales-scope></p></div><button type="button" class="ghost-light-btn" data-sales-export disabled>Exporter les lignes (CSV)</button></header>
 <div class="sales-proof-views" role="group" aria-label="Détail des ventes par niveau">${Object.entries(sections).map(([key,item])=>`<button type="button" data-sales-view="${key}" aria-pressed="${key===section}">${item.label}</button>`).join('')}</div>
 <div class="sales-proof-title"><div><h4 data-sales-title></h4><p data-sales-note></p></div><div class="sales-proof-controls"><label><input type="checkbox" data-sales-filter-toggle> Filtres par colonne</label><label><input type="checkbox" data-sales-columns-toggle> Toutes les colonnes</label></div></div>
 <div class="sales-proof-variations" role="group" aria-label="Filtrer selon la variation du CA">
  <button type="button" data-sales-variation="" aria-pressed="true">Toutes les lignes</button>
  <button type="button" data-sales-variation="<0" aria-pressed="false">En baisse</button>
  <button type="button" data-sales-variation=">0" aria-pressed="false">En hausse</button>
 </div>
 <div class="sales-proof-evidence" data-sales-evidence></div>
 <div class="sales-proof-table" tabindex="0" role="region" aria-label="Tableau détaillé des ventes"><table class="decision-table" aria-label="Détail des ventes"><thead></thead><tbody></tbody></table></div>
 <footer class="sales-proof-footer"><span data-sales-count aria-live="polite"></span><button type="button" class="ghost-light-btn" data-sales-clear hidden>Effacer les filtres</button><button type="button" class="ghost-light-btn" data-sales-step="-1">Précédent</button><button type="button" class="ghost-light-btn" data-sales-step="1">Suivant</button></footer>`;
 const el=selector=>host.querySelector(selector);
 const head=el('thead'),body=el('tbody');
 const getColumns=(all=showAllColumns)=>sections[section].columns.filter(([key])=>all||essentialColumns[section].includes(key)).map(([key,label,type])=>({key,label,type,numeric:!text(type),value:row=>row[key]}));

 function drawHead(){
  head.innerHTML='<tr>'+getColumns().map(c=>`<th scope="col"><button type="button" data-sales-sort="${c.key}">${c.label}</button></th>`).join('')+'</tr><tr data-sales-filter-row>'+getColumns().map(c=>`<td><input data-sales-filter="${c.key}" aria-label="Filtrer ${c.label}" placeholder="${c.numeric?'Ex. <0':c.type==='date'?'AAAA-MM-JJ':'Filtrer'}" value="${escape(filters[c.key]||'')}"></td>`).join('')+'</tr>';
 }

 function renderRows(){
  for(const control of host.querySelectorAll('[data-sales-variation]'))control.setAttribute('aria-pressed',String(control.dataset.salesVariation===(filters.delta||'')));

  const columns=getColumns();
  filtered=filterAndSortRows(source?.[section]||[],getColumns(true),filters,sort);
  const pages=Math.max(1,Math.ceil(filtered.length/size));
  page=Math.max(0,Math.min(page,pages-1));
  const start=page*size;
  const empty=source?'Aucune ligne pour ces filtres.':'Détail en attente des données du périmètre sélectionné.';
  body.innerHTML=filtered.slice(start,start+size).map(row=>'<tr>'+columns.map(c=>{
   const value=c.value(row),label=escape(format(value,c.type));
   return '<td'+(c.key==='delta'&&typeof value==='number'&&value!==0?` class="${value<0?'metric-negative':'metric-positive'}"`:'')+'>'+label+'</td>';
  }).join('')+'</tr>').join('')||`<tr><td colspan="${columns.length}">${empty}</td></tr>`;
  el('[data-sales-count]').textContent=filtered.length?`${start+1}–${Math.min(start+size,filtered.length)} sur ${filtered.length} lignes`:'0 ligne';
  el('[data-sales-step="-1"]').disabled=page===0;
  el('[data-sales-step="1"]').disabled=page>=pages-1;
  el('[data-sales-export]').disabled=!filtered.length;
  el('[data-sales-clear]').hidden=!Object.values(filters).some(v=>v.trim());
  el('[data-sales-filter-row]').hidden=!showFilters;
  for(const button of head.querySelectorAll('[data-sales-sort]')){
   const active=button.dataset.salesSort===sort.key,cell=button.parentElement,column=columns.find(c=>c.key===button.dataset.salesSort);
   button.textContent=column.label+(active?(sort.desc?' ↓':' ↑'):'');
   if(active)cell.setAttribute('aria-sort',sort.desc?'descending':'ascending');else cell.removeAttribute('aria-sort');
  }
 }

 function renderEvidence(){
  el('[data-sales-title]').textContent=sections[section].title;
  el('[data-sales-note]').textContent=sections[section].note;
  const evidence=source?.accounting[section],block=el('[data-sales-evidence]');
  if(!evidence){block.hidden=true;return;}
  block.hidden=false;
  const display=value=>format(value,'money');
  block.innerHTML=`<span>Écart total du CA <strong>${escape(display(evidence.total))}</strong></span>
   <span>Somme des lignes comparables <strong>${escape(display(evidence.subtotal))}</strong></span>
   <span>Différence <strong>${escape(display(evidence.gap))}</strong></span>
   <small>${evidence.known}/${evidence.count} lignes comparables · Contrôle interne entre le total et le détail.</small>`;
 }

 function update(){
  const selected=scope(),data=currentDecision();
  if(selected?.section!=='sales')return;
  if(sameScope(data,selected)){
   if(!modelCache.has(data))modelCache.set(data,buildSalesProof(data));
   source=modelCache.get(data);
  }else source=null;
  const selection=api.getStoreScopeLabel();
  const coverage=source&&typeof data.coverage?.storesRequested==='number'?` · Magasins chargés ${data.coverage.currentStoresReady??'N/A'}/${data.coverage.storesRequested} actuel, ${data.coverage.comparisonStoresReady??'N/A'}/${data.coverage.storesRequested} comparé`:'';
  el('[data-sales-scope]').textContent=`${selection} · ${formatDate(selected.periodStart)} au ${formatDate(selected.periodEnd)} · Comparé au ${formatDate(selected.compareStart)}–${formatDate(selected.compareEnd)}${coverage}`;
  renderEvidence();renderRows();
 }

 host.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-sales-variation')){
   filters.delta=button.dataset.salesVariation;
   sort=filters.delta?{key:'delta',desc:filters.delta==='>0'}:{};
   page=0;drawHead();renderRows();
   return;
  }
  if(button.dataset.salesView){
   section=button.dataset.salesView;page=0;filters={};sort={};
   for(const view of host.querySelectorAll('[data-sales-view]'))view.setAttribute('aria-pressed',String(view===button));
   drawHead();renderEvidence();renderRows();
  }else if(button.dataset.salesSort){
   const key=button.dataset.salesSort, column=getColumns().find(c=>c.key===key);
   sort={key,desc:sort.key===key?!sort.desc:column.numeric};page=0;renderRows();
  }else if(button.hasAttribute('data-sales-step')){
   page+=Number(button.dataset.salesStep);renderRows();
  }else if(button.hasAttribute('data-sales-clear')){
   filters={};page=0;drawHead();renderRows();el('[data-sales-filter-toggle]').focus();
  }else if(button.hasAttribute('data-sales-export')){
   const columns=getColumns(true);
   const protect=value=>typeof value==='string'&&/^[\s]*[=+@-]/.test(value)?"'"+value:value;
   api.downloadCsv(`ventes-${section}-${scope().periodStart}-${scope().periodEnd}.csv`,[columns.map(c=>c.label),...filtered.map(row=>columns.map(c=>protect(c.value(row))))]);
  }
 });
 host.addEventListener('input',event=>{
  if(event.target.hasAttribute('data-sales-filter-toggle'))showFilters=event.target.checked;
  else if(event.target.hasAttribute('data-sales-columns-toggle')){
   showAllColumns=event.target.checked;
   if(!showAllColumns){
    for(const key of Object.keys(filters))if(!essentialColumns[section].includes(key))delete filters[key];
    if(!essentialColumns[section].includes(sort.key))sort={};
   }
   page=0;drawHead();
  }
  else if(event.target.dataset.salesFilter){filters[event.target.dataset.salesFilter]=event.target.value;page=0;}
  else return;
  renderRows();
 });
 drawHead();renderEvidence();renderRows();
 for(const event of ['decision','section','period'])document.addEventListener('retail-intelligence:'+event,update);
 update();
}

const host=document.getElementById('salesProof');
if(host&&window.RETAIL_INTELLIGENCE)install(host);
document.querySelector('a[href="#salesByHour"]')?.addEventListener('click',()=>{
 const hourly=document.getElementById('salesByHour');
 if(hourly)hourly.open=true;
});

import {filterAndSortRows} from './table-analysis.js';
import {createXlsxBlob} from './xlsx-workbook.js';
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function analysisRows(rows,columns,{filters={},search='',sort={key:null}}={}){
 const query=fold(search.trim());
 const normalized=Object.fromEntries(Object.entries(filters).map(([key,value])=>[key,/^n\/d$/i.test(value.trim())?'n/a':value]));
 return filterAndSortRows(query?rows.filter(row=>columns.some(c=>fold(row[c.key]).includes(query))):rows,columns.map(c=>({...c,value:row=>row[c.key]})),normalized,sort);
}
export function analysisCsv(headers,rows){
 const cell=value=>'"'+(typeof value==='number'?String(value):String(value??'').replace(/^\s*[=+@-]/,match=>"'"+match)).replaceAll('"','""')+'"';
 return '\ufeff'+[headers,...rows].map(row=>row.map(cell).join(';')).join('\r\n');
}
export function groupAnalysis(rows,key){
 const groups=new Map();for(const row of rows){const label=row[key]||'Non renseigné',g=groups.get(label)||{label,articles:0,sourceSales:0,targetSales:0,targetKnown:true};g.articles++;g.sourceSales+=row.sourceSales;g.targetKnown&&=row.targetSales!=null;g.targetSales+=row.targetSales||0;groups.set(label,g)}
 return [...groups.values()].map(g=>({...g,targetSales:g.targetKnown?g.targetSales:null})).sort((a,b)=>b.sourceSales-a.sourceSales);
}
export function mountAnalysisGrid(host,{columns,onChange=()=>{}}){
 const make=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node};
 const state={rows:[],filters:{},search:'',sort:{key:'sourceSales',desc:true},page:0,shown:new Set(columns.filter(c=>!c.optional).map(c=>c.key)),context:{}};
 host.innerHTML='<div class="analysis-grid-tools"><label>Rechercher dans toutes les colonnes<input type="search" data-search></label><label>Regrouper<select data-group><option value="">Détail article</option><option value="department">Département</option><option value="rayon">Rayon</option><option value="family">Famille</option><option value="vendor">Fournisseur principal de fiche</option><option value="reading">Lecture métier</option></select></label><button type="button" data-reset>Effacer les filtres et le tri</button><details><summary>Choisir les colonnes</summary><div data-columns class="analysis-column-picker"></div></details></div><div class="analysis-grid-tools"><label>Lignes à exporter<select data-export-rows><option value="filtered">Toutes les lignes filtrées</option><option value="all">Toutes les lignes de la lecture métier</option></select></label><label>Colonnes à exporter<select data-export-columns><option value="visible">Colonnes affichées</option><option value="all">Toutes les colonnes</option></select></label><button type="button" data-csv>Exporter CSV</button><button type="button" data-xlsx>Exporter Excel</button></div><p data-count role="status"></p><div class="table-wrap"><table class="decision-table" data-ri-native-table><thead></thead><tbody></tbody></table></div><div data-group-results></div><div class="analysis-grid-tools"><button type="button" data-prev>Précédent</button><span data-page></span><button type="button" data-next>Suivant</button></div>';
 const el=q=>host.querySelector(q);let filtered=[];
 const display=value=>value==null?'N/D':typeof value==='number'?new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(value):String(value);
 function headers(){
  const head=el('thead');head.replaceChildren();const names=make('tr'),filters=make('tr');filters.dataset.analysisFilterRow='true';
  for(const c of columns.filter(c=>state.shown.has(c.key))){
   const th=make('th'),sort=make('button',c.label);sort.type='button';th.setAttribute('aria-sort',state.sort.key===c.key?state.sort.desc?'descending':'ascending':'none');
   sort.onclick=()=>{state.sort={key:c.key,desc:state.sort.key===c.key?!state.sort.desc:!!c.numeric};state.page=0;headers();render()};th.append(sort);names.append(th);
   const filter=make('th'),input=make('input');input.type='search';input.value=state.filters[c.key]||'';input.placeholder=c.numeric?'Ex. >100 ou N/A':'Filtrer · N/A = absent';input.setAttribute('aria-label','Filtrer '+c.label);
   let timer;input.oninput=()=>{state.filters[c.key]=input.value;el('[data-csv]').disabled=el('[data-xlsx]').disabled=true;clearTimeout(timer);timer=setTimeout(()=>{state.page=0;render()},150)};filter.append(input);filters.append(filter);
  }head.append(names,filters);
 }
 function render(){
  filtered=analysisRows(state.rows,columns,state);const shown=columns.filter(c=>state.shown.has(c.key)),pages=Math.max(1,Math.ceil(filtered.length/100));state.page=Math.min(state.page,pages-1);
  const fragment=document.createDocumentFragment();for(const row of filtered.slice(state.page*100,(state.page+1)*100)){const tr=make('tr');for(const c of shown)tr.append(make('td',display(row[c.key])));fragment.append(tr)}el('tbody').replaceChildren(fragment);
  const active=columns.filter(c=>state.filters[c.key]?.trim()).map(c=>c.label+' : '+state.filters[c.key]);
  el('[data-count]').textContent=filtered.length+' / '+state.rows.length+' articles · filtres appliqués à toute la lecture, export indépendant de la pagination.'+(active.length?' Filtres actifs : '+active.join(' ; '):'');
  el('[data-page]').textContent=`Page ${state.page+1} / ${pages}`;el('[data-prev]').disabled=state.page===0;el('[data-next]').disabled=state.page===pages-1;
  el('[data-csv]').disabled=el('[data-xlsx]').disabled=!state.rows.length;
  const group=el('[data-group]').value,groupHost=el('[data-group-results]');groupHost.replaceChildren();
  if(group){const table=make('table');table.className='decision-table';table.setAttribute('data-ri-native-table','');const head=make('thead'),tr=make('tr');for(const title of ['Groupe','Articles','CA source','CA cible'])tr.append(make('th',title));head.append(tr);table.append(head);const body=make('tbody');for(const row of groupAnalysis(filtered,group)){const tr=make('tr');for(const value of [row.label,row.articles,row.sourceSales,row.targetSales])tr.append(make('td',display(value)));body.append(tr)}table.append(body);groupHost.append(table);}
  onChange(filtered);
 }
 function selectedExport(){
  const list=el('[data-export-rows]').value==='all'?state.rows:analysisRows(state.rows,columns,state),cols=columns.filter(c=>el('[data-export-columns]').value==='all'||state.shown.has(c.key)),context=Object.entries(state.context);
  return{headers:[...cols.map(c=>c.label),...context.map(([key])=>key)],keys:[...cols.map(c=>c.key),...context.map(([key])=>key)],rows:list.map(row=>[...cols.map(c=>row[c.key]),...context.map(([,value])=>value)]),sourceRows:list};
 }
 async function download(excel){
  const data=selectedExport();if(!data.rows.length){el('[data-count]').textContent='Aucune ligne dans la sélection à exporter.';return}
  const grouping=el('[data-group]').value,groupSheets=grouping?[{name:'Synthèse regroupée',headers:['Groupe','Articles','CA source','CA cible'],keys:['group','articles','sourceSales','targetSales'],rows:groupAnalysis(data.sourceRows,grouping).map(g=>[g.label,g.articles,g.sourceSales,g.targetSales])}]:[];
  const blob=excel?await createXlsxBlob([{name:'Articles',...data},...groupSheets,{name:'Périmètre et filtres',headers:['Paramètre','Valeur'],rows:[...Object.entries(state.context),['Recherche globale',state.search],['Filtres colonnes',JSON.stringify(state.filters)],['Tri',JSON.stringify(state.sort)],['Lignes exportées',el('[data-export-rows]').value],['Couverture','Toutes les lignes de cette lecture, aucune limite de page. Quantités non additionnées entre unités.']]}]):new Blob([analysisCsv(data.headers,data.rows)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=make('a');link.href=url;link.download='assortiment-comparaison.'+(excel?'xlsx':'csv');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 for(const c of columns){const label=make('label'),check=make('input');check.type='checkbox';check.checked=state.shown.has(c.key);check.onchange=()=>{if(!check.checked&&state.shown.size===1){check.checked=true;return}check.checked?state.shown.add(c.key):state.shown.delete(c.key);headers();render()};label.append(check,document.createTextNode(c.label));el('[data-columns]').append(label)}
 el('[data-search]').oninput=event=>{state.search=event.target.value;state.page=0;render()};
 el('[data-reset]').onclick=()=>{state.filters={};state.search='';state.sort={key:'sourceSales',desc:true};state.page=0;el('[data-search]').value='';headers();render()};
 el('[data-prev]').onclick=()=>{state.page--;render()};el('[data-next]').onclick=()=>{state.page++;render()};el('[data-group]').onchange=render;
 el('[data-csv]').onclick=()=>download(false).catch(error=>el('[data-count]').textContent=error.message);el('[data-xlsx]').onclick=()=>download(true).catch(error=>el('[data-count]').textContent=error.message);
 headers();render();return{setRows(rows,context={}){state.rows=rows;state.context=context;state.page=0;render()},getFiltered:()=>analysisRows(state.rows,columns,state)};
}

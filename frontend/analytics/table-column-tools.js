import {filterAndSortRows} from './table-analysis.js';
export function cellNumber(value){
 let text=String(value??'').trim().replace(/\u2212/g,'-').replace(/[\s\u00a0\u202f]/g,'');
 const scale=/KMAD$/i.test(text)?1000:/MDH$/i.test(text)?1000000:1;
 text=text.replace(/(?:KMAD|MDH|[A-Z]{3}|DH|€|\$|%|points)$/i,'');
 if(!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text))return null;
 const number=Number(text.replace(',','.'))*scale;return Number.isFinite(number)?number:null;
}
export function filterTableRecords(records,headers,filters,sort){
 const value=(row,i)=>{const v=row.cells[i]?.text??'';return /^(N\/A|N\/D|—)$/i.test(v.trim())?null:v};
 const columns=headers.map((label,i)=>({key:String(i),value:row=>value(row,i),numeric:false}));
 filters=Object.fromEntries(Object.entries(filters).map(([k,v])=>[k,/^n\/d$/i.test(v.trim())?'n/a':v]));
 const prepared=records.map(r=>({...r}));
 // A numeric operator is explicit; text searches still match formatted cells.
 for(const [key,query] of Object.entries(filters))if(/^(?:<=|>=|<|>|=)\s*-?\d+(?:[.,]\d+)?$/.test(query.trim())){
  const column=columns[Number(key)];if(column){column.numeric=true;column.value=r=>cellNumber(r.cells[Number(key)]?.text)}
 }
 const sorted=filterAndSortRows(prepared,columns,filters,{key:null});
 if(sort?.key==null)return sorted;
 const i=Number(sort.key),values=sorted.map(r=>cellNumber(r.cells[i]?.text)),numeric=values.some(v=>v!=null)&&values.every((v,n)=>v!=null||!sorted[n].cells[i]?.text?.trim()||/^(N\/A|N\/D|—)$/i.test(sorted[n].cells[i]?.text?.trim()));
 return filterAndSortRows(sorted,[{key:sort.key,numeric,value:r=>numeric?cellNumber(r.cells[i]?.text):value(r,i)}],{},sort);
}
export function mountTableColumnTools(){
 const models=new WeakMap();let queued=false;
 const observer=new MutationObserver(records=>{if(records.some(r=>r.target.closest?.('table')||[...r.addedNodes].some(n=>n.nodeType===1&&(n.tagName==='TABLE'||n.querySelector?.('table')))))schedule()});
 const observe=()=>observer.observe(document.body,{childList:true,subtree:true});
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;observer.disconnect();try{for(const table of document.querySelectorAll('main table'))enhance(table)}finally{observe()}})}
 function enhance(table){
  if(table.hasAttribute('data-ri-native-table'))return;
  if(table.closest('[hidden]'))return;
  const head=table.tHead,body=table.tBodies[0],first=head?.rows[0];if(!body||!first||first.cells.length<2)return;
  // Native analytical tables already filter their full data model, including pages.
  if(head.id==='performanceHead'||head.querySelector('input:not([data-ri-column-filter]),select')||first.querySelector('button'))return;
  let model=models.get(table);
  const headers=[...first.cells].map(c=>c.textContent.trim()),signature=headers.join('|');
  if(!model||model.signature!==signature||!head.querySelector('[data-ri-filter-row]')){
   clearTimeout(model?.timer);
   model?.toolbar.remove();head.querySelector('[data-ri-filter-row]')?.remove();
   model={signature,filters:{},sort:{key:null,desc:false},headers,order:new WeakMap(),ordinal:0,toolbar:document.createElement('div')};models.set(table,model);
   model.toolbar.className='ri-table-tools';
   const status=document.createElement('span'),reset=document.createElement('button'),exporter=document.createElement('button');
   reset.type=exporter.type='button';reset.textContent='Effacer les filtres et le tri';exporter.textContent='Exporter les lignes filtrées chargées';model.status=status;model.exporter=exporter;
   model.toolbar.append(status,reset,exporter);table.before(model.toolbar);
   const filters=document.createElement('tr');filters.dataset.riFilterRow='true';
   headers.forEach((label,i)=>{
    const cell=document.createElement('th'),input=document.createElement('input');input.type='search';input.dataset.riColumnFilter=String(i);input.setAttribute('aria-label','Filtrer '+label);input.placeholder='Filtrer · ex. >10';
    input.addEventListener('input',()=>{model.filters[String(i)]=input.value;clearTimeout(model.timer);exporter.disabled=true;model.timer=setTimeout(()=>refresh(table,model),150)});cell.append(input);filters.append(cell);
    const h=first.cells[i];h.tabIndex=0;h.title='Trier '+label;h.dataset.riSortColumn=String(i);
    const sort=()=>{const current=models.get(table);current.sort={key:String(i),desc:current.sort.key===String(i)?!current.sort.desc:false};refresh(table,current)};
    if(!h.dataset.riSortBound){h.dataset.riSortBound='true';h.addEventListener('click',sort);h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();sort()}})}
   });head.append(filters);
   reset.addEventListener('click',()=>{clearTimeout(model.timer);model.filters={};model.sort={key:null,desc:false};model.restoreOrder=true;for(const input of filters.querySelectorAll('input'))input.value='';refresh(table,model)});
   exporter.addEventListener('click',()=>{
    const escape=value=>'"'+String(value??'').replace(/^[\s]*[=+@-]/,m=>"'"+m).replaceAll('"','""')+'"';
    const rows=[headers,...(model.matching||[]).map(r=>r.cells.map(c=>c.text))],url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(escape).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='tableau-lignes-chargees.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   });
  }
  refresh(table,model);
 }
 function refresh(table,model){
  observer.disconnect();
  try{
   const body=table.tBodies[0],records=[...body.rows].filter(row=>row.cells.length===model.headers.length&&[...row.cells].every(c=>c.colSpan===1)).map(row=>({row,cells:[...row.cells].map(c=>({text:c.innerText||c.textContent||''}))}));
   for(const record of records)if(!model.order.has(record.row))model.order.set(record.row,model.ordinal++);
   if(model.restoreOrder){records.sort((a,b)=>model.order.get(a.row)-model.order.get(b.row));for(const record of records)body.append(record.row);model.restoreOrder=false}
   const matching=filterTableRecords(records,model.headers,model.filters,model.sort),selected=new Set(matching.map(x=>x.row));
   for(const record of records)record.row.hidden=!selected.has(record.row);
   if(model.sort.key!=null)for(const r of matching)body.append(r.row);
   for(const [i,h] of [...table.tHead.rows[0].cells].entries())h.setAttribute('aria-sort',model.sort.key===String(i)?model.sort.desc?'descending':'ascending':'none');
   model.matching=matching;model.exporter.disabled=!matching.length;model.status.textContent=matching.length+' / '+records.length+' lignes chargées · filtre du tableau uniquement, KPI et totaux de la page inchangés';
  }finally{observe()}
 }
 for(const event of ['retail-intelligence:section','retail-intelligence:period','retail-intelligence:decision'])document.addEventListener(event,schedule);
 observe();schedule();
}
if(typeof document!=='undefined')mountTableColumnTools();

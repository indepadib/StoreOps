import {esc,toast} from './ui.js';
import {api} from './api.js';
import {app} from './state.js';

const levels=['department','rayon','family','subfamily','subsubfamily','ub','article'];
const labels=['Département','Rayon','Famille','Sous-famille','Sous-sous-famille','UB','Article'];
const n=v=>Number(v||0);
const fmt=v=>v===null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:2});
export function hierarchyRows(products,previous,{level='department',prefix='',sort='sales',direction='desc'}={}){
 const selected=p=>!prefix||p.hierarchy?.ub?.startsWith(prefix);
 const group=list=>{
  const map=new Map();for(const p of list.filter(selected)){
   const node=p.hierarchy?.levels?.[level],key=level==='article'?p.key:node?.id||'__UNCLASSIFIED__',label=level==='article'?p.label:node?.label||'Non classé';
   const row=map.get(key)||{key,label,sales:0,units:0,articles:0,labelStatus:node?.labelStatus||null};row.sales+=n(p.sales);row.units+=n(p.units);row.articles++;map.set(key,row);
  }return map;
 };
 const now=group(products),old=previous===null?null:group(previous),total=[...now.values()].reduce((s,x)=>s+x.sales,0);
 if(old)for(const [key,p] of old)if(!now.has(key))now.set(key,{...p,sales:0,units:0,articles:0});
 const rows=[...now.values()].map(p=>({...p,previous:old?n(old.get(p.key)?.sales):null,delta:old?p.sales-n(old.get(p.key)?.sales):null,share:total?p.sales/total*100:null}));
 rows.sort((a,b)=>(direction==='asc'?1:-1)*(n(a[sort])-n(b[sort]))||a.key.localeCompare(b.key));
 return{rows,total};
}
export function renderHierarchyPerformance(host,pulse){
 const products=pulse.snapshot?.breakdowns?.products||[],previous=pulse.snapshot?.hierarchyPreviousProducts??null,coverage=pulse.snapshot?.dataCoverage||{};
 let level='department',prefix='',sort='sales',direction='desc',limit=50,query='';
 function draw(){
  const result=hierarchyRows(products,previous,{level,prefix,sort,direction}),filtered=result.rows.filter(r=>`${r.key} ${r.label}`.toLowerCase().includes(query.toLowerCase()));
  host.innerHTML=`<section class="performance-section"><div class="performance-section-head"><div><strong>Pilotage par hiérarchie article</strong><span>Département → Rayon → Famille → Sous-famille → Sous-sous-famille → UB → Article</span></div></div>
  <p>Libellés résolus : ${n(coverage.namesResolved)}/${n(coverage.products)} · Libellés de secours : ${n(coverage.namesFallback)} · UB affectées : ${n(coverage.ubResolved)}/${n(coverage.products)} · CA non classé : ${fmt(coverage.unclassifiedSales)} DH</p>
  ${pulse.snapshot?.hierarchyRead?.status==='UNAVAILABLE'?'<p role="status">Les catégories D365 sont temporairement indisponibles. Les ventes restent visibles ; actualisez pour réessayer le classement.</p>':''}
  <div class="form-grid"><label>Niveau<select data-h-level>${levels.map((l,i)=>`<option value="${l}" ${level===l?'selected':''}>${labels[i]}</option>`).join('')}</select></label><label>Classement<select data-h-sort><option value="sales" ${sort==='sales'?'selected':''}>CA</option><option value="units" ${sort==='units'?'selected':''}>Quantités</option><option value="delta" ${sort==='delta'?'selected':''}>Écart D-7</option></select></label><label>Ordre<select data-h-direction><option value="desc" ${direction==='desc'?'selected':''}>Plus forts</option><option value="asc" ${direction==='asc'?'selected':''}>Plus faibles</option></select></label><label>Rechercher<input data-h-query value="${esc(query)}" placeholder="Nom ou code"></label></div>
  <p>${prefix?`Périmètre ${esc(prefix)} <button class="btn soft" data-h-reset>Tout le magasin</button>`:'Tout le magasin'} · CA du périmètre : ${fmt(result.total)} DH</p>
  <div style="overflow-x:auto"><table class="table"><thead><tr><th>Rang</th><th>${labels[levels.indexOf(level)]}</th><th>CA</th><th>Poids CA</th><th>Quantités</th><th>Écart D-7${pulse.comparison?.mode==='SAME_TIME'?' même heure':''}</th><th></th></tr></thead><tbody>${filtered.slice(0,limit).map((r,i)=>`<tr><td>${result.rows.indexOf(r)+1}</td><td><strong>${esc(r.label)}</strong><div class="small muted">${esc(r.key==='__UNCLASSIFIED__'?'UB manquante ou ambiguë':r.key)}${r.labelStatus==='MISSING'?' · libellé catégorie à compléter':''}</div></td><td>${fmt(r.sales)} DH</td><td>${fmt(r.share)} %</td><td>${fmt(r.units)}</td><td>${fmt(r.delta)}${r.delta===null?'':' DH'}</td><td>${level!=='article'&&r.key!=='__UNCLASSIFIED__'?`<button class="btn soft" data-h-drill="${esc(r.key)}">Détail →</button>`:''}</td></tr>`).join('')}</tbody></table></div>
  ${filtered.length>limit?'<button class="btn soft" data-h-more>Afficher la suite</button>':''}<p>${filtered.length} résultats. Les ventes non classées restent incluses dans le total. Les retours conservent leur signe.</p>
  <button class="btn soft" data-h-sync>Actualiser les classements</button></section>`;
  host.querySelector('[data-h-level]').onchange=e=>{level=e.target.value;prefix='';limit=50;draw()};
  host.querySelector('[data-h-sort]').onchange=e=>{sort=e.target.value;draw()};
  host.querySelector('[data-h-direction]').onchange=e=>{direction=e.target.value;draw()};
  host.querySelector('[data-h-query]').onchange=e=>{query=e.target.value;limit=50;draw()};
  host.querySelector('[data-h-reset]')?.addEventListener('click',()=>{prefix='';level='department';draw()});
  host.querySelector('[data-h-more]')?.addEventListener('click',()=>{limit+=50;draw()});
  host.querySelectorAll('[data-h-drill]').forEach(b=>b.onclick=()=>{prefix=b.dataset.hDrill;level=levels[levels.indexOf(level)+1];query='';limit=50;draw()});
  host.querySelector('[data-h-sync]')?.addEventListener('click',async e=>{e.target.disabled=true;try{const refreshed=await api(`/api/stores/${app.storeId}/business-pulse/refresh`,{method:'POST'});renderHierarchyPerformance(host,refreshed);toast(refreshed.snapshot?.hierarchyRead?.status==='UNAVAILABLE'?'Catégories indisponibles, réessayez plus tard.':'Classements actualisés.')}catch(error){toast(error.message);e.target.disabled=false}});
 }
 draw();
}

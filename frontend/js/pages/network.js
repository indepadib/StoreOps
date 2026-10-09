import {api} from '../api.js';
import {app,isDirector} from '../state.js';
import {$,esc,status,fmtMoney} from '../ui.js';
import {assessNetworkStore,controlOverview,selectControlRows,CONTROL_STATES} from '../network-control-model.js';

let generation=0;
const localNetworkBase=()=>Array.isArray(app.stores)?app.stores.map(s=>({...s,dataHealth:{network:false}})):[];
const money=v=>v==null?'—':fmtMoney(v);
const count=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1});
async function read(path,timeout=12000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{return await api(path,{signal:controller.signal})}finally{clearTimeout(timer)}}
export async function renderNetwork(){
 if(!isDirector())return;
 const host=$('#networkContent');if(!host)return;const token=++generation;
 if(!document.getElementById('network-control-css')){const link=document.createElement('link');link.id='network-control-css';link.rel='stylesheet';link.href='/network-control.css';document.head.appendChild(link)}
 host.innerHTML='<div class="card" role="status">Chargement de la chambre de contrôle…</div>';
 let base,networkLive=true,error='';
 try{base=await read('/api/network',10000);if(!Array.isArray(base))throw new Error('Situation réseau indisponible')}catch(e){networkLive=false;error=e.message;base=localNetworkBase();if(!base.length)try{base=(await read('/api/stores')).map(s=>({...s,dataHealth:{network:false}}))}catch{}}
 if(token!==generation||!host.isConnected)return;
 if(!base?.length){host.innerHTML='<div class="card">Situation réseau indisponible. <button class="btn soft" data-network-retry>Réessayer</button></div>';host.querySelector('[data-network-retry]').onclick=()=>renderNetwork();return}
 let rows=base.map(r=>assessNetworkStore({...r,dataHealth:{...r.dataHealth,network:networkLive}})),filter='ATTENTION',query='',limit=20,selected=null,loadingStore=null,bulk=false,bulkDone=0;
 const detailCache=new Map();
 const active=()=>token===generation&&host.isConnected&&app.page==='network';
 function draw(){
  if(token!==generation)return;
  const summary=controlOverview(rows),visible=selectControlRows(rows,{filter,query}),selectedRow=rows.find(r=>r.id===selected);
  host.innerHTML=`<div class="ncc"><header class="ncc-hero"><div><span class="ncc-eyebrow">EXPLOITATION · RÉSEAU</span><h2>Chambre de contrôle</h2><p>${summary.total} magasins · ${summary.opened} ouverts · commencez par ceux qui nécessitent une intervention.</p></div><button class="btn soft" data-ncc-refresh>Actualiser la situation</button></header>
  ${!networkLive?`<p class="banner ban-danger">Mode de secours Réseau actif : les magasins sont visibles, mais leur situation doit être vérifiée. ${esc(error)}</p>`:''}
  <div class="ncc-status-grid">${Object.entries(CONTROL_STATES).map(([key,s])=>`<button class="ncc-status ncc-${key.toLowerCase()} ${filter===key?'active':''}" data-ncc-filter="${key}" aria-pressed="${filter===key}"><span>${s.label}</span><strong>${summary.counts[key]}</strong><small>${key==='CRITICAL'?'Action prioritaire':key==='WARNING'?'Points de vigilance':key==='UNKNOWN'?'Situation incomplète':'Aucune alerte remontée'}</small></button>`).join('')}</div>
  <section class="ncc-overview"><div><strong>Tout le réseau en un regard</strong><p>Chaque case représente un magasin. Cliquez pour comprendre sa situation.</p></div><div class="ncc-matrix">${selectControlRows(rows).map(r=>`<button class="ncc-tile ncc-${r.control.state.toLowerCase()} ${selected===r.id?'selected':''}" data-ncc-store="${esc(r.id)}" aria-label="${esc(r.name+' : '+r.control.label+' · '+r.control.primary)}" title="${esc(r.name+' · '+r.control.primary)}"><strong>${esc(r.code||r.name)}</strong><span>${esc(r.control.label)}</span></button>`).join('')}</div></section>
  <div class="ncc-business"><div><span>CA réseau disponible</span><strong>${money(summary.sales)}</strong><small>${summary.salesCoverage}/${summary.total} magasins · les données absentes ne sont pas comptées à zéro</small></div><button class="btn soft" data-ncc-sales ${bulk?'disabled':''}>${bulk?`Lecture des CA : ${bulkDone}/${rows.length}`:'Charger les CA du réseau'}</button></div>
  <div class="ncc-layout"><section class="ncc-list"><div class="ncc-tools"><label>Rechercher un magasin<input data-ncc-search value="${esc(query)}" placeholder="Nom, code ou responsable"></label><label>Afficher<select data-ncc-select><option value="ALL" ${filter==='ALL'?'selected':''}>Tous les magasins</option><option value="ATTENTION" ${filter==='ATTENTION'?'selected':''}>Magasins à traiter ou vérifier</option>${Object.entries(CONTROL_STATES).map(([key,s])=>`<option value="${key}" ${filter===key?'selected':''}>${s.label}</option>`).join('')}</select></label></div><div class="table-wrap"><table class="table"><thead><tr><th>Magasin</th><th>Situation</th><th>Priorité à comprendre</th><th>CA / D-7</th></tr></thead><tbody>${visible.slice(0,limit).map(r=>`<tr class="${selected===r.id?'ncc-selected':''}"><td><button class="ncc-store-link" data-ncc-store="${esc(r.id)}">${esc(r.name)}</button><small>${esc(r.control.phase)}</small></td><td>${status(r.control.label,r.control.tone)}</td><td>${esc(r.control.primary)}${r.control.reasons.length>1?`<small>+ ${r.control.reasons.length-1} autre(s) point(s)</small>`:''}</td><td>${money(r.control.kpis.netSales)}<small>${r.control.pulseReady&&r.businessPulse?.comparison?.available&&r.control.kpis.changeVsComparison!=null?Number(r.control.kpis.changeVsComparison).toFixed(1)+' % à même période':'Comparatif non disponible'}</small></td></tr>`).join('')||'<tr><td colspan="4">Aucun magasin dans ce filtre.</td></tr>'}</tbody></table></div><p>${visible.length} magasin(s)${visible.length>limit?` · <button class="btn soft" data-ncc-more>Afficher les suivants</button>`:''}</p></section><aside class="ncc-detail" aria-live="polite">${selectedRow?detail(selectedRow):'<div class="ncc-empty"><strong>Sélectionnez un magasin</strong><p>Vous verrez les alertes, le responsable et les domaines à traiter, puis les chiffres détaillés.</p></div>'}</aside></div>
  <p class="small muted">Situation opérationnelle issue de StoreOps · les CA sont chargés à la demande. Le gris indique une situation incomplète. Une baisse de CA n’est signalée que si le comparatif D-7 est disponible ; elle ne prouve pas une cause.</p></div>`;
  host.querySelector('[data-ncc-refresh]').onclick=()=>renderNetwork();
  host.querySelectorAll('[data-ncc-filter]').forEach(b=>b.onclick=()=>{filter=filter===b.dataset.nccFilter?'ALL':b.dataset.nccFilter;limit=20;draw()});
  host.querySelector('[data-ncc-select]').onchange=e=>{filter=e.target.value;limit=20;draw()};
  host.querySelector('[data-ncc-search]').oninput=e=>{query=e.target.value;limit=20;const position=e.target.selectionStart;draw();const input=host.querySelector('[data-ncc-search]');input.focus();input.setSelectionRange(position,position)};
  host.querySelectorAll('[data-ncc-store]').forEach(b=>b.onclick=()=>selectStore(b.dataset.nccStore));
  host.querySelector('[data-ncc-more]')?.addEventListener('click',()=>{limit+=20;draw()});
  host.querySelector('[data-ncc-sales]').onclick=()=>loadSales();
  host.querySelector('[data-ncc-close]')?.addEventListener('click',()=>{selected=null;draw()});
  host.querySelector('[data-ncc-retry-detail]')?.addEventListener('click',()=>{detailCache.delete(selected);selectStore(selected)});
 }
 function detail(r){
  const c=r.control,k=c.kpis,d=detailCache.get(r.id),pulse=r.businessPulse;
  return `<div class="ncc-detail-head"><div><span>${esc(r.code||'Magasin')}</span><h3>${esc(r.name)}</h3>${status(c.label,c.tone)}</div><button class="btn soft" data-ncc-close aria-label="Fermer le détail">Fermer</button></div><p><strong>${esc(c.primary)}</strong></p><p>Responsable : ${esc(r.day?.opening_owner_name||'Non attribué')} · ${esc(c.phase)}</p><section><h4>Ce qui nécessite une action</h4>${c.reasons.map(reason=>`<p>${status(CONTROL_STATES[reason.state].label,CONTROL_STATES[reason.state].tone)} ${esc(reason.label)}</p>`).join('')||'<p>Aucune alerte opérationnelle remontée.</p>'}</section>
  <details open><summary>Comprendre les opérations</summary><div class="ncc-detail-metrics">${[['Ouverture',r.opening?.percent==null?'—':r.opening.percent+' %'],['Froid en écart',count(r.coldChain?.mismatch)],['Équipe présente',count(r.staffing?.present)],['Caisses prêtes',count(r.cashOpening?.ready)],['Prix / promos à faire',count(r.commercial?.pending)],['Incidents ouverts',count(r.openIncidents)],['DLC périmées',count(r.dlc?.expired)],['Recomptages',count(r.inventory?.pendingRecounts)]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div></details>
  <details open><summary>Comprendre l’activité</summary>${loadingStore===r.id?'<p role="status">Lecture des ventes de ce magasin…</p>':''}${d?.error?`<p>Ventes indisponibles : ${esc(d.error)}</p><button class="btn soft" data-ncc-retry-detail>Réessayer</button>`:''}<div class="ncc-detail-metrics"><div><span>CA</span><strong>${money(k.netSales)}</strong></div><div><span>Panier</span><strong>${money(k.averageBasket)}</strong></div><div><span>Tickets</span><strong>${count(k.tickets)}</strong></div><div><span>Ruptures</span><strong>${count(k.outOfStockCount)}</strong></div></div>${c.pulseReady?`<p>D-7 ${esc(pulse.comparison?.cutoffLabel||'journée complète')} : ${money(k.comparison)} · ${pulse.comparison?.available?'période comparable':'comparatif indisponible'}.</p>${pulse.analysis?.decomposition?`<p>Contribution des tickets : ${money(pulse.analysis.decomposition.ticketContribution)} · du panier : ${money(pulse.analysis.decomposition.basketContribution)}.</p>`:''}<small>Ventes actualisées : ${esc(new Date(pulse.refreshedAt).toLocaleTimeString('fr-FR'))}</small>`:'<p>Les chiffres absents restent à « — ».</p>'}</details>
  <button class="btn brand wide" data-network-store="${esc(r.id)}">Ouvrir le magasin et traiter →</button>`;
 }
 async function selectStore(id){
  selected=id;draw();
  if(window.matchMedia('(max-width:950px)').matches)host.querySelector('.ncc-detail')?.scrollIntoView({behavior:'smooth',block:'start'});
  if(detailCache.has(id))return;
  loadingStore=id;draw();
  try{const pulse=await read(`/api/stores/${encodeURIComponent(id)}/business-pulse`);if(!active())return;detailCache.set(id,{ok:true});rows=rows.map(r=>r.id===id?assessNetworkStore({...r,businessPulse:pulse}):r)}catch(e){if(active())detailCache.set(id,{error:e.message})}finally{if(loadingStore===id)loadingStore=null;if(active())draw()}
 }
 async function loadSales(){
  if(bulk)return;bulk=true;bulkDone=0;draw();let cursor=0;
  await Promise.all(Array.from({length:Math.min(3,rows.length)},async()=>{while(active()&&cursor<rows.length){const id=rows[cursor++].id;try{const pulse=await read(`/api/stores/${encodeURIComponent(id)}/business-pulse`);if(!active())return;rows=rows.map(r=>r.id===id?assessNetworkStore({...r,businessPulse:pulse}):r)}catch{}bulkDone++;if(active())draw()}}));
  bulk=false;if(active())draw();
 }
 draw();
}

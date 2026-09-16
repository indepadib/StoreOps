import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,esc } from '../ui.js';
import { managerPhase,managerPhaseLabel,chooseManagerNextAction } from '../manager-journey.js';
import { managerDayCompliance } from '../manager-compliance.js';
import { loadManagerInbox,categoryLabel,syncManagerNav } from '../manager-action-inbox.js';

const money=v=>v==null?'—':Number(v).toLocaleString('fr-MA',{minimumFractionDigits:0,maximumFractionDigits:0})+' DH';
const number=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:0});
const pct=v=>v==null?'—':`${Number(v)>0?'+':''}${Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1})}%`;

const phaseCopy={
 OPENING:{title:'Préparons le magasin.',subtitle:'StoreOps vous guide jusqu’à une ouverture prête et sûre.'},
 DAY:{title:'Votre magasin est en mouvement.',subtitle:'Je vous montre uniquement ce qui mérite votre attention maintenant.'},
 CLOSING:{title:'Terminons la journée proprement.',subtitle:'Les contrôles obligatoires passent avant la fermeture.'},
 CLOSED:{title:'La journée est terminée.',subtitle:'Tout est tracé. Vous pouvez consulter le bilan quand vous le souhaitez.'}
};

function actionUrgency(item){
 if(!item)return'';
 if(item.blocking||item.priority==='P0'||item.severity==='CRITICAL')return'Priorité immédiate';
 if(item.priority==='P1'||item.severity==='HIGH')return'À faire aujourd’hui';
 return'À suivre';
}
function primaryAction(item,{position=1,total=1,loading=false}={}){
 if(loading)return `<section class="today-primary today-loading"><div class="today-primary-top"><span>À faire maintenant</span><span>Analyse en cours…</span></div><div class="today-loading-line wide"></div><div class="today-loading-line"></div><div class="today-loading-cta"></div></section>`;
 if(!item)return `<section class="today-primary today-clear"><div class="today-clear-mark">✓</div><div><span class="today-kicker">Pour le moment</span><h2>Tout est sous contrôle.</h2><p>Aucune action prioritaire n’est détectée. Continuez votre journée normalement.</p><button class="today-primary-cta secondary" data-manager-go="managerScan">Scanner un article</button></div></section>`;
 const page=esc(item.page||'managerMore');
 return `<section class="today-primary ${item.blocking||item.priority==='P0'?'urgent':''}">
  <div class="today-primary-top"><span class="today-kicker">À faire maintenant</span><span class="today-position">${Math.min(position,total)} sur ${Math.max(total,1)}</span></div>
  <div class="today-action-context"><span>${esc(categoryLabel(item.category||'OTHER'))}</span><span>•</span><span>${esc(actionUrgency(item))}</span></div>
  <h2>${esc(item.title||'Action à traiter')}</h2>
  <p>${esc(item.detail||'Ouvrez l’action pour continuer.')}</p>
  <button class="today-primary-cta" data-manager-go="${page}">Commencer <span>→</span></button>
 </section>`;
}
function nextRow(item,index){
 return `<button class="today-next-row" data-manager-go="${esc(item.page||'managerMore')}"><span class="today-next-index">${index}</span><span class="today-next-copy"><small>${esc(categoryLabel(item.category||'OTHER'))}</small><strong>${esc(item.title||'Action')}</strong></span><span class="today-next-arrow">›</span></button>`;
}
function nextSection(items=[],remaining=0,loading=false){
 if(loading)return `<section class="today-section"><div class="today-section-head"><div><span class="today-kicker">Ensuite</span><h3>Votre suite arrive…</h3></div></div><div class="today-next-list"><div class="today-next-skeleton"></div><div class="today-next-skeleton"></div></div></section>`;
 if(!items.length&&!remaining)return'';
 return `<section class="today-section"><div class="today-section-head"><div><span class="today-kicker">Ensuite</span><h3>${items.length?'Les prochaines choses à traiter':'Il reste quelques actions'}</h3></div>${remaining?`<button class="today-text-link" data-manager-go="managerControls">Tout voir · ${remaining+items.length}</button>`:''}</div><div class="today-next-list">${items.map((x,i)=>nextRow(x,i+2)).join('')}</div></section>`;
}
function journeyStrip(phase,compliance,hours,alerts=0){
 const current=phase==='CLOSED'?'Journée terminée':managerPhaseLabel(phase);
 return `<section class="today-journey"><div class="today-section-head"><div><span class="today-kicker">Votre journée</span><h3>${esc(current)}</h3></div><button class="today-text-link" data-manager-go="managerJourney">Voir le parcours</button></div>
  <div class="today-progress-copy"><span>${compliance.done}/${compliance.total} obligation(s) réalisées</span><strong>${compliance.percent}%</strong></div>
  <div class="today-progress"><i style="width:${Math.max(0,Math.min(100,compliance.percent))}%"></i></div>
  <div class="today-journey-meta"><span>${esc(hours||'Horaires magasin')}</span>${alerts?`<button data-manager-go="incidents">${alerts} alerte(s) ouverte(s)</button>`:'<span>Aucune alerte critique</span>'}</div>
 </section>`;
}
function pulseCompact(p,loading=false){
 if(loading)return `<section class="today-pulse"><div class="today-section-head"><div><span class="today-kicker">En un coup d’œil</span><h3>Activité du magasin</h3></div></div><div class="today-pulse-grid"><div><span>CA</span><strong>…</strong></div><div><span>Tickets</span><strong>…</strong></div><div><span>Ruptures</span><strong>…</strong></div></div></section>`;
 if(!p||p.status!=='READY'||!p.snapshot)return `<section class="today-pulse muted"><div><span class="today-kicker">En un coup d’œil</span><h3>Les ventes ne sont pas encore connectées.</h3><p>Les opérations magasin restent disponibles sans estimation artificielle.</p></div></section>`;
 const k=p.snapshot.kpis||{},change=k.changeVsComparison;
 return `<section class="today-pulse"><div class="today-section-head"><div><span class="today-kicker">En un coup d’œil</span><h3>Activité du magasin</h3></div><button class="today-text-link" data-manager-go="managerPerformance">Détails</button></div><div class="today-pulse-grid"><button data-manager-go="managerPerformance"><span>CA</span><strong>${money(k.netSales)}</strong><small>${change==null?'Aujourd’hui':`${pct(change)} vs D-7`}</small></button><button data-manager-go="managerPerformance"><span>Tickets</span><strong>${number(k.tickets)}</strong><small>Panier ${money(k.averageBasket)}</small></button><button data-manager-go="managerPerformance"><span>Ruptures</span><strong>${number(k.outOfStockCount)}</strong><small>${p.stock?.assortmentReady?'Assortiment actif':'Assortiment à vérifier'}</small></button></div></section>`;
}
function skeleton(){
 const store=currentStore(),firstName=String(app.user?.name||'Responsable').trim().split(/\s+/)[0];
 $('#todayContent').innerHTML=`<div class="today-concierge"><header class="today-greeting"><span>${esc(store?.name||'Magasin')}</span><h1>Bonjour ${esc(firstName)}</h1><p>Je prépare votre prochaine action.</p></header>${primaryAction(null,{loading:true})}${nextSection([],0,true)}${pulseCompact(null,true)}</div>`;
}
function localSummary(fast,inbox){
 const d=inbox?.dashboard||fast?.dashboard||{},staff=inbox?.staff||fast?.staff||{},cold=inbox?.cold||fast?.cold||{},cashOpen=inbox?.cashOpen||fast?.cashOpen||{},receipts=inbox?.receipts||fast?.receipts||{},quality=inbox?.quality||fast?.quality||{},maintenance=inbox?.maintenance||{},loss=inbox?.lossData?.summary||fast?.loss||{};
 return{dashboard:d,staff,cold,cashOpen,receipts,quality,maintenance,loss,compliance:managerDayCompliance({dashboard:d,staff,cold,cashOpen,receipts,quality,maintenance,loss})};
}
function renderState({fast,inbox,pulse,pulseLoading=false,detailsLoading=false}){
 const local=localSummary(fast,inbox),d=local.dashboard;if(!d||!Object.keys(d).length)return;
 const store=currentStore(),phase=managerPhase(d),copy=phaseCopy[phase]||phaseCopy.DAY,firstName=String(app.user?.name||'Responsable').trim().split(/\s+/)[0],hours=store?.opening_time&&store?.closing_time?`${store.opening_time}–${store.closing_time}`:'';
 let primary=null,next=[];
 if(inbox){primary=inbox.items?.[0]||null;next=(inbox.items||[]).slice(1,3)}else primary=chooseManagerNextAction({dashboard:d,staff:local.staff,cold:local.cold,cashOpen:local.cashOpen,receipts:local.receipts,quality:local.quality,maintenance:local.maintenance,loss:local.loss,incidents:[]});
 const total=inbox?.summary?.total??(primary?1:0),remaining=inbox?Math.max(0,total-1-next.length):0,alerts=inbox?.summary?.alerts??Number(d.incidents||0);
 $('#todayContent').innerHTML=`<div class="today-concierge">
  <header class="today-greeting"><div><span>${esc(store?.name||'Magasin')} · ${esc(managerPhaseLabel(phase))}</span><h1>Bonjour ${esc(firstName)}</h1><p>${esc(copy.subtitle)}</p></div><div class="today-phase-dot ${phase.toLowerCase()}"></div></header>
  ${primaryAction(primary,{position:1,total:Math.max(total,1),loading:false})}
  ${nextSection(next,remaining,detailsLoading)}
  ${journeyStrip(phase,local.compliance,hours,alerts)}
  ${pulseCompact(pulse,pulseLoading)}
  <div class="today-footer-link"><button data-manager-go="managerMore">Plus d’outils magasin <span>›</span></button></div>
 </div>`;
}

export async function renderManagerHome(){
 const storeId=app.storeId;skeleton();
 let fast=null,inbox=null,pulse=null,pulseLoading=true,detailsLoading=true;
 try{fast=await api(`/api/stores/${storeId}/manager-home-fast`)}catch{}
 if(app.storeId!==storeId)return;
 if(fast)renderState({fast,inbox:null,pulse:null,pulseLoading:true,detailsLoading:true});
 else{
  try{inbox=await loadManagerInbox();syncManagerNav(inbox);detailsLoading=false;renderState({fast:null,inbox,pulse:null,pulseLoading:true,detailsLoading:false})}catch{return}
 }
 const redraw=()=>{if(app.storeId===storeId)renderState({fast,inbox,pulse,pulseLoading,detailsLoading})};
 try{
  const enriched=await (inbox?Promise.resolve(inbox):api(`/api/stores/${storeId}/manager-inbox-batch`).catch(()=>loadManagerInbox()));
  if(app.storeId!==storeId)return;
  inbox=enriched;syncManagerNav(inbox);detailsLoading=false;
  if(enriched?.businessPulse){pulse=enriched.businessPulse;pulseLoading=false;redraw();return}
  redraw();
  try{pulse=await api(`/api/stores/${storeId}/business-pulse`)}catch{pulse=null}
  pulseLoading=false;redraw();
 }catch{
  detailsLoading=false;
  try{pulse=await api(`/api/stores/${storeId}/business-pulse`)}catch{pulse=null}
  pulseLoading=false;redraw();
 }
}

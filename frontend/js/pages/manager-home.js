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
 OPENING:{eyebrow:'OUVERTURE',title:'On ouvre le magasin.',subtitle:'Une étape à la fois. Je vous montre uniquement la prochaine.'},
 DAY:{eyebrow:'JOURNÉE',title:'Le magasin tourne.',subtitle:'Je garde le reste en arrière-plan et je vous montre ce qui compte maintenant.'},
 CLOSING:{eyebrow:'FERMETURE',title:'On termine proprement.',subtitle:'Les obligations arrivent dans le bon ordre, sans chercher dans les menus.'},
 CLOSED:{eyebrow:'TERMINÉ',title:'C’est terminé pour aujourd’hui.',subtitle:'Tout est tracé. Le bilan reste accessible quand vous en avez besoin.'}
};
const phaseOrder=['OPENING','DAY','CLOSING'];
const phaseShort={OPENING:'Ouvrir',DAY:'Piloter',CLOSING:'Fermer'};

function actionUrgency(item){
 if(!item)return'';
 if(item.blocking||item.priority==='P0'||item.severity==='CRITICAL')return'À faire maintenant';
 if(item.priority==='P1'||item.severity==='HIGH')return'À faire aujourd’hui';
 return'À suivre';
}
function ctaLabel(item,phase){
 if(!item)return'Scanner un article';
 const byCategory={
  OPENING:'Continuer l’ouverture',COMMERCIAL:'Vérifier maintenant',STOCK:'Contrôler l’article',RECEIPT:'Contrôler la réception',INVENTORY:'Ouvrir le comptage',DLC:'Traiter maintenant',QUALITY:'Faire le contrôle',LOSS:'Finaliser la démarque'
 };
 if(item.page==='closing'||phase==='CLOSING'&&item.category==='OPENING')return'Continuer la fermeture';
 return byCategory[item.category]||'Continuer';
}
function phaseRail(phase){
 const current=phase==='CLOSED'?3:Math.max(0,phaseOrder.indexOf(phase));
 return `<div class="today-dayrail" aria-label="Parcours de la journée">${phaseOrder.map((p,i)=>`<div class="today-dayrail-step ${i<current?'done':i===current?'current':''}"><span>${i<current?'✓':i+1}</span><strong>${phaseShort[p]}</strong></div>`).join('')}</div>`;
}
function primaryAction(item,{position=1,total=1,loading=false,phase='DAY'}={}){
 if(loading)return `<section class="today-command today-loading" aria-busy="true"><div class="today-command-meta"><span class="today-kicker">MAINTENANT</span><span>Analyse en cours…</span></div><div class="today-loading-line wide"></div><div class="today-loading-line"></div><div class="today-loading-cta"></div></section>`;
 if(!item)return `<section class="today-command today-command-clear"><div class="today-command-check">✓</div><div class="today-command-body"><span class="today-kicker">MAINTENANT</span><h2>Rien à traiter.</h2><p>Tout est sous contrôle pour le moment.</p><button class="today-primary-cta secondary" data-manager-go="managerScan">Scanner un article <span>→</span></button></div></section>`;
 const page=esc(item.page||'managerMore'),blocking=item.blocking||item.priority==='P0'||item.severity==='CRITICAL';
 return `<section class="today-command ${blocking?'urgent':''}">
  <div class="today-command-meta"><span class="today-kicker">MAINTENANT</span><span class="today-position">${Math.min(position,total)} / ${Math.max(total,1)}</span></div>
  <div class="today-command-tags"><span>${esc(categoryLabel(item.category||'OTHER'))}</span><span>${esc(actionUrgency(item))}</span></div>
  <h2>${esc(item.title||'Action à traiter')}</h2>
  <p>${esc(item.detail||'Ouvrez cette action pour continuer.')}</p>
  ${blocking?'<div class="today-command-note"><span>!</span><strong>Cette action passe avant le reste.</strong></div>':''}
  <button class="today-primary-cta" data-manager-go="${page}">${esc(ctaLabel(item,phase))} <span>→</span></button>
 </section>`;
}
function nextRow(item,index){
 return `<button class="today-next-row" data-manager-go="${esc(item.page||'managerMore')}"><span class="today-next-index">${index}</span><span class="today-next-copy"><small>${esc(categoryLabel(item.category||'OTHER'))}</small><strong>${esc(item.title||'Action')}</strong></span><span class="today-next-arrow">›</span></button>`;
}
function nextSection(items=[],remaining=0,loading=false){
 if(loading)return `<details class="today-queue today-loading-queue"><summary><span><small>ENSUITE</small><strong>Je prépare la suite…</strong></span><span class="today-queue-chevron">⌄</span></summary></details>`;
 const count=items.length+remaining;if(!count)return'';
 return `<details class="today-queue"><summary><span><small>ENSUITE</small><strong>${count} autre${count>1?'s':''} action${count>1?'s':''}</strong></span><span class="today-queue-chevron">⌄</span></summary><div class="today-queue-body">${items.map((x,i)=>nextRow(x,i+2)).join('')}${remaining?`<button class="today-queue-all" data-manager-go="managerControls">Voir toutes les actions · ${count}</button>`:''}</div></details>`;
}
function journeyStrip(phase,compliance,hours,alerts=0){
 const label=phase==='CLOSED'?'Journée terminée':managerPhaseLabel(phase);
 return `<section class="today-journey"><div class="today-section-head"><div><span class="today-kicker">PARCOURS</span><h3>${esc(label)}</h3></div><button class="today-text-link" data-manager-go="managerJourney">Voir</button></div>
  <div class="today-progress-copy"><span>${compliance.done}/${compliance.total} obligation${compliance.total>1?'s':''} réalisée${compliance.done>1?'s':''}</span><strong>${compliance.percent}%</strong></div>
  <div class="today-progress"><i style="width:${Math.max(0,Math.min(100,compliance.percent))}%"></i></div>
  <div class="today-journey-meta"><span>${esc(hours||'Horaires magasin')}</span>${alerts?`<button data-manager-go="incidents">${alerts} alerte${alerts>1?'s':''}</button>`:'<span>Aucune alerte critique</span>'}</div>
 </section>`;
}
function pulseCompact(p,loading=false){
 if(loading)return `<section class="today-pulse"><div class="today-section-head"><div><span class="today-kicker">EN UN COUP D’ŒIL</span><h3>Le magasin</h3></div></div><div class="today-pulse-grid"><div><span>CA</span><strong>…</strong></div><div><span>Tickets</span><strong>…</strong></div><div><span>Ruptures</span><strong>…</strong></div></div></section>`;
 if(!p||p.status!=='READY'||!p.snapshot)return `<section class="today-pulse muted"><div><span class="today-kicker">EN UN COUP D’ŒIL</span><h3>Les ventes ne sont pas encore connectées.</h3><p>Les opérations restent disponibles sans estimation artificielle.</p></div></section>`;
 const k=p.snapshot.kpis||{},change=k.changeVsComparison;
 return `<section class="today-pulse"><div class="today-section-head"><div><span class="today-kicker">EN UN COUP D’ŒIL</span><h3>Le magasin</h3></div><button class="today-text-link" data-manager-go="managerPerformance">Détails</button></div><div class="today-pulse-grid"><div><span>CA</span><strong>${money(k.netSales)}</strong><small>${change==null?'Aujourd’hui':`${pct(change)} vs D-7`}</small></div><div><span>Tickets</span><strong>${number(k.tickets)}</strong><small>Panier ${money(k.averageBasket)}</small></div><div><span>Ruptures</span><strong>${number(k.outOfStockCount)}</strong><small>${p.stock?.assortmentReady?'Assortiment actif':'Assortiment à vérifier'}</small></div></div></section>`;
}
function skeleton(){
 const store=currentStore(),firstName=String(app.user?.name||'Responsable').trim().split(/\s+/)[0];
 $('#todayContent').innerHTML=`<div class="today-concierge"><header class="today-greeting"><div><span>${esc(store?.name||'Magasin')}</span><h1>Bonjour ${esc(firstName)}</h1><p>Je prépare votre prochaine action.</p></div></header>${phaseRail('OPENING')}${primaryAction(null,{loading:true})}${nextSection([],0,true)}${pulseCompact(null,true)}</div>`;
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
  <header class="today-greeting"><div><span>${esc(store?.name||'Magasin')} · ${esc(copy.eyebrow)}</span><h1>Bonjour ${esc(firstName)}</h1><p>${esc(copy.subtitle)}</p></div><div class="today-live-state"><i></i><span>${esc(managerPhaseLabel(phase))}</span></div></header>
  ${phaseRail(phase)}
  ${primaryAction(primary,{position:1,total:Math.max(total,1),loading:false,phase})}
  ${nextSection(next,remaining,detailsLoading)}
  ${pulseCompact(pulse,pulseLoading)}
  ${journeyStrip(phase,local.compliance,hours,alerts)}
  <div class="today-footer-link"><button data-manager-go="managerMore">Tous les outils <span>›</span></button></div>
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

import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,esc } from '../ui.js';
import { managerPhase,managerPhaseLabel,chooseManagerNextAction } from '../manager-journey.js';
import { managerDayCompliance } from '../manager-compliance.js';
import { loadManagerInbox,categoryLabel,syncManagerNav } from '../manager-action-inbox.js';
import { scheduleCommercialLiveRefresh } from '../commercial-live-refresh.js';

const money=v=>v==null?'—':Number(v).toLocaleString('fr-MA',{minimumFractionDigits:0,maximumFractionDigits:0})+' DH';
const number=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:0});
const pct=v=>v==null?'—':`${Number(v)>0?'+':''}${Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1})}%`;

function ensurePreviewStyles(){
 if(document.querySelector('link[data-storeops-today-v185]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href='/manager-today-v185.css';link.dataset.storeopsTodayV185='1';document.head.appendChild(link);
}

const phaseCopy={
 OPENING:{eyebrow:'OUVERTURE',subtitle:'On prépare le magasin. Je vous montre seulement ce qui compte maintenant.'},
 DAY:{eyebrow:'JOURNÉE',subtitle:'Le magasin tourne. Voici l’essentiel et les trois priorités à traiter.'},
 CLOSING:{eyebrow:'FERMETURE',subtitle:'On termine proprement, dans le bon ordre, sans chercher dans les menus.'},
 CLOSED:{eyebrow:'TERMINÉ',subtitle:'La journée est terminée. Le bilan reste disponible si vous en avez besoin.'}
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
 const byCategory={OPENING:'Continuer',COMMERCIAL:'Vérifier',STOCK:'Contrôler',RECEIPT:'Contrôler',INVENTORY:'Ouvrir',DLC:'Traiter',QUALITY:'Contrôler',LOSS:'Finaliser'};
 if(item.page==='closing'||phase==='CLOSING'&&item.category==='OPENING')return'Continuer';
 return byCategory[item.category]||'Ouvrir';
}
function phaseRail(phase){
 const current=phase==='CLOSED'?3:Math.max(0,phaseOrder.indexOf(phase));
 return `<div class="today-dayrail" aria-label="Parcours de la journée">${phaseOrder.map((p,i)=>`<div class="today-dayrail-step ${i<current?'done':i===current?'current':''}"><span>${i<current?'✓':i+1}</span><strong>${phaseShort[p]}</strong></div>`).join('')}</div>`;
}
function pulseCompact(p,loading=false){
 if(loading)return `<section class="today-pulse today-pulse-hero" aria-busy="true"><div class="today-section-head"><div><span class="today-kicker">BUSINESS PULSE</span><h3>Votre magasin aujourd’hui</h3></div><span class="today-pulse-live">Mise à jour…</span></div><div class="today-pulse-grid today-pulse-grid-4"><div><span>CA</span><strong>…</strong></div><div><span>Tickets</span><strong>…</strong></div><div><span>Panier</span><strong>…</strong></div><div><span>Ruptures</span><strong>…</strong></div></div></section>`;
 if(!p||p.status!=='READY'||!p.snapshot){
  const integration=p?.integration||{},channel=integration.retailId,mappingState=integration.mappingState;
  if(p?.status==='DEGRADED')return `<section class="today-pulse today-pulse-hero muted"><div class="today-section-head"><div><span class="today-kicker">BUSINESS PULSE</span><h3>Connexion ventes Dynamics à vérifier.</h3></div></div><p>${esc(p?.error?.message||'La dernière lecture ventes a échoué. Aucun chiffre incomplet n’est affiché.')}</p></section>`;
  if(channel&&mappingState!=='LIVE')return `<section class="today-pulse today-pulse-hero muted"><div class="today-section-head"><div><span class="today-kicker">BUSINESS PULSE</span><h3>Ventes Dynamics à finaliser.</h3></div></div><p>Le canal magasin <strong>${esc(channel)}</strong> est identifié. Le mapping transactions doit encore réussir son smoke et être activé dans Admin Studio. Aucun CA n’est inventé.</p></section>`;
  return `<section class="today-pulse today-pulse-hero muted"><div class="today-section-head"><div><span class="today-kicker">BUSINESS PULSE</span><h3>Les ventes ne sont pas encore connectées.</h3></div></div><p>StoreOps n’invente aucun chiffre. Les opérations terrain restent disponibles.</p></section>`
 }
 const k=p.snapshot.kpis||{},change=k.changeVsComparison;
 return `<section class="today-pulse today-pulse-hero"><div class="today-section-head"><div><span class="today-kicker">BUSINESS PULSE</span><h3>Votre magasin aujourd’hui</h3></div><button class="today-text-link" data-manager-go="managerPerformance">Voir le détail</button></div><div class="today-pulse-grid today-pulse-grid-4"><div><span>CA</span><strong>${money(k.netSales)}</strong><small>${change==null?'Aujourd’hui':`${pct(change)} vs D-7`}</small></div><div><span>Tickets</span><strong>${number(k.tickets)}</strong><small>${number(k.units)} article${Number(k.units||0)>1?'s':''}</small></div><div><span>Panier</span><strong>${money(k.averageBasket)}</strong><small>${k.marginRate==null?'Marge non connectée':`Marge ${pct(k.marginRate)}`}</small></div><div><span>Ruptures</span><strong>${number(k.outOfStockCount)}</strong><small>${p.stock?.ruptureReady?'Vendus 30j · stock 0':'Ventes / stock à vérifier'}</small></div></div></section>`;
}
function priorityCard(item,index,phase){
 if(!item)return'';
 const critical=item.blocking||item.priority==='P0'||item.severity==='CRITICAL';
 return `<button class="today-priority-card ${index===0?'primary':''} ${critical?'urgent':''}" data-manager-go="${esc(item.page||'managerMore')}"><span class="today-priority-rank">${index+1}</span><span class="today-priority-copy"><small>${esc(categoryLabel(item.category||'OTHER'))} · ${esc(actionUrgency(item))}</small><strong>${esc(item.title||'Action à traiter')}</strong><span>${esc(item.detail||'Ouvrez cette action pour continuer.')}</span></span><span class="today-priority-cta">${esc(ctaLabel(item,phase))} ›</span></button>`;
}
function prioritiesSection(items=[],loading=false,phase='DAY',total=0){
 if(loading)return `<section class="today-priorities"><div class="today-section-head"><div><span class="today-kicker">VOS PRIORITÉS</span><h3>Ce qui demande votre attention</h3></div></div><div class="today-priority-list"><div class="today-priority-skeleton"></div><div class="today-priority-skeleton"></div><div class="today-priority-skeleton"></div></div></section>`;
 const top=items.slice(0,3);
 if(!top.length)return `<section class="today-priorities today-priorities-clear"><div class="today-clear-icon">✓</div><div><span class="today-kicker">VOS PRIORITÉS</span><h3>Rien d’urgent pour le moment.</h3><p>Continuez votre journée normalement. StoreOps vous alertera si quelque chose change.</p></div></section>`;
 const remaining=Math.max(0,total-top.length);
 return `<section class="today-priorities"><div class="today-section-head"><div><span class="today-kicker">VOS PRIORITÉS</span><h3>${top.length} action${top.length>1?'s':''} à traiter maintenant</h3></div>${total>3?`<button class="today-text-link" data-manager-go="managerControls">Tout voir · ${total}</button>`:''}</div><div class="today-priority-list">${top.map((x,i)=>priorityCard(x,i,phase)).join('')}</div>${remaining?`<button class="today-more-actions" data-manager-go="managerControls">${remaining} autre${remaining>1?'s':''} action${remaining>1?'s':''} disponible${remaining>1?'s':''} <span>›</span></button>`:''}</section>`;
}
function alertStrip(inbox,loading=false){
 if(loading)return'';
 const count=inbox?.summary?.alerts||0;if(!count)return'';
 const critical=inbox?.summary?.alertCritical||0;
 return `<button class="today-alert-strip ${critical?'critical':''}" data-manager-go="incidents"><span class="today-alert-icon">${critical?'!':'i'}</span><span><small>ALERTES</small><strong>${count} alerte${count>1?'s':''} ouverte${count>1?'s':''}${critical?` · ${critical} critique${critical>1?'s':''}`:''}</strong></span><span class="today-alert-arrow">›</span></button>`;
}
function journeyStrip(phase,compliance,hours){
 const label=phase==='CLOSED'?'Journée terminée':managerPhaseLabel(phase);
 return `<section class="today-journey"><div class="today-section-head"><div><span class="today-kicker">PARCOURS DE JOURNÉE</span><h3>${esc(label)}</h3></div><button class="today-text-link" data-manager-go="managerJourney">Voir le parcours</button></div><div class="today-progress-copy"><span>${compliance.done}/${compliance.total} obligation${compliance.total>1?'s':''} réalisée${compliance.done>1?'s':''}</span><strong>${compliance.percent}%</strong></div><div class="today-progress"><i style="width:${Math.max(0,Math.min(100,compliance.percent))}%"></i></div><div class="today-journey-meta"><span>${esc(hours||'Horaires magasin')}</span><span>${compliance.percent>=100?'Tout est à jour':'StoreOps vous guide étape par étape'}</span></div></section>`;
}
function skeleton(){
 const store=currentStore(),firstName=String(app.user?.name||'Responsable').trim().split(/\s+/)[0];
 $('#todayContent').innerHTML=`<div class="today-concierge"><header class="today-greeting"><div><span>${esc(store?.name||'Magasin')}</span><h1>Bonjour ${esc(firstName)}</h1><p>Je prépare l’essentiel de votre journée.</p></div></header>${phaseRail('OPENING')}${pulseCompact(null,true)}${prioritiesSection([],true)}</div>`;
}
function localSummary(fast,inbox){
 const d=inbox?.dashboard||fast?.dashboard||{},staff=inbox?.staff||fast?.staff||{},cold=inbox?.cold||fast?.cold||{},cashOpen=inbox?.cashOpen||fast?.cashOpen||{},receipts=inbox?.receipts||fast?.receipts||{},quality=inbox?.quality||fast?.quality||{},maintenance=inbox?.maintenance||{},loss=inbox?.lossData?.summary||fast?.loss||{};
 return{dashboard:d,staff,cold,cashOpen,receipts,quality,maintenance,loss,compliance:managerDayCompliance({dashboard:d,staff,cold,cashOpen,receipts,quality,maintenance,loss})};
}
function renderState({fast,inbox,pulse,pulseLoading=false,detailsLoading=false}){
 const local=localSummary(fast,inbox),d=local.dashboard;if(!d||!Object.keys(d).length)return;
 const store=currentStore(),phase=managerPhase(d),copy=phaseCopy[phase]||phaseCopy.DAY,firstName=String(app.user?.name||'Responsable').trim().split(/\s+/)[0],hours=store?.opening_time&&store?.closing_time?`${store.opening_time}–${store.closing_time}`:'';
 let actions=[];
 if(inbox)actions=inbox.items||[];
 else{const first=chooseManagerNextAction({dashboard:d,staff:local.staff,cold:local.cold,cashOpen:local.cashOpen,receipts:local.receipts,quality:local.quality,maintenance:local.maintenance,loss:local.loss,incidents:[]});if(first)actions=[first]}
 const total=inbox?.summary?.total??actions.length;
 $('#todayContent').innerHTML=`<div class="today-concierge"><header class="today-greeting"><div><span>${esc(store?.name||'Magasin')} · ${esc(copy.eyebrow)}</span><h1>Bonjour ${esc(firstName)}</h1><p>${esc(copy.subtitle)}</p></div><div class="today-live-state"><i></i><span>${esc(managerPhaseLabel(phase))}</span></div></header>${phaseRail(phase)}${pulseCompact(pulse,pulseLoading)}${prioritiesSection(actions,detailsLoading,phase,total)}${alertStrip(inbox,detailsLoading)}${journeyStrip(phase,local.compliance,hours)}<div class="today-footer-link"><button data-manager-go="managerMore">Tous les outils <span>›</span></button></div></div>`;
}

async function tryAutoConnectPulse(storeId,pulse){
 if(pulse?.status==='READY')return pulse;
 const integration=pulse?.integration||{};
 if(!integration.retailId)return pulse;
 try{
  const healed=await api(`/api/stores/${storeId}/business-pulse/auto-connect`,{method:'POST'});
  return healed?.pulse||pulse
 }catch(error){
  console.warn('Auto-connexion Business Pulse',error);
  return pulse
 }
}

export async function renderManagerHome(){
 ensurePreviewStyles();
 const storeId=app.storeId;skeleton();
 let fast=null,inbox=null,pulse=null,pulseLoading=true,detailsLoading=true;
 try{fast=await api(`/api/stores/${storeId}/manager-home-fast`)}catch{}
 if(app.storeId!==storeId)return;
 if(fast)renderState({fast,inbox:null,pulse:null,pulseLoading:true,detailsLoading:true});
 else{try{inbox=await loadManagerInbox();syncManagerNav(inbox);detailsLoading=false;renderState({fast:null,inbox,pulse:null,pulseLoading:true,detailsLoading:false})}catch{return}}
 const redraw=()=>{if(app.storeId===storeId&&app.page==='today')renderState({fast,inbox,pulse,pulseLoading,detailsLoading})};
 scheduleCommercialLiveRefresh(storeId,{delayMs:220,minIntervalMs:300000,onUpdated:async()=>{
  if(app.storeId!==storeId||app.page!=='today')return;
  try{
   const refreshed=await api(`/api/stores/${storeId}/manager-inbox-batch`);
   if(refreshed?.status==='READY'&&Array.isArray(refreshed.items)){inbox=refreshed;syncManagerNav(inbox);detailsLoading=false;if(refreshed.businessPulse){pulse=refreshed.businessPulse;pulseLoading=false}redraw()}
  }catch(error){console.warn('Mise à jour Today après prix/promos',error)}
 }});
 try{
  const enriched=await (inbox?Promise.resolve(inbox):api(`/api/stores/${storeId}/manager-inbox-batch`).catch(()=>loadManagerInbox()));
  if(app.storeId!==storeId)return;
  inbox=enriched;syncManagerNav(inbox);detailsLoading=false;
  if(enriched?.businessPulse){pulse=await tryAutoConnectPulse(storeId,enriched.businessPulse);pulseLoading=false;redraw();return}
  redraw();
  try{pulse=await api(`/api/stores/${storeId}/business-pulse`);pulse=await tryAutoConnectPulse(storeId,pulse)}catch{pulse=null}
  pulseLoading=false;redraw();
 }catch{
  detailsLoading=false;
  try{pulse=await api(`/api/stores/${storeId}/business-pulse`);pulse=await tryAutoConnectPulse(storeId,pulse)}catch{pulse=null}
  pulseLoading=false;redraw();
 }
}

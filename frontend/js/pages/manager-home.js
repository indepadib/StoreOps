import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,status,progress,esc } from '../ui.js';
import { managerPhase,managerPhaseLabel,chooseManagerNextAction } from '../manager-journey.js';
import { managerDayCompliance } from '../manager-compliance.js';
import { loadManagerInbox,actionKind,categoryLabel,priorityLabel,syncManagerNav } from '../manager-action-inbox.js';

const money=v=>v==null?'—':Number(v).toLocaleString('fr-MA',{minimumFractionDigits:0,maximumFractionDigits:2})+' DH';
const number=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1});
const pct=v=>v==null?'—':`${Number(v)>0?'+':''}${Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1})}%`;

function actionCard(i){
 const kind=actionKind(i),pclass=i.priority==='P0'?'priority-p0':i.priority==='P1'?'priority-p1':'';
 return `<button class="manager-action-card ${i.priority==='P0'?'critical':''}" data-manager-go="${esc(i.page)}"><div><div class="chips"><span class="chip ${pclass}">${esc(priorityLabel(i.priority))}</span><span class="chip ${kind}">${esc(categoryLabel(i.category))}</span>${i.blocking?'<span class="chip danger">Bloquant</span>':''}${i.meta?`<span class="chip">${esc(i.meta)}</span>`:''}</div><strong>${esc(i.title)}</strong><small>${esc(i.detail)}</small></div><span class="arrow">›</span></button>`;
}
function fastActionCard(next){
 if(!next)return '<div class="manager-all-good"><strong>Tout est sous contrôle.</strong><span>Aucune action prioritaire détectée dans les données locales.</span></div>';
 const priority=next.level==='CRITICAL'?'P0':next.level==='HIGH'?'P1':'P2';
 return `<button class="manager-action-card ${priority==='P0'?'critical':''}" data-manager-go="${esc(next.page)}"><div><div class="chips"><span class="chip ${priority==='P0'?'priority-p0':priority==='P1'?'priority-p1':''}">${esc(priorityLabel(priority))}</span><span class="chip">Prochaine action</span></div><strong>${esc(next.title)}</strong><small>${esc(next.detail)}</small></div><span class="arrow">›</span></button>`
}
function phaseStrip(phase){
 const order=['OPENING','DAY','CLOSING'],labels={OPENING:'Ouverture',DAY:'Exploitation',CLOSING:'Fermeture'},idx=phase==='CLOSED'?3:Math.max(0,order.indexOf(phase));
 return `<div class="manager-phase-strip">${order.map((p,i)=>`<div class="manager-phase-step ${i<idx?'done':i===idx?'current':'next'}"><span>${i<idx?'✓':i+1}</span><strong>${labels[p]}</strong></div>`).join('')}</div>`;
}
function businessPulseCard(p,loading=false){
 if(loading)return `<section class="business-pulse"><div class="pulse-card manager-fast-loading"><div class="pulse-head"><div><span class="manager-eyebrow">Business Pulse · chargement en arrière-plan</span><h2>—</h2><p>Les opérations magasin sont déjà disponibles.</p></div></div><div class="pulse-main"><div class="pulse-metric"><span>Ventes</span><strong>…</strong></div><div class="pulse-metric"><span>Marge</span><strong>…</strong></div><div class="pulse-metric"><span>Tickets</span><strong>…</strong></div><div class="pulse-metric"><span>Ruptures</span><strong>…</strong></div></div></div></section>`;
 if(!p||p.status!=='READY'||!p.snapshot){return `<section class="business-pulse"><div class="pulse-unavailable"><strong>Business Pulse · ventes non connectées</strong><span>StoreOps garde les KPI vides plutôt que d’estimer le CA. Les opérations magasin restent disponibles.</span></div></section>`}
 const k=p.snapshot.kpis||{},change=k.changeVsComparison,changeClass=change==null?'':change>=0?'up':'down';
 return `<section class="business-pulse"><div class="pulse-card">
  <div class="pulse-head"><div><span class="manager-eyebrow">Business Pulse · aujourd’hui</span><h2>${money(k.netSales)}</h2><p>CA magasin${change==null?'':` · ${pct(change)} vs D-7`}</p></div><button class="btn ghost" data-manager-go="managerPerformance">Voir le détail</button></div>
  <div class="pulse-main">
   <button class="pulse-metric primary" data-manager-go="managerPerformance"><span>Ventes</span><strong>${money(k.netSales)}</strong><small class="pulse-change ${changeClass}">${change==null?'Comparatif D-7 indisponible':`${pct(change)} vs D-7`}</small></button>
   <button class="pulse-metric" data-manager-go="managerPerformance"><span>Marge</span><strong>${k.marginRate==null?'—':pct(k.marginRate)}</strong><small>${k.marginRate==null?'Coût à connecter':'Taux du jour'}</small></button>
   <button class="pulse-metric" data-manager-go="managerPerformance"><span>Tickets</span><strong>${number(k.tickets)}</strong><small>Panier ${money(k.averageBasket)}</small></button>
   <button class="pulse-metric" data-manager-go="managerPerformance"><span>Ruptures</span><strong>${number(k.outOfStockCount)}</strong><small>${p.stock?.assortmentReady?'sur assortiment actif':'assortiment à vérifier'}</small></button>
  </div>
  <div class="pulse-actions"><span class="pulse-source">Actualisé ${new Date(p.refreshedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span><button class="btn soft" data-manager-go="managerPerformance">Rayons & articles →</button></div>
 </div></section>`;
}
function initialSkeleton(){
 const store=currentStore(),firstName=String(app.user?.name||'Responsable').trim().split(/\s+/)[0];
 $('#todayContent').innerHTML=`<div class="manager-home manager-home-simple"><div class="manager-inbox-head"><span class="manager-eyebrow">Bonjour ${esc(firstName)} · ${esc(store?.name||'Magasin')}</span><h2>StoreOps se prépare.</h2><p>Les contrôles locaux arrivent en priorité ; les données Dynamics se chargent ensuite.</p></div>${businessPulseCard(null,true)}<section class="manager-inbox-section"><div class="manager-inbox-section-head"><div><h3>À faire maintenant</h3><span>Analyse locale en cours…</span></div></div><div class="manager-action-list"><div class="manager-all-good manager-fast-loading"><strong>Lecture du magasin…</strong><span>Pas besoin d’attendre Dynamics pour afficher la journée.</span></div></div></section></div>`
}
function renderState({fast,inbox,pulse,pulseLoading=false,detailsLoading=false}){
 const d=inbox?.dashboard||fast?.dashboard;if(!d)return;
 const store=currentStore(),phase=managerPhase(d),firstName=String(app.user?.name||'Responsable').trim().split(/\s+/)[0],hours=store?.opening_time&&store?.closing_time?`${store.opening_time}–${store.closing_time}`:'';
 const staff=inbox?.staff||fast?.staff||{},cold=inbox?.cold||fast?.cold||{},cashOpen=inbox?.cashOpen||fast?.cashOpen||{},receipts=inbox?.receipts||fast?.receipts||{},quality=inbox?.quality||fast?.quality||{},maintenance=inbox?.maintenance||{},loss=inbox?.lossData?.summary||fast?.loss||{};
 const compliance=managerDayCompliance({dashboard:d,staff,cold,cashOpen,receipts,quality,maintenance,loss});
 const top=inbox?.items?.slice(0,3)||[],remaining=inbox?Math.max(0,inbox.items.length-top.length):0;
 const fastNext=inbox?null:chooseManagerNextAction({dashboard:d,staff,cold,cashOpen,receipts,quality,maintenance,loss,incidents:[]});
 const total=inbox?.summary?.total??null,p0=inbox?.summary?.p0??0,alerts=inbox?.summary?.alerts??Number(d.incidents||0),alertCritical=inbox?.summary?.alertCritical??Number(d.criticalIncidents||0);
 const title=phase==='OPENING'?'Préparez le magasin.':phase==='CLOSING'?'Sécurisez la fin de journée.':phase==='CLOSED'?'Journée terminée.':'Voici ce qui compte maintenant.';
 $('#todayContent').innerHTML=`<div class="manager-home manager-home-simple">
  <div class="manager-inbox-head"><span class="manager-eyebrow">Bonjour ${esc(firstName)} · ${esc(store?.name||'Magasin')}</span><h2>${esc(title)}</h2><p>${total==null?'Les priorités détaillées se chargent en arrière-plan…':total?`${total} action(s) demandent votre attention${p0?` · ${p0} immédiate(s)`:''}.`:'Aucune action urgente pour le moment.'}</p></div>
  ${businessPulseCard(pulse,pulseLoading)}
  <section class="manager-inbox-section"><div class="manager-inbox-section-head"><div><h3>À faire maintenant</h3><span>${detailsLoading?'Première recommandation disponible · analyse détaillée en cours.':'StoreOps vous montre uniquement les exceptions utiles.'}</span></div>${inbox?(p0?status(`${p0} immédiat(s)`,'danger'):status(`${total||0} action(s)`,'neutral')):status('Fast path','ok')}</div><div class="manager-action-list">${inbox?(top.length?top.map(actionCard).join(''):'<div class="manager-all-good"><strong>Tout est sous contrôle.</strong><span>Aucune action prioritaire à traiter maintenant.</span></div>'):fastActionCard(fastNext)}</div>${remaining?`<button class="btn soft" data-manager-go="managerControls" style="width:100%;margin-top:10px">Voir les ${remaining} autres action(s)</button>`:''}</section>
  ${alerts?`<div class="manager-alert-strip"><div><strong>${alerts} alerte(s) ouverte(s)</strong><small>${alertCritical?`${alertCritical} critique(s) · `:''}action corrective, preuve et clôture</small></div><button data-manager-go="incidents">Traiter</button></div>`:''}
  <section class="manager-journey-compact"><div class="row"><div><span class="manager-eyebrow">Parcours magasin</span><strong>${managerPhaseLabel(phase)} · ${hours||'horaires magasin'}</strong></div><button class="btn ghost" data-manager-go="managerJourney">Ouvrir</button></div><div style="margin-top:10px">${phaseStrip(phase)}</div></section>
  <section class="manager-completion-strip" style="margin-top:14px"><div class="row"><div><span class="manager-eyebrow">Traçabilité du jour</span><strong>${compliance.done}/${compliance.total} obligation(s) réalisée(s)</strong></div><strong class="manager-completion-percent">${compliance.percent}%</strong></div>${progress(compliance.percent)}</section>
 </div>`;
}

export async function renderManagerHome(){
 const storeId=app.storeId;initialSkeleton();
 let fast=null,inbox=null,pulse=null,pulseLoading=true,detailsLoading=true;
 try{fast=await api(`/api/stores/${storeId}/manager-home-fast`)}catch{}
 if(app.storeId!==storeId)return;
 if(!fast){
  try{inbox=await loadManagerInbox();syncManagerNav(inbox);detailsLoading=false;renderState({fast:null,inbox,pulse:null,pulseLoading:true,detailsLoading:false})}catch{return}
 }
 else renderState({fast,inbox:null,pulse:null,pulseLoading:true,detailsLoading:true});
 const redraw=()=>{if(app.storeId===storeId)renderState({fast,inbox,pulse,pulseLoading,detailsLoading})};
 const pulsePromise=api(`/api/stores/${storeId}/business-pulse`).then(x=>{pulse=x}).catch(()=>{pulse=null}).finally(()=>{pulseLoading=false;redraw()});
 const inboxPromise=(inbox?Promise.resolve(inbox):loadManagerInbox()).then(x=>{inbox=x;syncManagerNav(inbox)}).catch(()=>{}).finally(()=>{detailsLoading=false;redraw()});
 await Promise.allSettled([pulsePromise,inboxPromise]);
}

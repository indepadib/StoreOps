import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,status,progress,esc,fmtMoney } from '../ui.js';
import { summarizeReceipts,summarizeQualityToday } from '../today-signals.js';
import { maintenanceSummary } from '../maintenance-model.js';
import { calculateStoreHealth } from '../store-health.js';
import { scheduleCommercialLiveRefresh } from '../commercial-live-refresh.js';

function priorities(d,{staff,cold,cashOpen,loss,receipts,quality,maintenance}){
  const rows=[];
  const add=(level,title,detail,page)=>rows.push({level,title,detail,page});
  const openingPending=d.day?.opening_status!=='OPENED';
  if(openingPending&&Number(staff.blocking||0)>0)add('CRITICAL','Équipe d’ouverture à compléter',`${staff.blocking} blocage(s) · ${staff.pending||0} personne(s) encore à pointer`,'staffing');
  if(openingPending&&Number(cold.blocking||0)>0)add('CRITICAL','Chaîne du froid à sécuriser',`${cold.blocking} zone(s) bloquante(s) · ${cold.mismatch||0} hors tolérance`,'coldChain');
  if(openingPending&&Number(cashOpen.blocking||0)>0)add('CRITICAL','Caisses à préparer',`${cashOpen.blocking} caisse(s) bloquante(s) · ${cashOpen.ready||0}/${cashOpen.lines||0} prête(s)`,'cashOpening');
  if(openingPending&&Number(d.commercial?.blocking||0)>0)add('HIGH','Prix & promotions à exécuter',`${d.commercial.blocking} action(s) bloquante(s) avant ouverture`,'commercial');
  if(openingPending&&Number(d.handover?.blocking||0)>0)add('CRITICAL','Passation bloquante à traiter',`${d.handover.blocking} sujet(s) de passation empêchent l’ouverture`,'handover');
  else if(Number(d.handover?.unacknowledged||0)>0)add('HIGH','Passations à prendre en compte',`${d.handover.unacknowledged} sujet(s) non accusé(s) · ${d.handover.overdue||0} en retard`,'handover');
  if(Number(maintenance.critical||0)>0||Number(maintenance.blocking||0)>0)add('CRITICAL','Panne équipement bloquante',`${maintenance.openCount} panne(s) ouverte(s) · ${maintenance.critical} critique(s) · ${maintenance.blocking} bloquante(s)`,'maintenance');
  else if(Number(maintenance.openCount||0)>0)add('HIGH','Maintenance à suivre',`${maintenance.openCount} panne(s) ouverte(s)${maintenance.overdue?` · ${maintenance.overdue} SLA en retard`:''}`,'maintenance');
  if(Number(receipts.pendingLines||0)>0&&Number(receipts.overdue||0)>0)add('CRITICAL','Réception(s) en retard à finaliser',`${receipts.overdue} réception(s) dépassent l’ETA · ${receipts.pendingLines} ligne(s) sans contrôle qualité`,'receipts');
  else if(Number(receipts.pendingLines||0)>0&&Number(receipts.dueToday||0)>0)add('HIGH','Réception(s) du jour à contrôler',`${receipts.dueToday} réception(s) prévue(s) aujourd’hui · ${receipts.pendingLines} ligne(s) à contrôler`,'receipts');
  if(Number(quality.temperatureNok||0)>0)add('CRITICAL','Écart(s) température qualité',`${quality.temperatureNok} contrôle(s) température hors tolérance · ${quality.rejected} quantité refusée`,'quality');
  else if(Number(quality.nonConform||0)>0)add('HIGH','Non-conformités qualité du jour',`${quality.nonConform} contrôle(s) non conforme(s) · ${quality.rejected} quantité refusée`,'quality');
  if(Number(d.dlcAtRisk||0)>0)add(Number(d.dlc?.expired||0)+Number(d.dlc?.critical||0)>0?'CRITICAL':'HIGH','DLC / DDM à traiter',`${d.dlcAtRisk} lot(s) à risque · ${d.dlc?.pendingActions||0} action(s) en attente`,'dlc');
  const otherCritical=Math.max(0,Number(d.criticalIncidents||0)-Number(maintenance.critical||0)),otherOpen=Math.max(0,Number(d.incidents||0)-Number(maintenance.openCount||0));
  if(otherCritical>0)add('CRITICAL','Incidents critiques ouverts',`${otherCritical} critique(s) hors maintenance · ${d.overdueIncidents||0} incident(s) en retard au total`,'incidents');
  else if(otherOpen>0)add('HIGH','Incidents à suivre',`${otherOpen} incident(s) hors maintenance · ${d.overdueIncidents||0} en retard au total`,'incidents');
  if(Number(d.inventory?.pendingRecounts||0)>0)add('HIGH','Recomptages stock à faire',`${d.inventory.pendingRecounts} recomptage(s) · ${d.inventory.varianceLines||0} ligne(s) en écart`,'inventory');
  if(Number(loss.blocking||0)>0)add('HIGH','Démarque / pertes à finaliser',`${loss.blocking} enregistrement(s) bloquant(s) · ${loss.posted||0}/${loss.records||0} posté(s)`,'losses');
  if(d.day?.closing_status==='IN_PROGRESS'&&!d.cycle?.handoverReviewed)add('HIGH','Revue de passation avant fermeture','La passation de fin de journée doit être revue avant validation de la fermeture.','handover');
  if(d.day?.closing_status==='IN_PROGRESS'&&d.cash?.status!=='CLOSED'&&(Number(d.cash?.pending||0)>0||Number(d.cash?.recounts||0)>0))add('CRITICAL','Clôture caisses à finaliser',`${d.cash?.pending||0} shift(s) à traiter · ${d.cash?.recounts||0} recomptage(s)`,'cash');
  if(openingPending&&Number(d.opening?.blockers||0)>0&&!rows.some(x=>['staffing','coldChain','cashOpening','commercial','handover','maintenance','opening'].includes(x.page)))add('HIGH','Parcours d’ouverture incomplet',`${d.opening.blockers} blocage(s) restent à lever`,'opening');
  return rows.sort((a,b)=>({CRITICAL:0,HIGH:1,NORMAL:2}[a.level]??9)-({CRITICAL:0,HIGH:1,NORMAL:2}[b.level]??9));
}
function priorityRow(x,i=0){
  return `<div class="today-priority ${x.level==='CRITICAL'?'is-critical':'is-high'}" ${i?'data-priority-rank="'+(i+1)+'"':''}><div class="today-priority-copy"><div class="today-priority-meta">${status(x.level,x.level==='CRITICAL'?'danger':'warn')}</div><strong>${esc(x.title)}</strong><div class="small muted">${esc(x.detail)}</div></div><button class="btn soft" data-today-go="${esc(x.page)}">Traiter</button></div>`;
}
function priorityHtml(rows){
  if(!rows.length)return`<div class="banner ban-info"><strong>Aucune priorité bloquante détectée.</strong><div class="small" style="margin-top:4px">Le magasin peut poursuivre son parcours de journée normalement.</div></div>`;
  const lead=rows.slice(0,3),extra=rows.slice(3);
  return `${lead.map(priorityRow).join('')}${extra.length?`<details class="today-priority-more"><summary>Voir ${extra.length} autre${extra.length>1?'s':''} priorité${extra.length>1?'s':''}</summary><div class="today-priority-extra">${extra.map((x,i)=>priorityRow(x,i+3)).join('')}</div></details>`:''}`;
}
function healthDetails(h){if(!h.penalties.length)return'<div class="small muted today-health-penalties">Aucune pénalité opérationnelle détectée.</div>';return`<div class="small muted today-health-penalties">Principales pénalités : ${h.penalties.slice(0,4).map(x=>`${esc(x.label)} −${x.points}`).join(' · ')}</div>`}
function metricCard(label,value,detail){return `<div class="card today-metric-card"><div class="label">${label}</div><div class="kpi">${value}</div><div class="small muted">${detail}</div></div>`}
function directorStockSignals(batch){
 const root=document.getElementById('todayStockSignals');if(!root)return;
 const s=batch?.stockData?.summary||{},negative=Number(s.negative||0),out=Number(s.outOfStock||0),unknown=Number(s.assortmentUnknownZero||0);
 if(!negative&&!out&&!unknown){root.innerHTML='';return}
 root.innerHTML=`<section class="today-stock-quick director-stock-quick">${negative?`<button data-stock-flow="NEGATIVE" data-today-go="inventory"><span class="today-stock-icon">−</span><span><small>STOCK NÉGATIF</small><strong>${negative} article${negative>1?'s':''}</strong></span><em>Contrôler ›</em></button>`:''}${out?`<button data-stock-flow="OUT" data-today-go="inventory"><span class="today-stock-icon">0</span><span><small>RUPTURES</small><strong>${out} article${out>1?'s':''}</strong></span><em>Parcourir ›</em></button>`:''}${unknown&&!out?`<div class="banner ban-warn"><strong>${unknown} stock(s) à zéro non qualifié(s)</strong><div class="small">Assortiment inconnu ou périmé : StoreOps ne les appelle pas ruptures tant que l’assortiment n’est pas fiable.</div></div>`:''}</section>`;
 root.querySelectorAll('[data-today-go]').forEach(b=>b.addEventListener('click',()=>document.querySelector(`.nav button[data-page="${b.dataset.todayGo}"]`)?.click()))
}

async function loadTodayData(){
  if(app.showcase){
    const [d,lossData,cashOpenData,coldData,staffData,receiptRows,qualityRows,incidentData]=await Promise.all([
      api(`/api/stores/${app.storeId}/dashboard`),api(`/api/stores/${app.storeId}/losses`),api(`/api/stores/${app.storeId}/cash-opening`),api(`/api/stores/${app.storeId}/cold-chain`),api(`/api/stores/${app.storeId}/staffing`),api(`/api/stores/${app.storeId}/receipts`),api(`/api/stores/${app.storeId}/quality`),api(`/api/stores/${app.storeId}/incidents?status=OPEN`)
    ]);
    return{d,loss:lossData.summary||{},cashOpen:cashOpenData.summary||{},cold:coldData.summary||{},staff:staffData.summary||{},receipts:summarizeReceipts(receiptRows),quality:summarizeQualityToday(qualityRows),maintenance:maintenanceSummary(incidentData.items||[]),source:'SHOWCASE_MULTI',diagnostics:{httpFanout:8,externalCalls:0}}
  }
  const fast=await api(`/api/stores/${app.storeId}/manager-home-fast`);
  return{
    d:fast.dashboard||{},
    loss:fast.loss||{},
    cashOpen:fast.cashOpen||{},
    cold:fast.cold||{},
    staff:fast.staff||{},
    receipts:fast.receipts||{},
    quality:fast.quality||{},
    maintenance:fast.maintenance||{},
    source:fast.source||'STOREOPS_LOCAL',
    diagnostics:fast.diagnostics||{httpFanout:0,externalCalls:0}
  }
}

export async function renderToday(){
  const payload=await loadTodayData(),d=payload.d,s=currentStore(),loss=payload.loss,cashOpen=payload.cashOpen,cold=payload.cold,staff=payload.staff,receipts=payload.receipts,quality=payload.quality,maintenance=payload.maintenance,health=calculateStoreHealth({dashboard:d,staff,cold,cashOpen,receipts,quality,maintenance,loss}),prio=priorities(d,{staff,cold,cashOpen,loss,receipts,quality,maintenance});
  const root=$('#todayContent');if(root){root.dataset.dataSource=payload.source;root.dataset.httpFanout=String(payload.diagnostics?.httpFanout??(app.showcase?8:0));root.dataset.externalCalls=String(payload.diagnostics?.externalCalls??0);root.classList.add('today-v198')}
  const showcase=app.showcase?`<div class="banner ban-info" style="margin-bottom:14px"><strong>Showcase autonome</strong><div class="small" style="margin-top:5px">Parcours conseillé : Ouverture → Passation → Équipe → Chaîne du froid → Préparation caisses → Prix & promos → Réception → Stock → Qualité → Maintenance → Démarque → Caisses → Fermeture → Direction.</div><div class="small" style="margin-top:5px"><strong>EAN de démo :</strong> 5449000206770 · 6111040001111 · 3274080005003 · 3017620422003.</div></div>`:'';
  root.innerHTML=`${showcase}<div class="grid g2 today-primary-grid"><div class="card hero today-health-card"><div class="row"><div><div class="label muted">${esc(s?.name)}</div><div class="kpi">${health.score}/100</div><div class="muted small">Store Health aujourd’hui</div></div>${status(health.label,health.state==='CRITICAL'||health.state==='RISK'?'danger':health.state==='WATCH'?'warn':'ok')}</div>${healthDetails(health)}<div class="today-health-progress">${progress(d.opening.percent)}</div><div class="row small today-health-foot"><span>Ouverture ${d.opening.percent}%</span><span>${d.opening.blockers?`${d.opening.blockers} blocage(s)`:'Aucun blocage'}</span></div></div><div class="card today-priority-card"><div class="row today-priority-head"><div><strong>À traiter maintenant</strong><div class="small muted">Les sujets les plus urgents pour ce magasin.</div></div>${status(prio.length?`${prio.length} priorité(s)`:'RAS',prio.some(x=>x.level==='CRITICAL')?'danger':prio.length?'warn':'ok')}</div><div class="today-priority-list">${priorityHtml(prio)}</div></div></div><div id="todayStockSignals"></div><div class="today-section-head"><div><strong>Vue opérationnelle</strong><div class="small muted">Les indicateurs détaillés restent accessibles dans Opérations.</div></div></div><div class="grid g2 today-metrics-grid">${metricCard('Équipe ouverture',staff.status==='OPENED'||staff.status==='READY'?'OK':staff.blocking||0,`${staff.present||0} présent(s) · ${staff.absent||0} absent(s) · ${staff.pending||0} à pointer`)}${metricCard('Chaîne du froid',cold.status==='OPENED'||cold.status==='READY'?'OK':cold.blocking||0,`${cold.ready||0}/${cold.lines||0} conforme(s) · ${cold.mismatch||0} hors tolérance`)}${metricCard('Préparation caisses',cashOpen.status==='OPENED'||cashOpen.status==='READY'?'OK':cashOpen.blocking||0,`${cashOpen.ready||0}/${cashOpen.lines||0} prête(s) · ${cashOpen.mismatch||0} écart(s)`)}${metricCard('Réceptions',receipts.pendingLines||0,`ligne(s) à contrôler · ${receipts.activeReceipts||0} PO actif(s)${receipts.overdue?` · ${receipts.overdue} en retard`:''}`)}${metricCard('Qualité aujourd’hui',quality.nonConform||0,`${quality.controls||0} contrôle(s) · ${quality.rejected||0} refus · ${quality.temperatureNok||0} temp. NOK`)}${metricCard('Maintenance',maintenance.openCount||0,`${maintenance.critical||0} critique(s) · ${maintenance.blocking||0} bloquante(s) · ${maintenance.overdue||0} SLA en retard`)}${metricCard('DLC à risque',d.dlcAtRisk,d.dlc?`${d.dlc.expired||0} périmée(s) · ${d.dlc.critical||0} critique(s) · ${d.dlc.pendingActions||0} action(s)`:'')}${metricCard('Incidents',d.incidents,`${d.criticalIncidents} critique(s) · ${d.overdueIncidents||0} en retard`)}${metricCard('Passations',d.handover?.pending||0,`${d.handover?.blocking||0} bloquante(s) · ${d.handover?.unacknowledged||0} non accusée(s)`)}${metricCard('Stock / inventaire',d.inventory?.pendingRecounts||0,`${d.inventory?.varianceLines||0} ligne(s) en écart`)}${metricCard('Démarque & pertes',loss.blocking||0,`${fmtMoney(loss.retailValue||0)} · ${loss.posted||0}/${loss.records||0} postée(s)`)}${metricCard('Prix & promos',d.commercial?.blocking||0,`${d.commercial?.verified||0}/${d.commercial?.total||0} vérifiée(s)`)}${metricCard('Clôture caisses',d.cash?.status==='CLOSED'?'OK':d.cash?.recounts||d.cash?.pending||0,d.cash?.status||'Non démarrée')}</div><div class="card today-journey-card"><div class="row"><strong>Parcours de journée</strong>${status(d.day.opening_status==='OPENED'?'Ouvert':d.day.opening_status==='IN_PROGRESS'?'Ouverture en cours':'À ouvrir',d.day.opening_status==='OPENED'?'ok':'warn')}</div><div class="grid g2 today-journey-grid"><div><div class="row small"><strong>Ouverture</strong><span>${d.opening.done}/${d.opening.total}</span></div>${progress(d.opening.percent)}</div><div><div class="row small"><strong>Fermeture</strong><span>${d.closing.done}/${d.closing.total}</span></div>${progress(d.closing.percent)}</div></div></div><div class="card today-activity-card"><strong>Dernières actions</strong><div class="today-activity-list">${d.lastActions.length?d.lastActions.map(a=>`<div class="activity"><strong>${esc(a.action.replaceAll('_',' '))}</strong><div>${esc(a.actor||'Système')} · ${new Date(a.created_at+'Z').toLocaleString('fr-FR')}</div></div>`).join(''):'<div class="empty">Aucune activité.</div>'}</div></div>`;
  document.querySelectorAll('[data-today-go]').forEach(b=>b.addEventListener('click',()=>document.querySelector(`.nav button[data-page="${b.dataset.todayGo}"]`)?.click()));
  if(!app.showcase)api(`/api/stores/${app.storeId}/manager-inbox-batch`).then(directorStockSignals).catch(e=>console.warn('Enrichissement stock Aujourd’hui',e));
  if(!app.showcase)scheduleCommercialLiveRefresh(app.storeId,{delayMs:220,minIntervalMs:300000,onUpdated:()=>{if(app.page==='today')return renderToday()}});
}
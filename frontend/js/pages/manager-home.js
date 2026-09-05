import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,status,progress,esc } from '../ui.js';
import { summarizeReceipts,summarizeQualityToday } from '../today-signals.js';
import { maintenanceSummary } from '../maintenance-model.js';
import { calculateStoreHealth } from '../store-health.js';
import { chooseManagerNextAction,managerPhase,managerPhaseLabel } from '../manager-journey.js';
import { managerDayCompliance } from '../manager-compliance.js';

const phaseSteps=['OPENING','DAY','CLOSING'];
function stepState(step,phase){
  const idx=phaseSteps.indexOf(step),cur=phaseSteps.indexOf(phase);
  if(phase==='CLOSED')return 'done';
  if(idx<cur)return 'done';
  if(idx===cur)return 'current';
  return 'next';
}
function phaseStrip(phase){return `<div class="manager-phase-strip">${phaseSteps.map((p,i)=>`<div class="manager-phase-step ${stepState(p,phase)}"><span>${stepState(p,phase)==='done'?'✓':i+1}</span><strong>${managerPhaseLabel(p)}</strong></div>`).join('')}</div>`}
function miniPriority(i){return `<button class="manager-priority" data-manager-go="${esc(i.page)}"><div>${status(i.level,i.level==='CRITICAL'?'danger':i.level==='HIGH'?'warn':'neutral')}</div><div><strong>${esc(i.title)}</strong><small>${esc(i.detail)}</small></div><span>›</span></button>`}
function complianceCard(c){const kind=c.state==='BLOCKED'?'danger':c.state==='PENDING'?'warn':'ok',label=c.state==='COMPLETE'?'À jour':`${c.pending.length} à faire`;return`<section class="card manager-compliance"><div class="row"><div><span class="manager-eyebrow">Traçabilité Responsable</span><strong>${c.done}/${c.total} obligation(s) applicable(s) réalisée(s)</strong><div class="small muted">Ce score mesure ce qui a réellement été fait dans StoreOps.</div></div>${status(`${c.percent}% · ${label}`,kind)}</div><div style="margin-top:12px">${progress(c.percent)}</div>${c.next?`<button class="manager-priority" data-manager-go="${esc(c.next.page)}" style="margin-top:8px"><div>${status(c.next.level,c.next.level==='CRITICAL'?'danger':'warn')}</div><div><strong>Prochaine obligation : ${esc(c.next.label)}</strong><small>${esc(c.next.detail)}</small></div><span>›</span></button>`:'<div class="manager-all-good"><strong>Tout ce qui est applicable est tracé.</strong><span>Aucune obligation StoreOps en attente pour le moment.</span></div>'}</section>`}

export async function renderManagerHome(){
  const [d,lossData,cashOpenData,coldData,staffData,receiptRows,qualityRows,incidentData]=await Promise.all([
    api(`/api/stores/${app.storeId}/dashboard`),api(`/api/stores/${app.storeId}/losses`),api(`/api/stores/${app.storeId}/cash-opening`),api(`/api/stores/${app.storeId}/cold-chain`),api(`/api/stores/${app.storeId}/staffing`),api(`/api/stores/${app.storeId}/receipts`),api(`/api/stores/${app.storeId}/quality`),api(`/api/stores/${app.storeId}/incidents?status=OPEN`)
  ]);
  const store=currentStore(),loss=lossData.summary||{},cashOpen=cashOpenData.summary||{},cold=coldData.summary||{},staff=staffData.summary||{},receipts=summarizeReceipts(receiptRows),quality=summarizeQualityToday(qualityRows),maintenance=maintenanceSummary(incidentData.items||[]),health=calculateStoreHealth({dashboard:d,staff,cold,cashOpen,receipts,quality,maintenance,loss}),phase=managerPhase(d),firstName=String(app.user?.name||'Responsable').trim().split(/\s+/)[0],hours=store?.opening_time&&store?.closing_time?`${store.opening_time}–${store.closing_time}`:'',compliance=managerDayCompliance({dashboard:d,staff,cold,cashOpen,receipts,quality,maintenance,loss});
  const next=chooseManagerNextAction({dashboard:d,staff,cold,cashOpen,maintenance,receipts,quality,loss,incidents:incidentData.items||[]});
  const priorities=[];
  if(Number(maintenance.openCount||0)>0)priorities.push({level:maintenance.critical||maintenance.blocking?'CRITICAL':'HIGH',title:'Maintenance',detail:`${maintenance.openCount} panne(s) ouverte(s) · ${maintenance.overdue||0} SLA en retard`,page:'maintenance'});
  if(Number(receipts.pendingLines||0)>0)priorities.push({level:receipts.overdue?'CRITICAL':'HIGH',title:'Réceptions',detail:`${receipts.pendingLines} ligne(s) à contrôler${receipts.overdue?` · ${receipts.overdue} en retard`:''}`,page:'receipts'});
  if(Number(quality.nonConform||0)>0)priorities.push({level:quality.temperatureNok?'CRITICAL':'HIGH',title:'Qualité',detail:`${quality.nonConform} non-conformité(s) · ${quality.temperatureNok} température(s) NOK`,page:'quality'});
  if(Number(d.dlcAtRisk||0)>0)priorities.push({level:Number(d.dlc?.expired||0)+Number(d.dlc?.critical||0)>0?'CRITICAL':'HIGH',title:'DLC / DDM',detail:`${d.dlcAtRisk} lot(s) à risque`,page:'dlc'});
  if(Number(d.inventory?.pendingRecounts||0)>0)priorities.push({level:'HIGH',title:'Stock',detail:`${d.inventory.pendingRecounts} recomptage(s) en attente`,page:'inventory'});
  if(Number(d.incidents||0)>0)priorities.push({level:Number(d.criticalIncidents||0)>0?'CRITICAL':'HIGH',title:'Incidents',detail:`${d.incidents} ouvert(s) · ${d.overdueIncidents||0} en retard`,page:'incidents'});

  $('#todayContent').innerHTML=`
    <div class="manager-home manager-home-simple">
      <div class="manager-welcome manager-welcome-simple"><div><span class="manager-eyebrow">Bonjour ${esc(firstName)} · ${esc(store?.name||'Magasin')}</span><h2>${phase==='OPENING'?'On prépare le magasin.':phase==='CLOSING'?'On termine la journée.':phase==='CLOSED'?'C’est terminé pour aujourd’hui.':'Votre magasin est en cours d’exploitation.'}</h2><div class="manager-welcome-meta"><span>${esc(hours||'Horaires magasin')}</span><span>Santé ${health.score}/100</span></div></div></div>
      ${phaseStrip(phase)}
      <section class="manager-next ${next.level==='CRITICAL'?'critical':''}"><div class="manager-next-copy"><span class="manager-eyebrow">Maintenant</span><h2>${esc(next.title)}</h2><p>${esc(next.detail)}</p></div><button class="btn brand manager-main-cta" data-manager-go="${esc(next.page)}">${esc(next.cta)} <span>→</span></button></section>
      <section class="manager-completion-strip"><div class="row"><div><span class="manager-eyebrow">Votre journée dans StoreOps</span><strong>${compliance.done}/${compliance.total} fait${compliance.total>1?'s':''}</strong></div><strong class="manager-completion-percent">${compliance.percent}%</strong></div>${progress(compliance.percent)}</section>
      <details class="manager-details"><summary>Voir le détail de la journée <span>⌄</span></summary><div class="manager-details-body">
        ${complianceCard(compliance)}
        <div class="manager-quick-grid">
          <button class="manager-quick" data-manager-go="managerJourney"><span>Parcours</span><strong>${managerPhaseLabel(phase)}</strong><small>Ouverture → journée → fermeture</small></button>
          <button class="manager-quick" data-manager-go="managerControls"><span>Contrôles</span><strong>${Math.max(0,(d.incidents||0)+(d.dlcAtRisk||0)+(d.inventory?.pendingRecounts||0))}</strong><small>sujet(s) à surveiller</small></button>
          <button class="manager-quick" data-manager-go="incidents"><span>Alertes</span><strong>${d.criticalIncidents||0}</strong><small>critique(s) ouverte(s)</small></button>
        </div>
        <section class="card manager-priority-card"><div class="row"><div><strong>À surveiller</strong><div class="small muted">Uniquement les sujets qui demandent votre attention.</div></div><button class="btn ghost" data-manager-go="managerControls">Voir tout</button></div><div class="manager-priority-list">${priorities.length?priorities.slice(0,3).map(miniPriority).join(''):'<div class="manager-all-good"><strong>Tout est sous contrôle.</strong><span>Aucun signal prioritaire détecté pour le moment.</span></div>'}</div></section>
        <section class="card manager-day-progress"><div class="row"><div><strong>Progression du parcours</strong><div class="small muted">Avancement ouverture / fermeture.</div></div>${status(managerPhaseLabel(phase),phase==='CLOSED'?'ok':phase==='OPENING'||phase==='CLOSING'?'warn':'neutral')}</div><div class="manager-progress-row"><span>Ouverture</span>${progress(d.opening?.percent||0)}<strong>${d.opening?.percent||0}%</strong></div><div class="manager-progress-row"><span>Fermeture</span>${progress(d.closing?.percent||0)}<strong>${d.closing?.percent||0}%</strong></div></section>
      </div></details>
    </div>`;
}

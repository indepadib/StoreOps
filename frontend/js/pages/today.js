import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,status,progress,esc } from '../ui.js';

export async function renderToday(){
  const d=await api(`/api/stores/${app.storeId}/dashboard`),s=currentStore();
  const showcase=app.showcase?`
    <div class="banner ban-info" style="margin-bottom:14px">
      <strong>MVP Showcase autonome</strong>
      <div class="small" style="margin-top:5px">Les données sont simulées et sauvegardées dans ce navigateur. Parcours conseillé pour une démo : Ouverture → Réception & qualité → Incidents → vue Direction.</div>
      <div class="small" style="margin-top:5px"><strong>EAN de démo :</strong> 6111040001111 (Lait frais) · 3274080005003 (Yaourt) · 3017620422003 (Nutella).</div>
    </div>`:''; 
  $('#todayContent').innerHTML=`${showcase}
  <div class="grid g2">
    <div class="card hero"><div class="label muted">${esc(s?.name)}</div><div class="kpi">${d.health}/100</div><div class="muted small">Store Health aujourd’hui</div><div style="margin-top:15px">${progress(d.opening.percent)}</div><div class="row small" style="margin-top:8px"><span>Ouverture ${d.opening.percent}%</span><span>${d.opening.blockers?`${d.opening.blockers} blocage(s)`:'Aucun blocage'}</span></div></div>
    <div class="grid g2"><div class="card"><div class="label">DLC à risque</div><div class="kpi">${d.dlcAtRisk}</div><div class="small muted">${d.dlc?`${d.dlc.expired||0} périmée(s) · ${d.dlc.critical||0} critique(s) · ${d.dlc.pendingActions||0} action(s)`:``}</div></div><div class="card"><div class="label">Incidents</div><div class="kpi">${d.incidents}</div><div class="small muted">${d.criticalIncidents} critique(s) · ${d.overdueIncidents||0} en retard</div></div><div class="card"><div class="label">Passations</div><div class="kpi">${d.handover?.pending||0}</div><div class="small muted">${d.handover?.blocking||0} bloquante(s) · ${d.handover?.unacknowledged||0} non lue(s)</div></div><div class="card"><div class="label">Contrôles qualité</div><div class="kpi">${d.qualityControls}</div></div><div class="card"><div class="label">Qté refusée</div><div class="kpi">${d.qualityRejected}</div></div><div class="card"><div class="label">Stock / inventaire</div><div class="kpi">${d.inventory?.pendingRecounts||0}</div><div class="small muted">recomptage(s) · ${d.inventory?.varianceLines||0} ligne(s) en écart</div></div><div class="card"><div class="label">Prix & promos</div><div class="kpi">${d.commercial?.blocking||0}</div><div class="small muted">${d.commercial?.verified||0}/${d.commercial?.total||0} vérifiée(s) · ${d.commercial?.mismatch||0} écart(s)</div></div></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="row"><strong>Parcours de journée</strong>${status(d.day.opening_status==='OPENED'?'Ouvert':d.day.opening_status==='IN_PROGRESS'?'Ouverture en cours':'À ouvrir',d.day.opening_status==='OPENED'?'ok':'warn')}</div><div class="grid g2" style="margin-top:12px"><div><div class="row small"><strong>Ouverture</strong><span>${d.opening.done}/${d.opening.total}</span></div>${progress(d.opening.percent)}</div><div><div class="row small"><strong>Fermeture</strong><span>${d.closing.done}/${d.closing.total}</span></div>${progress(d.closing.percent)}</div></div></div>
  <div class="card" style="margin-top:14px"><strong>Dernières actions</strong><div style="margin-top:8px">${d.lastActions.length?d.lastActions.map(a=>`<div class="activity"><strong>${esc(a.action.replaceAll('_',' '))}</strong><div>${esc(a.actor||'Système')} · ${new Date(a.created_at+'Z').toLocaleString('fr-FR')}</div></div>`).join(''):'<div class="empty">Aucune activité.</div>'}</div></div>`;
}

import{api}from'../api.js';
import{isDirector}from'../state.js';
import{$,status,progress,esc}from'../ui.js';

export async function renderNetwork(){
  if(!isDirector())return;
  const base=await api('/api/network');
  const rows=await Promise.all(base.map(async r=>{try{const inc=await api(`/api/stores/${r.id}/incidents?status=OPEN`);return{...r,sla:inc.stats}}catch{return{...r,sla:{open:r.openIncidents||0,critical:r.criticalIncidents||0,overdue:0,escalated:0,watch:0}}}}));
  const ready=rows.filter(x=>x.day.opening_status==='OPENED').length,
    blocked=rows.filter(x=>x.opening.blockers>0&&x.day.opening_status!=='OPENED').length,
    escalated=rows.reduce((s,x)=>s+Number(x.sla?.escalated||0),0),
    overdue=rows.reduce((s,x)=>s+Number(x.sla?.overdue||0),0),
    urgentDlc=rows.reduce((s,x)=>s+Number(x.dlc?.expired||0)+Number(x.dlc?.critical||0),0),
    blockingHandover=rows.reduce((s,x)=>s+Number(x.handover?.blocking||0),0),
    pendingRecounts=rows.reduce((s,x)=>s+Number(x.inventory?.pendingRecounts||0),0),
    commercialBlocking=rows.reduce((s,x)=>s+Number(x.commercial?.blocking||0),0),
    sorted=[...rows].sort((a,b)=>risk(b)-risk(a));
  $('#networkContent').innerHTML=`
  <div class="grid g4">
    <div class="card"><div class="label">Réseau</div><div class="kpi">${rows.length}</div><div class="small muted">magasins suivis</div></div>
    <div class="card"><div class="label">Ouverts / prêts</div><div class="kpi">${ready}</div><div class="small muted">ouvertures validées</div></div>
    <div class="card"><div class="label">SLA en retard</div><div class="kpi">${overdue}</div><div class="small muted">incidents hors délai</div></div>
    <div class="card"><div class="label">DLC urgentes</div><div class="kpi">${urgentDlc}</div><div class="small muted">périmées / critiques réseau</div></div><div class="card"><div class="label">Passations bloquantes</div><div class="kpi">${blockingHandover}</div><div class="small muted">à résoudre avant ouverture</div></div><div class="card"><div class="label">Recomptages stock</div><div class="kpi">${pendingRecounts}</div><div class="small muted">écarts à revérifier réseau</div></div><div class="card"><div class="label">Prix/promos bloquants</div><div class="kpi">${commercialBlocking}</div><div class="small muted">actions avant ouverture</div></div>
  </div>
  ${blocked?`<div class="banner ban-danger" style="margin-top:14px"><strong>${blocked} ouverture(s) actuellement bloquée(s).</strong> Les magasins concernés remontent en tête de liste.</div>`:''}
  <div class="network-section-title"><div><strong>Priorités réseau</strong><span>Classement par incident critique, SLA, blocage et progression d’ouverture.</span></div></div>
  <div class="network-store-grid">${sorted.map(card).join('')}</div>`;
}

const risk=r=>Number(r.sla?.escalated||0)*250+Number(r.handover?.blocking||0)*220+Number(r.commercial?.mismatch||0)*180+Number(r.commercial?.pending||0)*60+Number(r.inventory?.pendingRecounts||0)*90+Number(r.inventory?.varianceLines||0)*20+(Number(r.dlc?.expired||0)+Number(r.dlc?.critical||0))*180+Number(r.sla?.overdue||0)*140+Number(r.criticalIncidents||0)*100+Number(r.opening.blockers||0)*30+Number(r.openIncidents||0)*8+(r.day.opening_status==='OPENED'?0:10);
function card(r){
  const open=r.day.opening_status==='OPENED',danger=Number(r.sla?.escalated||0)>0||Number(r.sla?.overdue||0)>0||r.criticalIncidents>0||(!open&&r.opening.blockers>0);
  return`<article class="card network-store ${danger?'critical':''}">
    <div class="row"><div><div class="label">${esc(r.code||'Magasin')}</div><h3>${esc(r.name)}</h3></div>${status(Number(r.sla?.escalated||0)>0?'Escalade':danger?'À traiter':open?'Ouvert':'En cours',danger?'danger':open?'ok':'warn')}</div>
    <div class="network-process"><div class="row small"><strong>Ouverture</strong><span>${r.opening.percent}%</span></div>${progress(r.opening.percent)}<div class="small muted process-caption">${open?'Validée':r.opening.currentTitle?`Étape : ${esc(r.opening.currentTitle)}`:'À démarrer'}</div><div class="owner-line"><span>Responsable</span><strong>${esc(r.day.opening_owner_name||'Non attribué')}</strong></div></div>
    <div class="network-signals"><div><span>Incidents</span><strong>${r.openIncidents}</strong></div><div><span>Prix/promos</span><strong>${r.commercial?.blocking||0}</strong></div><div><span>DLC urgentes</span><strong>${Number(r.dlc?.expired||0)+Number(r.dlc?.critical||0)}</strong></div><div><span>Recomptages</span><strong>${r.inventory?.pendingRecounts||0}</strong></div></div>
    ${(r.sla?.watch||0)>0?`<div class="banner ban-info"><strong>${r.sla.watch} incident(s)</strong> approchent de leur échéance SLA.</div>`:''}
    <button class="btn soft wide" data-network-store="${r.id}">Superviser ce magasin</button>
  </article>`;
}

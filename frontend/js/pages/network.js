import{api}from'../api.js';
import{isDirector}from'../state.js';
import{$,status,progress,esc,fmtMoney}from'../ui.js';

export async function renderNetwork(){
  if(!isDirector())return;
  const base=await api('/api/network');
  const rows=await Promise.all(base.map(async r=>{try{const [inc,loss,cashOpening,cold]=await Promise.all([api(`/api/stores/${r.id}/incidents?status=OPEN`),api(`/api/stores/${r.id}/losses`),api(`/api/stores/${r.id}/cash-opening`),api(`/api/stores/${r.id}/cold-chain`)]);return{...r,sla:inc.stats,loss:loss.summary,cashOpening:cashOpening.summary,coldChain:cold.summary}}catch{return{...r,sla:{open:r.openIncidents||0,critical:r.criticalIncidents||0,overdue:0,escalated:0,watch:0},loss:r.loss||{blocking:0,retailValue:0},cashOpening:r.cashOpening||{blocking:1,status:'NOT_STARTED',ready:0,lines:0,mismatch:0},coldChain:r.coldChain||{blocking:1,status:'NOT_STARTED',ready:0,lines:0,mismatch:0}}}}));
  const ready=rows.filter(x=>x.day.opening_status==='OPENED').length,
    blocked=rows.filter(x=>(x.opening.blockers>0||Number(x.coldChain?.blocking||0)>0||Number(x.cashOpening?.blocking||0)>0)&&x.day.opening_status!=='OPENED').length,
    overdue=rows.reduce((s,x)=>s+Number(x.sla?.overdue||0),0),
    coldBlocking=rows.reduce((s,x)=>s+Number(x.coldChain?.blocking||0),0),
    coldMismatch=rows.reduce((s,x)=>s+Number(x.coldChain?.mismatch||0),0),
    urgentDlc=rows.reduce((s,x)=>s+Number(x.dlc?.expired||0)+Number(x.dlc?.critical||0),0),
    blockingHandover=rows.reduce((s,x)=>s+Number(x.handover?.blocking||0),0),
    pendingRecounts=rows.reduce((s,x)=>s+Number(x.inventory?.pendingRecounts||0),0),
    commercialBlocking=rows.reduce((s,x)=>s+Number(x.commercial?.blocking||0),0),
    cashOpeningBlocking=rows.reduce((s,x)=>s+Number(x.cashOpening?.blocking||0),0),
    cashOpeningMismatch=rows.reduce((s,x)=>s+Number(x.cashOpening?.mismatch||0),0),
    cashBlocking=rows.reduce((s,x)=>s+Number(x.cash?.blocking||0),0),
    cashRecounts=rows.reduce((s,x)=>s+Number(x.cash?.recounts||0),0),
    lossBlocking=rows.reduce((s,x)=>s+Number(x.loss?.blocking||0),0),
    lossValue=rows.reduce((s,x)=>s+Number(x.loss?.retailValue||0),0),
    sorted=[...rows].sort((a,b)=>risk(b)-risk(a));
  $('#networkContent').innerHTML=`
  <div class="grid g4">
    <div class="card"><div class="label">Réseau</div><div class="kpi">${rows.length}</div><div class="small muted">magasins suivis</div></div>
    <div class="card"><div class="label">Ouverts / prêts</div><div class="kpi">${ready}</div><div class="small muted">ouvertures validées</div></div>
    <div class="card"><div class="label">Froid ouverture</div><div class="kpi">${coldBlocking}</div><div class="small muted">blocage(s) · ${coldMismatch} hors tolérance</div></div>
    <div class="card"><div class="label">Caisses ouverture</div><div class="kpi">${cashOpeningBlocking}</div><div class="small muted">blocage(s) · ${cashOpeningMismatch} non conforme(s)</div></div>
    <div class="card"><div class="label">SLA en retard</div><div class="kpi">${overdue}</div><div class="small muted">incidents hors délai</div></div>
    <div class="card"><div class="label">DLC urgentes</div><div class="kpi">${urgentDlc}</div><div class="small muted">périmées / critiques réseau</div></div>
    <div class="card"><div class="label">Passations bloquantes</div><div class="kpi">${blockingHandover}</div><div class="small muted">à résoudre avant ouverture</div></div>
    <div class="card"><div class="label">Recomptages stock</div><div class="kpi">${pendingRecounts}</div><div class="small muted">écarts à revérifier réseau</div></div>
    <div class="card"><div class="label">Prix/promos bloquants</div><div class="kpi">${commercialBlocking}</div><div class="small muted">actions avant ouverture</div></div>
    <div class="card"><div class="label">Démarque à traiter</div><div class="kpi">${lossBlocking}</div><div class="small muted">${fmtMoney(lossValue)} enregistrés aujourd’hui</div></div>
    <div class="card"><div class="label">Clôtures caisse</div><div class="kpi">${cashBlocking}</div><div class="small muted">à finaliser · ${cashRecounts} recomptage(s)</div></div>
  </div>
  ${blocked?`<div class="banner ban-danger" style="margin-top:14px"><strong>${blocked} ouverture(s) actuellement bloquée(s).</strong> Les magasins concernés remontent en tête de liste.</div>`:''}
  <div class="network-section-title"><div><strong>Priorités réseau</strong><span>Classement par froid, caisses d’ouverture, incidents, démarque, clôture caisse, prix/promo, DLC, stock et progression.</span></div></div>
  <div class="network-store-grid">${sorted.map(card).join('')}</div>`;
}

const risk=r=>Number(r.coldChain?.mismatch||0)*280+Number(r.coldChain?.blocking||0)*110+Number(r.cashOpening?.mismatch||0)*240+Number(r.cashOpening?.blocking||0)*90+Number(r.sla?.escalated||0)*250+Number(r.handover?.blocking||0)*220+Number(r.commercial?.mismatch||0)*180+Number(r.loss?.blocking||0)*170+Number(r.loss?.pendingApproval||0)*120+Number(r.cash?.recounts||0)*160+Number(r.cash?.blocking||0)*80+Number(r.commercial?.pending||0)*60+Number(r.inventory?.pendingRecounts||0)*90+Number(r.inventory?.varianceLines||0)*20+(Number(r.dlc?.expired||0)+Number(r.dlc?.critical||0))*180+Number(r.sla?.overdue||0)*140+Number(r.criticalIncidents||0)*100+Number(r.opening.blockers||0)*30+Number(r.openIncidents||0)*8+(r.day.opening_status==='OPENED'?0:10);
function card(r){
  const open=r.day.opening_status==='OPENED',coldAlert=!open&&Number(r.coldChain?.blocking||0)>0,cashOpeningAlert=!open&&Number(r.cashOpening?.blocking||0)>0,cashAlert=Number(r.cash?.recounts||0)>0||(r.day.closing_status!=='CLOSED'&&r.cash?.status==='REVIEW'),lossAlert=Number(r.loss?.blocking||0)>0,danger=Number(r.sla?.escalated||0)>0||Number(r.sla?.overdue||0)>0||r.criticalIncidents>0||coldAlert||cashOpeningAlert||cashAlert||lossAlert||(!open&&r.opening.blockers>0);
  return`<article class="card network-store ${danger?'critical':''}">
    <div class="row"><div><div class="label">${esc(r.code||'Magasin')}</div><h3>${esc(r.name)}</h3></div>${status(Number(r.sla?.escalated||0)>0?'Escalade':danger?'À traiter':open?'Ouvert':'En cours',danger?'danger':open?'ok':'warn')}</div>
    <div class="network-process"><div class="row small"><strong>Ouverture</strong><span>${r.opening.percent}%</span></div>${progress(r.opening.percent)}<div class="small muted process-caption">${open?'Validée':r.opening.currentTitle?`Étape : ${esc(r.opening.currentTitle)}`:'À démarrer'}</div><div class="owner-line"><span>Responsable</span><strong>${esc(r.day.opening_owner_name||'Non attribué')}</strong></div></div>
    <div class="network-signals"><div><span>Froid</span><strong>${r.coldChain?.ready||0}/${r.coldChain?.lines||0}</strong></div><div><span>Caisses ouv.</span><strong>${r.cashOpening?.ready||0}/${r.cashOpening?.lines||0}</strong></div><div><span>Incidents</span><strong>${r.openIncidents}</strong></div><div><span>Démarque</span><strong>${r.loss?.blocking||0}</strong></div></div>
    ${coldAlert?`<div class="banner ban-danger"><strong>${r.coldChain.blocking} zone(s) froid</strong> bloquent l’ouverture · ${r.coldChain.mismatch||0} hors tolérance.</div>`:''}
    ${cashOpeningAlert?`<div class="banner ban-danger"><strong>${r.cashOpening.blocking} caisse(s) d’ouverture</strong> restent à préparer · ${r.cashOpening.mismatch||0} non conforme(s).</div>`:''}
    ${Number(r.loss?.blocking||0)>0?`<div class="banner ban-danger"><strong>${r.loss.blocking} perte(s)</strong> restent à documenter / poster · ${fmtMoney(r.loss.retailValue||0)}.</div>`:''}
    ${Number(r.cash?.recounts||0)>0?`<div class="banner ban-danger"><strong>${r.cash.recounts} recomptage(s) caisse</strong> restent à traiter avant clôture.</div>`:''}
    ${(r.sla?.watch||0)>0?`<div class="banner ban-info"><strong>${r.sla.watch} incident(s)</strong> approchent de leur échéance SLA.</div>`:''}
    <button class="btn soft wide" data-network-store="${r.id}">Superviser ce magasin</button>
  </article>`;
}

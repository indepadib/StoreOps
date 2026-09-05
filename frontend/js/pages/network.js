import{api}from'../api.js';
import{isDirector}from'../state.js';
import{$,status,progress,esc,fmtMoney}from'../ui.js';
import{dlcRisk,closingStarted,cashClosingNeedsAttention,storeBlocked,networkRisk}from'../network-risk.js';

export async function renderNetwork(){
 if(!isDirector())return;
 const base=await api('/api/network');
 const rows=await Promise.all(base.map(async r=>{try{const [inc,loss,cashOpening,cold,staff]=await Promise.all([api(`/api/stores/${r.id}/incidents?status=OPEN`),api(`/api/stores/${r.id}/losses`),api(`/api/stores/${r.id}/cash-opening`),api(`/api/stores/${r.id}/cold-chain`),api(`/api/stores/${r.id}/staffing`)]);return{...r,sla:inc.stats,loss:loss.summary,cashOpening:cashOpening.summary,coldChain:cold.summary,staffing:staff.summary}}catch{return{...r,sla:{open:r.openIncidents||0,critical:r.criticalIncidents||0,overdue:0,escalated:0,watch:0},loss:r.loss||{blocking:0,retailValue:0},cashOpening:r.cashOpening||{blocking:1},coldChain:r.coldChain||{blocking:1},staffing:r.staffing||{blocking:1}}}}));
 const ready=rows.filter(x=>x.day.opening_status==='OPENED').length,staffBlocking=sum(rows,x=>x.staffing?.blocking),coldBlocking=sum(rows,x=>x.coldChain?.blocking),cashOpeningBlocking=sum(rows,x=>x.cashOpening?.blocking),commercialBlocking=sum(rows,x=>x.commercial?.blocking),dlcCritical=sum(rows,x=>dlcRisk(x)),inventoryRecounts=sum(rows,x=>x.inventory?.pendingRecounts),handoverBlocking=sum(rows,x=>x.handover?.blocking),overdue=sum(rows,x=>x.sla?.overdue),lossBlocking=sum(rows,x=>x.loss?.blocking),lossValue=sum(rows,x=>x.loss?.retailValue),qualityControls=sum(rows,x=>x.qualityControls),qualityRejected=sum(rows,x=>x.qualityRejected),closingCashBlocked=rows.filter(cashClosingNeedsAttention).length,blocked=rows.filter(storeBlocked).length,sorted=[...rows].sort((a,b)=>networkRisk(b)-networkRisk(a));
 $('#networkContent').innerHTML=`
 <div class="grid g4">
  <div class="card"><div class="label">Réseau</div><div class="kpi">${rows.length}</div></div>
  <div class="card"><div class="label">Ouverts / prêts</div><div class="kpi">${ready}</div></div>
  <div class="card"><div class="label">Ouvertures bloquées</div><div class="kpi">${blocked}</div></div>
  <div class="card"><div class="label">SLA en retard</div><div class="kpi">${overdue}</div></div>
  <div class="card"><div class="label">Équipe ouverture</div><div class="kpi">${staffBlocking}</div><div class="small muted">blocage(s) couverture</div></div>
  <div class="card"><div class="label">Froid ouverture</div><div class="kpi">${coldBlocking}</div></div>
  <div class="card"><div class="label">Caisses ouverture</div><div class="kpi">${cashOpeningBlocking}</div></div>
  <div class="card"><div class="label">Prix & promos</div><div class="kpi">${commercialBlocking}</div><div class="small muted">action(s) bloquante(s)</div></div>
  <div class="card"><div class="label">DLC critiques</div><div class="kpi">${dlcCritical}</div></div>
  <div class="card"><div class="label">Recomptages stock</div><div class="kpi">${inventoryRecounts}</div></div>
  <div class="card"><div class="label">Passations bloquantes</div><div class="kpi">${handoverBlocking}</div></div>
  <div class="card"><div class="label">Démarque à traiter</div><div class="kpi">${lossBlocking}</div><div class="small muted">${fmtMoney(lossValue)}</div></div>
  <div class="card"><div class="label">Contrôles qualité</div><div class="kpi">${qualityControls}</div><div class="small muted">réalisés aujourd’hui</div></div>
  <div class="card"><div class="label">Quantité refusée</div><div class="kpi">${qualityRejected}</div><div class="small muted">qualité / réception aujourd’hui</div></div>
  <div class="card"><div class="label">Clôtures caisse à traiter</div><div class="kpi">${closingCashBlocked}</div><div class="small muted">magasin(s) en fermeture</div></div>
 </div>
 ${blocked?`<div class="banner ban-danger" style="margin-top:14px"><strong>${blocked} ouverture(s) bloquée(s).</strong> Les cartes ci-dessous sont classées par criticité opérationnelle, pas seulement par avancement du parcours.</div>`:''}
 ${qualityRejected?`<div class="banner ban-danger" style="margin-top:10px"><strong>${qualityRejected} unité(s) refusée(s) aujourd’hui sur le réseau.</strong> Les magasins concernés remontent dans le classement de priorité.</div>`:''}
 <div class="network-section-title"><div><strong>Priorités réseau</strong><span>Classement consolidé : ouverture, qualité, prix, DLC, stock, incidents, démarque, caisses et fermeture.</span></div></div>
 <div class="network-store-grid">${sorted.map(card).join('')}</div>`;
}

const sum=(rows,fn)=>rows.reduce((s,x)=>s+Number(fn(x)||0),0);
function card(r){
 const open=r.day.opening_status==='OPENED',staffAlert=!open&&Number(r.staffing?.blocking||0)>0,coldAlert=!open&&Number(r.coldChain?.blocking||0)>0,cashAlert=!open&&Number(r.cashOpening?.blocking||0)>0,commercialAlert=!open&&Number(r.commercial?.blocking||0)>0,handoverAlert=!open&&Number(r.handover?.blocking||0)>0,dlcAlert=dlcRisk(r)>0,stockAlert=Number(r.inventory?.pendingRecounts||0)>0,qualityAlert=Number(r.qualityRejected||0)>0,closingAlert=cashClosingNeedsAttention(r),danger=staffAlert||coldAlert||cashAlert||commercialAlert||handoverAlert||dlcAlert||qualityAlert||closingAlert||Number(r.sla?.overdue||0)>0||r.criticalIncidents>0;
 const closingPct=Number(r.closing?.percent||0),closingStatus=r.day?.closing_status==='CLOSED'?'Fermé':closingStarted(r)?'En fermeture':'Non démarrée';
 return`<article class="card network-store ${danger?'critical':''}">
  <div class="row"><div><div class="label">${esc(r.code||'Magasin')}</div><h3>${esc(r.name)}</h3></div>${status(danger?'À traiter':open?'Ouvert':'En cours',danger?'danger':open?'ok':'warn')}</div>
  <div class="network-process"><div class="row small"><strong>Ouverture</strong><span>${r.opening.percent}%</span></div>${progress(r.opening.percent)}<div class="owner-line"><span>Responsable</span><strong>${esc(r.day.opening_owner_name||'Non attribué')}</strong></div></div>
  <div class="network-signals"><div><span>Équipe</span><strong>${r.staffing?.present||0}/${r.staffing?.lines||0}</strong></div><div><span>Froid</span><strong>${r.coldChain?.ready||0}/${r.coldChain?.lines||0}</strong></div><div><span>Caisses</span><strong>${r.cashOpening?.ready||0}/${r.cashOpening?.lines||0}</strong></div><div><span>Incidents</span><strong>${r.openIncidents||0}</strong></div></div>
  <div class="network-signals"><div><span>Prix</span><strong>${r.commercial?.blocking||0}</strong></div><div><span>DLC</span><strong>${dlcRisk(r)}</strong></div><div><span>Stock</span><strong>${r.inventory?.pendingRecounts||0}</strong></div><div><span>Passation</span><strong>${r.handover?.blocking||0}</strong></div></div>
  <div class="network-signals"><div><span>Qualité</span><strong>${r.qualityControls||0} ctrl.</strong></div><div><span>Refus</span><strong>${r.qualityRejected||0}</strong></div><div><span>Clôture</span><strong>${esc(closingStatus)}</strong></div><div><span>Caisse fin</span><strong>${closingAlert?Number(r.cash?.blocking||r.cash?.recounts||r.cash?.pending||0):'—'}</strong></div></div>
  ${closingStarted(r)?`<div class="network-process closing-mini"><div class="row small"><strong>Fermeture</strong><span>${closingPct}%</span></div>${progress(closingPct)}</div>`:''}
  ${staffAlert?`<div class="banner ban-danger"><strong>Couverture équipe insuffisante</strong> · ${r.staffing.pending||0} à pointer · ${r.staffing.absent||0} absent(s).</div>`:''}
  ${coldAlert?`<div class="banner ban-danger"><strong>${r.coldChain.blocking} zone(s) froid</strong> bloquent l’ouverture.</div>`:''}
  ${cashAlert?`<div class="banner ban-danger"><strong>${r.cashOpening.blocking} caisse(s)</strong> restent à préparer.</div>`:''}
  ${commercialAlert?`<div class="banner ban-danger"><strong>${r.commercial.blocking} action(s) prix/promo</strong> restent à exécuter.</div>`:''}
  ${handoverAlert?`<div class="banner ban-danger"><strong>${r.handover.blocking} passation(s)</strong> doivent être traitées avant ouverture.</div>`:''}
  ${dlcAlert?`<div class="banner ban-danger"><strong>${dlcRisk(r)} lot(s) DLC critique(s) / périmé(s)</strong> nécessitent une action terrain.</div>`:''}
  ${stockAlert?`<div class="banner ban-info"><strong>${r.inventory.pendingRecounts} recomptage(s) stock</strong> en attente.</div>`:''}
  ${qualityAlert?`<div class="banner ban-danger"><strong>${r.qualityRejected} unité(s) refusée(s) qualité</strong> aujourd’hui · ${r.qualityControls||0} contrôle(s).</div>`:''}
  ${closingAlert?`<div class="banner ban-danger"><strong>Clôture caisse à traiter</strong><div class="small">${Number(r.cash?.pending||0)} shift(s) en attente · ${Number(r.cash?.recounts||0)} recomptage(s) · ${Number(r.cash?.blocking||0)} blocage(s).</div></div>`:''}
  <button class="btn soft wide" data-network-store="${r.id}">Superviser ce magasin</button>
 </article>`;
}

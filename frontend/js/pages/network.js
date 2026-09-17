import{api}from'../api.js';
import{isDirector}from'../state.js';
import{$,status,progress,esc,fmtMoney}from'../ui.js';
import{dlcRisk,closingStarted,cashClosingNeedsAttention,storeBlocked,networkRisk}from'../network-risk.js';

const safe=async p=>{try{return{ok:true,data:await p}}catch(error){return{ok:false,data:null,error:error?.message||'Indisponible'}}};
const known=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const metric=v=>known(v)?Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1}):'—';
const knownSum=(rows,fn)=>{const vals=rows.map(fn).filter(known).map(Number);return{value:vals.length?vals.reduce((a,b)=>a+b,0):null,known:vals.length,total:rows.length}};
const coverage=m=>m.known<m.total?`${m.known}/${m.total} magasins remontés`:'Données StoreOps';

export async function renderNetwork(){
 if(!isDirector())return;
 const base=await api('/api/network');
 const rows=await Promise.all(base.map(async r=>{
  const [inc,loss,cashOpening,cold,staff]=await Promise.all([
   safe(api(`/api/stores/${r.id}/incidents?status=OPEN`)),safe(api(`/api/stores/${r.id}/losses`)),safe(api(`/api/stores/${r.id}/cash-opening`)),safe(api(`/api/stores/${r.id}/cold-chain`)),safe(api(`/api/stores/${r.id}/staffing`))
  ]);
  return{...r,sla:inc.ok?inc.data?.stats:null,loss:loss.ok?loss.data?.summary:null,cashOpening:cashOpening.ok?cashOpening.data?.summary:null,coldChain:cold.ok?cold.data?.summary:null,staffing:staff.ok?staff.data?.summary:null,dataHealth:{incidents:inc.ok,losses:loss.ok,cashOpening:cashOpening.ok,coldChain:cold.ok,staffing:staff.ok}}
 }));
 const ready=rows.filter(x=>x.day?.opening_status==='OPENED').length,staffBlocking=knownSum(rows,x=>x.staffing?.blocking),coldBlocking=knownSum(rows,x=>x.coldChain?.blocking),cashOpeningBlocking=knownSum(rows,x=>x.cashOpening?.blocking),commercialBlocking=knownSum(rows,x=>x.commercial?.blocking),dlcCritical=knownSum(rows,x=>x.dlc?dlcRisk(x):null),inventoryRecounts=knownSum(rows,x=>x.inventory?.pendingRecounts),handoverBlocking=knownSum(rows,x=>x.handover?.blocking),overdue=knownSum(rows,x=>x.sla?.overdue),lossBlocking=knownSum(rows,x=>x.loss?.blocking),lossValue=knownSum(rows,x=>x.loss?.retailValue),qualityControls=knownSum(rows,x=>x.qualityControls),qualityRejected=knownSum(rows,x=>x.qualityRejected),closingCashBlocked=rows.filter(x=>x.cash&&cashClosingNeedsAttention(x)).length,blocked=rows.filter(storeBlocked).length,sorted=[...rows].sort((a,b)=>networkRisk(b)-networkRisk(a));
 $('#networkContent').innerHTML=`
 <div class="network-trust-note"><strong>Vue réseau réelle</strong><span>Un « — » signifie que la source n’a pas répondu. StoreOps ne remplace plus une donnée absente par 0 ou par un faux blocage.</span></div>
 <div class="grid g4 network-top-kpis">
  <div class="card"><div class="label">Magasins suivis</div><div class="kpi">${rows.length}</div><div class="small muted">Configuration StoreOps</div></div>
  <div class="card"><div class="label">Ouverts / prêts</div><div class="kpi">${ready}</div><div class="small muted">Parcours magasin</div></div>
  <div class="card"><div class="label">Ouvertures bloquées</div><div class="kpi">${blocked}</div><div class="small muted">Règles opérationnelles</div></div>
  <div class="card"><div class="label">SLA en retard</div><div class="kpi">${metric(overdue.value)}</div><div class="small muted">${coverage(overdue)}</div></div>
 </div>
 <details class="network-secondary-kpis"><summary>Voir les indicateurs opérationnels <span>⌄</span></summary><div class="grid g4" style="margin-top:10px">
  ${kpi('Équipe ouverture',staffBlocking,'blocage(s) couverture')}${kpi('Froid ouverture',coldBlocking)}${kpi('Caisses ouverture',cashOpeningBlocking)}${kpi('Prix & promos',commercialBlocking,'action(s) bloquante(s)')}
  ${kpi('DLC critiques',dlcCritical)}${kpi('Recomptages stock',inventoryRecounts)}${kpi('Passations bloquantes',handoverBlocking)}${kpi('Démarque à traiter',lossBlocking,known(lossValue.value)?fmtMoney(lossValue.value):'Valeur indisponible')}
  ${kpi('Contrôles qualité',qualityControls,'réalisés aujourd’hui')}${kpi('Quantité refusée',qualityRejected,'qualité / réception')}
  <div class="card"><div class="label">Clôtures caisse à traiter</div><div class="kpi">${closingCashBlocked}</div><div class="small muted">Source StoreOps</div></div>
 </div></details>
 ${blocked?`<div class="banner ban-danger" style="margin-top:14px"><strong>${blocked} ouverture(s) bloquée(s).</strong> Les cartes ci-dessous sont classées par criticité opérationnelle.</div>`:''}
 ${known(qualityRejected.value)&&qualityRejected.value>0?`<div class="banner ban-danger" style="margin-top:10px"><strong>${qualityRejected.value} unité(s) refusée(s) aujourd’hui sur le réseau.</strong> Les magasins concernés remontent dans le classement de priorité.</div>`:''}
 <div class="network-section-title"><div><strong>Priorités réseau</strong><span>Les données indisponibles restent explicitement marquées « — ».</span></div></div>
 <div class="network-store-grid">${sorted.map(card).join('')}</div>`;
 ensureTrustCss();
}

function kpi(label,m,detail=''){return`<div class="card"><div class="label">${esc(label)}</div><div class="kpi">${metric(m.value)}</div><div class="small muted">${esc(detail||coverage(m))}${detail&&m.known<m.total?` · ${esc(coverage(m))}`:''}</div></div>`}
function val(v,suffix=''){return known(v)?`${metric(v)}${suffix}`:'—'}
function pair(a,b){return known(a)&&known(b)?`${metric(a)}/${metric(b)}`:'—'}
function card(r){
 const open=r.day?.opening_status==='OPENED',staffAlert=!open&&known(r.staffing?.blocking)&&Number(r.staffing.blocking)>0,coldAlert=!open&&known(r.coldChain?.blocking)&&Number(r.coldChain.blocking)>0,cashAlert=!open&&known(r.cashOpening?.blocking)&&Number(r.cashOpening.blocking)>0,commercialAlert=!open&&known(r.commercial?.blocking)&&Number(r.commercial.blocking)>0,handoverAlert=!open&&known(r.handover?.blocking)&&Number(r.handover.blocking)>0,dlcValue=r.dlc?dlcRisk(r):null,dlcAlert=known(dlcValue)&&Number(dlcValue)>0,stockAlert=known(r.inventory?.pendingRecounts)&&Number(r.inventory.pendingRecounts)>0,qualityAlert=known(r.qualityRejected)&&Number(r.qualityRejected)>0,closingAlert=!!r.cash&&cashClosingNeedsAttention(r),danger=staffAlert||coldAlert||cashAlert||commercialAlert||handoverAlert||dlcAlert||qualityAlert||closingAlert||(known(r.sla?.overdue)&&Number(r.sla.overdue)>0)||(known(r.criticalIncidents)&&Number(r.criticalIncidents)>0);
 const closingPct=known(r.closing?.percent)?Number(r.closing.percent):null,closingStatus=r.day?.closing_status==='CLOSED'?'Fermé':closingStarted(r)?'En fermeture':'Non démarrée',health=Object.values(r.dataHealth||{}),missing=health.filter(x=>x===false).length;
 return`<article class="card network-store ${danger?'critical':''}">
  <div class="row"><div><div class="label">${esc(r.code||'Magasin')}</div><h3>${esc(r.name)}</h3></div>${status(danger?'À traiter':open?'Ouvert':'En cours',danger?'danger':open?'ok':'warn')}</div>
  ${missing?`<div class="network-data-warning"><strong>${missing} source${missing>1?'s':''} indisponible${missing>1?'s':''}</strong><span>Les champs concernés restent à « — ».</span></div>`:''}
  <div class="network-process"><div class="row small"><strong>Ouverture</strong><span>${val(r.opening?.percent,'%')}</span></div>${known(r.opening?.percent)?progress(Number(r.opening.percent)):''}<div class="owner-line"><span>Responsable</span><strong>${esc(r.day?.opening_owner_name||'Non attribué')}</strong></div></div>
  <div class="network-signals"><div><span>Équipe</span><strong>${pair(r.staffing?.present,r.staffing?.lines)}</strong></div><div><span>Froid</span><strong>${pair(r.coldChain?.ready,r.coldChain?.lines)}</strong></div><div><span>Caisses</span><strong>${pair(r.cashOpening?.ready,r.cashOpening?.lines)}</strong></div><div><span>Incidents</span><strong>${val(r.sla?.open??r.openIncidents)}</strong></div></div>
  <div class="network-signals"><div><span>Prix</span><strong>${val(r.commercial?.blocking)}</strong></div><div><span>DLC</span><strong>${val(dlcValue)}</strong></div><div><span>Stock</span><strong>${val(r.inventory?.pendingRecounts)}</strong></div><div><span>Passation</span><strong>${val(r.handover?.blocking)}</strong></div></div>
  <div class="network-signals"><div><span>Qualité</span><strong>${known(r.qualityControls)?`${metric(r.qualityControls)} ctrl.`:'—'}</strong></div><div><span>Refus</span><strong>${val(r.qualityRejected)}</strong></div><div><span>Clôture</span><strong>${esc(closingStatus)}</strong></div><div><span>Caisse fin</span><strong>${closingAlert?val(r.cash?.blocking??r.cash?.recounts??r.cash?.pending):'—'}</strong></div></div>
  ${closingStarted(r)&&closingPct!==null?`<div class="network-process closing-mini"><div class="row small"><strong>Fermeture</strong><span>${closingPct}%</span></div>${progress(closingPct)}</div>`:''}
  ${staffAlert?`<div class="banner ban-danger"><strong>Couverture équipe insuffisante</strong> · ${r.staffing.pending||0} à pointer · ${r.staffing.absent||0} absent(s).</div>`:''}
  ${coldAlert?`<div class="banner ban-danger"><strong>${r.coldChain.blocking} zone(s) froid</strong> bloquent l’ouverture.</div>`:''}
  ${cashAlert?`<div class="banner ban-danger"><strong>${r.cashOpening.blocking} caisse(s)</strong> restent à préparer.</div>`:''}
  ${commercialAlert?`<div class="banner ban-danger"><strong>${r.commercial.blocking} action(s) prix/promo</strong> restent à exécuter.</div>`:''}
  ${handoverAlert?`<div class="banner ban-danger"><strong>${r.handover.blocking} passation(s)</strong> doivent être traitées avant ouverture.</div>`:''}
  ${dlcAlert?`<div class="banner ban-danger"><strong>${dlcValue} lot(s) DLC critique(s) / périmé(s)</strong> nécessitent une action terrain.</div>`:''}
  ${stockAlert?`<div class="banner ban-info"><strong>${r.inventory.pendingRecounts} recomptage(s) stock</strong> en attente.</div>`:''}
  ${qualityAlert?`<div class="banner ban-danger"><strong>${r.qualityRejected} unité(s) refusée(s) qualité</strong> aujourd’hui · ${val(r.qualityControls)} contrôle(s).</div>`:''}
  ${closingAlert?`<div class="banner ban-danger"><strong>Clôture caisse à traiter</strong><div class="small">${val(r.cash?.pending)} shift(s) en attente · ${val(r.cash?.recounts)} recomptage(s) · ${val(r.cash?.blocking)} blocage(s).</div></div>`:''}
  <button class="btn soft wide" data-network-store="${r.id}">Superviser ce magasin</button>
 </article>`;
}
function ensureTrustCss(){if(document.getElementById('networkTrustCss'))return;const s=document.createElement('style');s.id='networkTrustCss';s.textContent=`.network-trust-note{display:flex;gap:10px;justify-content:space-between;align-items:center;border:1px solid #dfe7e3;background:#f7fbf8;border-radius:15px;padding:11px 13px;margin-bottom:12px}.network-trust-note strong{font-size:11px}.network-trust-note span{font-size:10px;color:var(--muted)}.network-secondary-kpis{margin:10px 0}.network-secondary-kpis>summary{cursor:pointer;color:var(--muted);font-size:11px;font-weight:800}.network-data-warning{display:flex;justify-content:space-between;gap:8px;border-radius:11px;background:#fff8ed;padding:8px 9px;margin:9px 0}.network-data-warning strong,.network-data-warning span{font-size:9px}.network-data-warning span{color:var(--muted)}@media(max-width:700px){.network-trust-note{align-items:flex-start;flex-direction:column}.network-top-kpis{grid-template-columns:1fr 1fr!important}}`;document.head.appendChild(s)}

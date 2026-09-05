import { api } from '../api.js';
import { app,canManage,isDirector } from '../state.js';
import { $,esc,status,fmtMoney,toast } from '../ui.js';

let cfg=null;
const label={NOT_STARTED:'À préparer',PREPARING:'Préparation en cours',READY:'Prête',OPENED:'Ouverte',PENDING:'À contrôler',MISMATCH:'Non conforme'};
const type={NOT_STARTED:'neutral',PREPARING:'warn',READY:'ok',OPENED:'ok',PENDING:'neutral',MISMATCH:'danger'};

export async function renderCashOpening(){
  const [config,data]=await Promise.all([api('/api/cash-opening/config'),api(`/api/stores/${app.storeId}/cash-opening`)]);cfg=config;const o=data.opening,s=data.summary||{},locked=o?.status==='OPENED';
  $('#cashOpeningContent').innerHTML=`
    <div class="grid g4 cash-open-kpis">
      <div class="card"><div class="label">Caisses prêtes</div><div class="kpi">${s.ready||0}/${s.lines||0}</div><div class="small muted">${s.status==='OPENED'?'magasin ouvert':'avant ouverture magasin'}</div></div>
      <div class="card"><div class="label">À contrôler</div><div class="kpi">${s.pending||0}</div><div class="small muted">caisse(s) non vérifiée(s)</div></div>
      <div class="card"><div class="label">Non conformes</div><div class="kpi">${s.mismatch||0}</div><div class="small muted">bloque(nt) l’ouverture</div></div>
      <div class="card"><div class="label">Fonds de caisse</div><div class="kpi cash-open-money">${fmtMoney(s.declaredFloat||0)}</div><div class="small muted">attendu ${fmtMoney(s.expectedFloat||0)} · écart ${fmtMoney(s.floatVariance||0)}</div></div>
    </div>
    <div class="card cash-open-head" style="margin-top:14px">
      <div class="row"><div><strong>Préparation des caisses</strong><div class="small muted">Snapshot Dynamics du jour · une caisse non prête bloque la déclaration d’ouverture.</div></div>${status(label[s.status]||s.status,type[s.status]||'neutral')}</div>
      <div class="cash-open-rules"><span>Tolérance fond ± ${fmtMoney(config.policy?.float_tolerance_dh||0)}</span><span>POS + TPE + imprimante obligatoires</span><span>Shift Dynamics ouvert obligatoire</span></div>
      ${canManage()&&!locked?'<button class="btn soft" id="syncCashOpeningBtn">Resynchroniser Dynamics</button>':''}
    </div>
    ${!canManage()?'<div class="banner ban-info" style="margin-top:14px"><strong>Lecture seule.</strong> Le contrôle des caisses est réservé au Responsable magasin et à la Direction.</div>':''}
    <div class="cash-open-grid">${o?.lines?.length?o.lines.map(x=>lineCard(x,locked)).join(''):'<div class="card empty">Aucune caisse reçue depuis Dynamics.</div>'}</div>
    ${isDirector()?policyPanel(config.policy):''}`;
  bind();
}

function lineCard(x,locked){const ready=x.status==='READY';return`<article class="card cash-open-card ${x.status==='MISMATCH'?'has-error':ready?'is-ready':''}">
  <div class="row"><div><div class="label">Caisse ${esc(x.till_code)}</div><strong>${esc(x.shift_id)}</strong></div>${status(label[x.status]||x.status,type[x.status]||'neutral')}</div>
  <div class="cash-open-amount"><span>Fond attendu Dynamics</span><strong>${fmtMoney(x.expected_float)}</strong></div>
  <div class="form-grid cash-open-form">
    <div class="field"><label>Caissier affecté *</label><input data-co-cashier="${x.id}" value="${esc(x.cashier_name||'')}" placeholder="Nom / matricule" ${locked?'disabled':''}></div>
    <div class="field"><label>Fond déclaré *</label><input data-co-float="${x.id}" type="number" min="0" step="0.01" value="${x.declared_float==null?x.expected_float:x.declared_float}" ${locked?'disabled':''}></div>
  </div>
  ${x.float_variance!=null?`<div class="cash-open-variance ${Math.abs(Number(x.float_variance))>.01?'bad':''}"><span>Écart fond</span><strong>${fmtMoney(x.float_variance)}</strong></div>`:''}
  <div class="cash-open-checks">
    ${check(x,'pos_ok','POS opérationnel',locked)}${check(x,'tpe_ok','TPE opérationnel',locked)}${check(x,'printer_ok','Imprimante ticket',locked)}${check(x,'shift_opened','Shift Dynamics ouvert',locked)}
  </div>
  <div class="field"><label>Note</label><input data-co-note="${x.id}" value="${esc(x.note||'')}" placeholder="Anomalie / correction / remplacement" ${locked?'disabled':''}></div>
  <div class="cash-open-footer"><span class="small muted">${x.checked_by_name?`Contrôlé par ${esc(x.checked_by_name)}`:'Non contrôlé'}</span>${canManage()&&!locked?`<button class="btn ${ready?'soft':'brand'}" data-check-cash-opening="${x.id}">${ready?'Recontrôler':'Contrôler la caisse'}</button>`:''}</div>
 </article>`}
function check(x,key,text,locked){return`<label class="cash-open-check"><input type="checkbox" data-co-check="${x.id}:${key}" ${Number(x[key])===1?'checked':''} ${locked?'disabled':''}><span>${text}</span></label>`}
function policyPanel(p){return`<details class="card" style="margin-top:14px"><summary><strong>Politique réseau · fonds de caisse</strong> · Direction</summary><div class="form-grid" style="margin-top:12px"><div class="field"><label>Tolérance d’écart (DH)</label><input id="cashOpeningTolerance" type="number" min="0" max="10" step="0.01" value="${Number(p?.float_tolerance_dh||0)}"></div></div><button class="btn soft" id="saveCashOpeningPolicyBtn">Enregistrer</button></details>`}
function val(id,key){return document.querySelector(`[data-co-${key}="${id}"]`)?.value}
function checked(id,key){return !!document.querySelector(`[data-co-check="${id}:${key}"]`)?.checked}
function bind(){
 $('#syncCashOpeningBtn')?.addEventListener('click',async()=>{try{await api(`/api/stores/${app.storeId}/cash-opening/sync`,{method:'POST'});toast('Préparation caisses resynchronisée avec Dynamics.');renderCashOpening()}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-check-cash-opening]').forEach(b=>b.addEventListener('click',async()=>{try{const id=b.dataset.checkCashOpening,payload={cashierName:val(id,'cashier'),declaredFloat:Number(val(id,'float')),posOk:checked(id,'pos_ok'),tpeOk:checked(id,'tpe_ok'),printerOk:checked(id,'printer_ok'),shiftOpened:checked(id,'shift_opened'),note:val(id,'note')||''};await api(`/api/cash-opening/lines/${id}/check`,{method:'POST',body:JSON.stringify(payload)});toast('Caisse prête.');renderCashOpening()}catch(e){toast(Array.isArray(e.details)&&e.details.length?e.details.join(' · '):e.message);renderCashOpening()}}));
 $('#saveCashOpeningPolicyBtn')?.addEventListener('click',async()=>{try{await api('/api/cash-opening/policy',{method:'PUT',body:JSON.stringify({floatTolerance:Number($('#cashOpeningTolerance').value)})});toast('Tolérance fonds de caisse mise à jour.');renderCashOpening()}catch(e){toast(e.message)}});
}

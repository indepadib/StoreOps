import { api } from '../api.js';
import { app,canManage,isDirector } from '../state.js';
import { $,esc,status,fmtMoney,toast } from '../ui.js';

const LABEL={READY_TO_POST:'Prête à poster',APPROVAL_REQUIRED:'Validation Direction',APPROVED:'Approuvée',POSTED:'Postée',CANCELLED:'Annulée'};
const TYPE={READY_TO_POST:'warn',APPROVAL_REQUIRED:'danger',APPROVED:'warn',POSTED:'ok',CANCELLED:'neutral'};
let cfg=null;

export async function renderLosses(){
  const [config,data]=await Promise.all([api('/api/loss/config'),api(`/api/stores/${app.storeId}/losses`)]);cfg=config;
  const s=data.summary||{},items=data.items||[];
  $('#lossesContent').innerHTML=`
    <div class="grid g4 loss-kpis">
      <div class="card"><div class="label">Pertes du jour</div><div class="kpi">${s.records||0}</div><div class="small muted">${s.posted||0} postée(s)</div></div>
      <div class="card"><div class="label">À traiter</div><div class="kpi">${s.blocking||0}</div><div class="small muted">bloque(nt) la fermeture</div></div>
      <div class="card"><div class="label">Valeur vente estimée</div><div class="kpi loss-money">${fmtMoney(s.retailValue||0)}</div><div class="small muted">indicateur démarque</div></div>
      <div class="card"><div class="label">Validation / preuve</div><div class="kpi">${Number(s.pendingApproval||0)+Number(s.pendingEvidence||0)}</div><div class="small muted">${s.pendingApproval||0} Direction · ${s.pendingEvidence||0} preuve(s)</div></div>
    </div>
    ${canManage()?createPanel(config):'<div class="banner ban-info" style="margin-top:14px"><strong>Lecture seule.</strong> La saisie et le posting sont réservés au Responsable magasin et à la Direction.</div>'}
    ${isDirector()?policyPanel(config.policy):''}
    <div class="card" style="margin-top:14px">
      <div class="row"><div><strong>Registre démarque & pertes</strong><div class="small muted">Chaque sortie doit être documentée puis postée avant fermeture.</div></div><span class="pill">${items.length} ligne(s)</span></div>
      <div class="loss-list">${items.length?items.map(lossCard).join(''):'<div class="empty">Aucune perte enregistrée aujourd’hui.</div>'}</div>
    </div>`;
  bind();
}

function createPanel(config){return`<div class="card loss-create" style="margin-top:14px">
  <div class="row"><div><strong>Enregistrer une sortie / perte</strong><div class="small muted">Le prix et l’article sont récupérés depuis Dynamics.</div></div><span class="pill">Terrain</span></div>
  <div class="form-grid" style="margin-top:12px">
    <div class="field"><label>EAN *</label><input id="lossEan" inputmode="numeric" placeholder="Scanner ou saisir le code-barres"></div>
    <div class="field"><label>Motif *</label><select id="lossReason">${config.reasons.map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select></div>
    <div class="field"><label>Quantité *</label><input id="lossQty" type="number" min="0.001" step="0.001" value="1"></div>
    <div class="field"><label>Unité</label><select id="lossUnit">${config.units.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div>
    <div class="field full"><label>Commentaire</label><textarea id="lossNote" rows="2" placeholder="Ex. bouteille cassée en rayon, produit isolé..."></textarea></div>
  </div>
  <div class="loss-rules"><span>Preuve ≥ ${fmtMoney(config.policy.evidence_threshold_dh)}</span><span>Validation Direction ≥ ${fmtMoney(config.policy.approval_threshold_dh)}</span></div>
  <button class="btn brand" id="createLossBtn">Enregistrer la perte</button>
</div>`}
function policyPanel(p){return`<details class="card" style="margin-top:14px"><summary><strong>Politique réseau démarque</strong> · Direction</summary><div class="form-grid" style="margin-top:12px"><div class="field"><label>Preuve obligatoire à partir de</label><input id="lossEvidenceThreshold" type="number" min="0" step="1" value="${Number(p.evidence_threshold_dh)}"></div><div class="field"><label>Validation Direction à partir de</label><input id="lossApprovalThreshold" type="number" min="0" step="1" value="${Number(p.approval_threshold_dh)}"></div></div><button class="btn soft" id="saveLossPolicyBtn">Enregistrer la politique</button></details>`}
function lossCard(x){
 const evidence=x.requires_evidence?`<span class="loss-flag">Preuve ${x.incident?.status==='RESOLVED'?'✓':'requise'}</span>`:'';
 const approval=x.status==='APPROVAL_REQUIRED'?'<span class="loss-flag danger">Direction requise</span>':x.approved_by_name?`<span class="loss-flag">Approuvée · ${esc(x.approved_by_name)}</span>`:'';
 return`<article class="loss-row ${x.status==='POSTED'?'done':''}">
  <div class="loss-main"><div class="row"><div><strong>${esc(x.product_name)}</strong><div class="small muted">EAN ${esc(x.ean)} · ${esc(x.category||'Autre')}</div></div>${status(LABEL[x.status]||x.status,TYPE[x.status]||'neutral')}</div>
  <div class="loss-meta"><span><b>${Number(x.quantity)} ${esc(x.unit)}</b></span><span>${esc(cfg?.reasons.find(r=>r.code===x.reason_code)?.label||x.reason_code)}</span><span>${x.total_retail_value==null?'Valeur Dynamics indisponible':fmtMoney(x.total_retail_value)}</span></div>${x.note?`<div class="small loss-note">${esc(x.note)}</div>`:''}<div class="loss-flags">${evidence}${approval}</div></div>
  <div class="loss-actions">${x.incident_id&&x.incident?.status!=='RESOLVED'?`<button class="btn soft" data-open-incident="${x.incident_id}">Traiter preuve</button>`:''}${isDirector()&&x.status==='APPROVAL_REQUIRED'?`<button class="btn soft" data-approve-loss="${x.id}">Approuver</button>`:''}${canManage()&&['READY_TO_POST','APPROVED'].includes(x.status)?`<button class="btn brand" data-post-loss="${x.id}">Poster Dynamics</button>`:''}</div>
 </article>`;
}
function bind(){
 const create=$('#createLossBtn');if(create)create.onclick=async()=>{try{const ean=$('#lossEan').value.trim(),quantity=Number($('#lossQty').value);if(!ean)throw new Error('EAN obligatoire.');await api(`/api/stores/${app.storeId}/losses`,{method:'POST',body:JSON.stringify({ean,reasonCode:$('#lossReason').value,quantity,unit:$('#lossUnit').value,note:$('#lossNote').value.trim()})});toast('Perte enregistrée.');renderLosses()}catch(e){toast(e.message)}};
 document.querySelectorAll('[data-approve-loss]').forEach(b=>b.onclick=async()=>{try{await api(`/api/losses/${b.dataset.approveLoss}/approve`,{method:'POST'});toast('Perte approuvée par la Direction.');renderLosses()}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-post-loss]').forEach(b=>b.onclick=async()=>{try{await api(`/api/losses/${b.dataset.postLoss}/post`,{method:'POST'});toast('Sortie de stock postée dans Dynamics.');renderLosses()}catch(e){toast(e.message)}});
 const save=$('#saveLossPolicyBtn');if(save)save.onclick=async()=>{try{await api('/api/loss/policy',{method:'PUT',body:JSON.stringify({evidenceThreshold:Number($('#lossEvidenceThreshold').value),approvalThreshold:Number($('#lossApprovalThreshold').value)})});toast('Politique démarque mise à jour.');renderLosses()}catch(e){toast(e.message)}};
}

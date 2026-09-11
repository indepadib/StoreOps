import { api } from '../api.js';
import { app,canManage,isDirector } from '../state.js';
import { $,esc,status,fmtMoney,toast } from '../ui.js';

const LABEL={READY_TO_POST:'Prête',APPROVAL_REQUIRED:'Validation Direction',APPROVED:'Approuvée',POSTED:'Import ERP confirmé',CANCELLED:'Annulée'};
const TYPE={READY_TO_POST:'warn',APPROVAL_REQUIRED:'danger',APPROVED:'warn',POSTED:'ok',CANCELLED:'neutral'};
let cfg=null;

export async function renderLosses(){
  const [config,data,exportState]=await Promise.all([api('/api/loss/config'),api(`/api/stores/${app.storeId}/losses`),api(`/api/stores/${app.storeId}/losses/export-status`)]);cfg=config;
  const s=data.summary||{},items=data.items||[];
  $('#lossesContent').innerHTML=`
    <div class="grid g4 loss-kpis">
      <div class="card"><div class="label">Pertes du jour</div><div class="kpi">${s.records||0}</div><div class="small muted">${s.posted||0} confirmée(s) ERP</div></div>
      <div class="card"><div class="label">À traiter</div><div class="kpi">${s.blocking||0}</div><div class="small muted">bloque(nt) la fermeture</div></div>
      <div class="card"><div class="label">Valeur vente estimée</div><div class="kpi loss-money">${fmtMoney(s.retailValue||0)}</div><div class="small muted">indicateur démarque</div></div>
      <div class="card"><div class="label">Validation / preuve</div><div class="kpi">${Number(s.pendingApproval||0)+Number(s.pendingEvidence||0)}</div><div class="small muted">${s.pendingApproval||0} Direction · ${s.pendingEvidence||0} preuve(s)</div></div>
    </div>
    ${canManage()?createPanel(config):'<div class="banner ban-info" style="margin-top:14px"><strong>Lecture seule.</strong> La saisie est réservée au Responsable magasin et à la Direction.</div>'}
    ${closingPackPanel(exportState)}
    ${isDirector()?policyPanel(config.policy):''}
    <div class="card" style="margin-top:14px">
      <div class="row"><div><strong>Registre démarque & pertes</strong><div class="small muted">Saisissez au fil de la journée. StoreOps regroupe ensuite toutes les lignes dans le Closing Pack ERP obligatoire avant fermeture.</div></div><span class="pill">${items.length} ligne(s)</span></div>
      <div class="loss-list">${items.length?items.map(lossCard).join(''):'<div class="empty">Aucune perte enregistrée aujourd’hui.</div>'}</div>
    </div>`;
  bind();
}

function createPanel(config){return`<div class="card loss-create" style="margin-top:14px">
  <div class="row"><div><strong>Enregistrer une sortie / perte</strong><div class="small muted">Scannez l’article dès que la démarque se produit. Les traitements DLC déjà liés ne doivent pas être ressaisis.</div></div><span class="pill">Terrain</span></div>
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

function closingPackPanel(x={}){
 const blockers=x.blockers||[],last=x.lastExport;
 if(!canManage())return'';
 if(!x.openLines)return`<div class="card" style="margin-top:14px"><div class="row"><div><strong>Closing Pack démarque</strong><div class="small muted">Aucune ligne de démarque en attente d’import ERP.</div></div>${status('À jour','ok')}</div></div>`;
 const template=x.erpTemplateConfigured?`Template ERP ${esc(x.erpTemplate?.name||x.erpTemplate?.code||'configuré')}`:'Template ERP exact à mapper';
 return`<div class="card" style="margin-top:14px">
  <div class="row"><div><strong>Closing Pack démarque</strong><div class="small muted">${x.openLines} ligne(s) · ${template}. La fermeture reste bloquée jusqu’à confirmation de l’import ERP.</div></div>${status(x.ready?'Prêt à générer':`${blockers.length} blocage(s)`,x.ready?'ok':'danger')}</div>
  ${blockers.length?`<div class="banner ban-danger" style="margin-top:10px"><strong>À terminer avant export</strong><span>${blockers.slice(0,3).map(b=>esc(`${b.productName} — ${b.message}`)).join('<br>')}</span></div>`:''}
  ${!x.erpTemplateConfigured?'<div class="banner ban-info" style="margin-top:10px"><strong>Mode audit uniquement</strong><span>Le canvas exact de l’ERP n’est pas encore configuré. StoreOps peut générer un CSV de contrôle mais ne permettra pas de confirmer un import ERP.</span></div>':''}
  <div class="row" style="margin-top:12px"><button class="btn brand" id="generateLossPackBtn" ${x.ready?'':'disabled'}>Générer le fichier final</button>${last?`<span class="small muted">Dernier fichier : ${esc(last.fileName)} · ${esc(last.status)}</span>`:''}</div>
  ${last?.status==='GENERATED'&&last.confirmable?`<div class="form-grid" style="margin-top:12px"><div class="field"><label>Référence / preuve d’import ERP *</label><input id="lossImportReference" placeholder="Ex. journal, batch, numéro d’import..."></div><div class="field" style="align-self:end"><button class="btn brand" id="confirmLossImportBtn" data-export-id="${esc(last.id)}">Confirmer l’import ERP</button></div></div>`:''}
 </div>`
}

function policyPanel(p){return`<details class="card" style="margin-top:14px"><summary><strong>Politique réseau démarque</strong> · Direction</summary><div class="form-grid" style="margin-top:12px"><div class="field"><label>Preuve obligatoire à partir de</label><input id="lossEvidenceThreshold" type="number" min="0" step="1" value="${Number(p.evidence_threshold_dh)}"></div><div class="field"><label>Validation Direction à partir de</label><input id="lossApprovalThreshold" type="number" min="0" step="1" value="${Number(p.approval_threshold_dh)}"></div></div><button class="btn soft" id="saveLossPolicyBtn">Enregistrer la politique</button></details>`}
function lossCard(x){
 const proofOk=!!x.evidence_satisfied||x.incident?.status==='RESOLVED',proofSource=x.external_evidence?.source==='DLC'?' · DLC liée':'';
 const evidence=x.requires_evidence?`<span class="loss-flag">Preuve ${proofOk?'✓':'requise'}${proofOk?proofSource:''}</span>`:'';
 const source=x.source_type==='DLC_TREATMENT'?'<span class="loss-flag">Créée depuis DLC</span>':'';
 const approval=x.status==='APPROVAL_REQUIRED'?'<span class="loss-flag danger">Direction requise</span>':x.approved_by_name?`<span class="loss-flag">Approuvée · ${esc(x.approved_by_name)}</span>`:'';
 const posting=x.status==='POSTED'&&x.posted_method?`<span class="loss-flag">${x.posted_method==='FILE_IMPORT'?'Import fichier':'API'}${x.posted_reference?` · ${esc(x.posted_reference)}`:''}</span>`:'';
 return`<article class="loss-row ${x.status==='POSTED'?'done':''}">
  <div class="loss-main"><div class="row"><div><strong>${esc(x.product_name)}</strong><div class="small muted">EAN ${esc(x.ean)} · ${esc(x.category||'Autre')}</div></div>${status(LABEL[x.status]||x.status,TYPE[x.status]||'neutral')}</div>
  <div class="loss-meta"><span><b>${Number(x.quantity)} ${esc(x.unit)}</b></span><span>${esc(cfg?.reasons.find(r=>r.code===x.reason_code)?.label||x.reason_code)}</span><span>${x.total_retail_value==null?'Valeur prix indisponible':fmtMoney(x.total_retail_value)}</span></div>${x.note?`<div class="small loss-note">${esc(x.note)}</div>`:''}<div class="loss-flags">${source}${evidence}${approval}${posting}</div></div>
  <div class="loss-actions">${x.incident_id&&x.incident?.status!=='RESOLVED'?`<button class="btn soft" data-open-incident="${x.incident_id}">Traiter preuve</button>`:''}${isDirector()&&x.status==='APPROVAL_REQUIRED'?`<button class="btn soft" data-approve-loss="${x.id}">Approuver</button>`:''}</div>
 </article>`;
}
function downloadFile(file){const blob=new Blob([file.content],{type:file.mimeType||'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.fileName||'demarque.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function bind(){
 const create=$('#createLossBtn');if(create)create.onclick=async()=>{try{const ean=$('#lossEan').value.trim(),quantity=Number($('#lossQty').value);if(!ean)throw new Error('EAN obligatoire.');await api(`/api/stores/${app.storeId}/losses`,{method:'POST',body:JSON.stringify({ean,reasonCode:$('#lossReason').value,quantity,unit:$('#lossUnit').value,note:$('#lossNote').value.trim()})});toast('Perte enregistrée.');renderLosses()}catch(e){toast(e.message)}};
 document.querySelectorAll('[data-approve-loss]').forEach(b=>b.onclick=async()=>{try{await api(`/api/losses/${b.dataset.approveLoss}/approve`,{method:'POST'});toast('Perte approuvée par la Direction.');renderLosses()}catch(e){toast(e.message)}});
 const generate=$('#generateLossPackBtn');if(generate)generate.onclick=async()=>{try{generate.disabled=true;const result=await api(`/api/stores/${app.storeId}/losses/export`,{method:'POST',body:JSON.stringify({})});downloadFile(result.file);toast(result.confirmable?'Fichier ERP généré. Importez-le puis confirmez la référence.':'CSV d’audit généré. Le template ERP exact reste à mapper.');renderLosses()}catch(e){generate.disabled=false;toast(e.message)}};
 const confirm=$('#confirmLossImportBtn');if(confirm)confirm.onclick=async()=>{try{const reference=$('#lossImportReference').value.trim();if(!reference)throw new Error('Référence d’import ERP obligatoire.');await api(`/api/loss-exports/${confirm.dataset.exportId}/confirm`,{method:'POST',body:JSON.stringify({reference})});toast('Import ERP confirmé. La démarque du fichier est clôturée.');renderLosses()}catch(e){toast(e.message)}};
 const save=$('#saveLossPolicyBtn');if(save)save.onclick=async()=>{try{await api('/api/loss/policy',{method:'PUT',body:JSON.stringify({evidenceThreshold:Number($('#lossEvidenceThreshold').value),approvalThreshold:Number($('#lossApprovalThreshold').value)})});toast('Politique démarque mise à jour.');renderLosses()}catch(e){toast(e.message)}};
}

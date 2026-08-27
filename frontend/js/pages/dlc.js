import{api,apiBlob}from'../api.js';
import{app,canManage,isDirector}from'../state.js';
import{$,status,fmtDate,esc,toast}from'../ui.js';

let cfg=null,allItems=[],productPreview=null;
const sev=x=>x==='CRITICAL'?'danger':x==='HIGH'||x==='MEDIUM'?'warn':'ok';
const dt=v=>v?new Date(v.endsWith?.('Z')?v:v+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';

export async function renderDlc(){
  cfg=await api('/api/dlc/config');
  const data=await api(`/api/stores/${app.storeId}/dlc?status=ALL`);
  allItems=data.items||[];const s=data.summary||{};
  const active=allItems.filter(x=>x.status==='ACTIVE'),closed=allItems.filter(x=>x.status==='CLOSED');
  $('#dlcContent').innerHTML=`
    <div class="grid g4 dlc-kpis">
      ${kpi('Périmé / DDM dépassée',s.expired||0,'À sortir / décider immédiatement','danger')}
      ${kpi('Critique',s.critical||0,'Traitement le jour même','danger')}
      ${kpi('Alerte',s.alert||0,'Action commerciale + suivi','warn')}
      ${kpi('À surveiller',s.watch||0,'FEFO / recontrôle','neutral')}
    </div>
    <div class="grid g3" style="margin-top:12px">
      ${kpi('Quantité à risque',s.quantityAtRisk||0,'unités/kg/L selon article','warn')}
      ${kpi('Actions en attente',s.pendingActions||0,'lots nécessitant une action','neutral')}
      ${kpi('Recontrôles en retard',s.overdueControls||0,'contrôles à reprendre','danger')}
    </div>

    ${canManage()?entryPanel():`<div class="role-lock" style="margin-top:14px">Lecture seule. La saisie et le traitement DLC sont réservés au Responsable magasin et au Directeur d’Exploitation.</div>`}

    <div class="network-section-title"><div><strong>File de traitement DLC / DDM</strong><span>Priorité calculée automatiquement selon le rayon et le nombre de jours restants.</span></div><span class="pill">${active.length} lot(s) actif(s)</span></div>
    <div class="dlc-priority-list">${active.length?active.map(recordCard).join(''):'<div class="card empty">Aucun lot DLC actif.</div>'}</div>

    <div class="network-section-title"><div><strong>Registre complet</strong><span>Traçabilité des lots actifs et clôturés.</span></div><span class="pill">${allItems.length}</span></div>
    <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Article / lot</th><th>Rayon / famille</th><th>Date</th><th>Qté initiale</th><th>Restante</th><th>État</th><th>Dernière action</th></tr></thead><tbody>
      ${allItems.map(registryRow).join('')||'<tr><td colspan="7"><div class="empty">Aucune donnée DLC.</div></td></tr>'}
    </tbody></table></div></div>

    ${isDirector()?thresholdPanel():''}
  `;
  bindDlc();
}

function kpi(label,value,sub,type){return`<div class="card ${type==='danger'?'dlc-kpi-danger':type==='warn'?'dlc-kpi-warn':''}"><div class="label">${esc(label)}</div><div class="kpi">${value}</div><div class="small muted">${esc(sub)}</div></div>`}

function entryPanel(){
 const dept=cfg.departments[0];
 return`<div class="card dlc-entry" style="margin-top:14px">
   <div class="row"><div><strong>Nouveau contrôle DLC / DDM</strong><div class="small muted">Scanner l’article, identifier le lot puis StoreOps calcule automatiquement le niveau d’alerte et l’action attendue.</div></div><span class="pill">Saisie magasin</span></div>
   <div class="form-grid" style="margin-top:12px">
    <div class="field"><label>EAN / code article *</label><div class="row"><input id="dlcEan" placeholder="Scanner / saisir" style="flex:1"><button class="btn soft" id="dlcLookup" type="button">Identifier</button></div><div id="dlcProductPreview" class="field-help"></div></div>
    <div class="field"><label>Type de date *</label><select id="dlcExpiryType">${cfg.expiryTypes.map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select></div>
    <div class="field"><label>DLC / DDM *</label><input id="dlcDate" type="date"></div>
    <div class="field"><label>Quantité constatée *</label><input id="dlcQty" type="number" min="0" step="0.01"></div>
    <div class="field"><label>Unité</label><select id="dlcUnit">${cfg.units.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label>Rayon *</label><select id="dlcDepartment">${cfg.departments.map(x=>`<option value="${esc(x.department)}">${esc(x.department)}</option>`).join('')}</select></div>
    <div class="field"><label>Famille</label><select id="dlcFamily">${(dept?.families||[]).map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
    <div class="field"><label>Zone</label><select id="dlcZone"><option>Rayon</option><option>Réserve</option><option>Chambre froide</option><option>Fruits & légumes</option><option>Zone non conforme</option></select></div>
    <div class="field"><label>Lot / repère</label><input id="dlcLot" placeholder="Lot fournisseur / repère interne"></div>
    <div class="field full"><label>Observation contrôle</label><input id="dlcComment" placeholder="Facultatif"></div>
   </div>
   <div class="row" style="justify-content:flex-end;margin-top:11px"><button class="btn brand" id="saveDlc">Enregistrer et calculer le risque</button></div>
 </div>`}

function recordCard(r){
 const risk=r.risk||{},urgent=['EXPIRED','DDM_PASSED','CRITICAL'].includes(risk.stage),t=r.treatments?.[0];
 return`<article class="card dlc-record ${urgent?'dlc-record-urgent':''}" data-dlc-card="${r.id}">
  <div class="row">
    <div><div class="small muted">${esc(r.department||'Rayon non renseigné')} · ${esc(r.family||'Famille non renseignée')}</div><h3>${esc(r.product_name)}</h3><div class="small muted">${esc(r.ean)}${r.lot_ref?' · lot '+esc(r.lot_ref):''}</div></div>
    ${status(risk.label||'—',sev(risk.severity))}
  </div>
  <div class="dlc-record-grid">
    <div><span>Date</span><strong>${fmtDate(r.expiry_date)}</strong><small>${esc(r.expiry_type||'DLC')}</small></div>
    <div><span>Jours restants</span><strong>${risk.daysRemaining??'—'}</strong><small>Seuil ${risk.threshold?.critical_days??'—'} / ${risk.threshold?.alert_days??'—'} / ${risk.threshold?.watch_days??'—'} j</small></div>
    <div><span>Quantité</span><strong>${r.remaining_quantity} ${esc(r.unit||'')}</strong><small>initiale ${r.original_quantity}</small></div>
    <div><span>État terrain</span><strong>${stateLabel(r.operational_state)}</strong><small>${esc(r.zone||'—')}</small></div>
  </div>
  <div class="dlc-required-action"><span>Action requise</span><strong>${esc(risk.action||'')}</strong></div>
  ${r.overdue_control?'<div class="banner ban-danger"><strong>Recontrôle en retard.</strong> Ce lot doit être revu maintenant.</div>':''}
  ${t?`<div class="small muted" style="margin-top:8px">Dernière action : <strong>${esc(actionLabel(t.action_type))}</strong> · ${esc(t.performed_by_name||'')} · ${dt(t.performed_at)}</div>`:''}
  ${canManage()?treatmentPanel(r):''}
  ${historyPanel(r)}
 </article>`}
function treatmentPanel(r){
 return`<details class="dlc-action-box"><summary>Traiter / recontrôler ce lot</summary>
   <div class="grid g2" style="margin-top:10px">
    <div class="dlc-subpanel"><strong>Enregistrer une action</strong>
      <div class="form-grid" style="margin-top:8px">
       <div class="field"><label>Action réalisée</label><select data-dlc-action="${r.id}">${cfg.actions.map(x=>`<option value="${x.code}">${esc(x.label)}${x.proof?' · preuve requise':''}</option>`).join('')}</select></div>
       <div class="field"><label>Quantité sortie si applicable</label><input data-dlc-action-qty="${r.id}" type="number" min="0" max="${r.remaining_quantity}" step="0.01" value="${r.remaining_quantity}"></div>
       <div class="field full"><label>Commentaire</label><input data-dlc-action-note="${r.id}" placeholder="Décision / justification / référence PV"></div>
       <div class="field"><label>Preuve photo / PDF</label><input data-dlc-proof="${r.id}" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment"></div>
       <div class="field"><label>Légende preuve</label><input data-dlc-proof-caption="${r.id}" placeholder="Ex. PV destruction signé"></div>
      </div>
      <button class="btn brand" data-dlc-treat="${r.id}">Enregistrer l’action</button>
    </div>
    <div class="dlc-subpanel"><strong>Recontrôle du lot</strong><div class="small muted">Renseigner la quantité réellement encore présente. Le lot est clôturé si la quantité passe à 0.</div>
      <div class="field" style="margin-top:8px"><label>Quantité restante constatée</label><input data-dlc-recheck-qty="${r.id}" type="number" min="0" step="0.01" value="${r.remaining_quantity}"></div>
      <div class="field"><label>Note de recontrôle</label><input data-dlc-recheck-note="${r.id}" placeholder="FEFO fait, vente écoulée, contrôle rayon…"></div>
      <button class="btn soft" data-dlc-recheck="${r.id}">Valider le recontrôle</button>
    </div>
   </div>
 </details>`}
function historyPanel(r){
 if(!(r.treatments?.length||r.evidence?.length))return'';
 return`<details class="dlc-history"><summary>Historique (${r.treatments?.length||0} action(s), ${r.evidence?.length||0} preuve(s))</summary>
   <div class="stack" style="margin-top:8px">${(r.treatments||[]).map(t=>`<div class="activity"><strong>${esc(actionLabel(t.action_type))}</strong><div>${esc(t.performed_by_name||'')} · ${dt(t.performed_at)} · qt. avant ${t.quantity_before} → après ${t.quantity_after}${t.note?' · '+esc(t.note):''}</div></div>`).join('')}</div>
   <div class="evidence-grid" style="margin-top:8px">${(r.evidence||[]).map(e=>`<button class="evidence-card" data-dlc-evidence="${e.id}"><strong>${esc(e.file_name)}</strong><span>${esc(e.caption||'Preuve DLC')}</span><small>${esc(e.created_by_name||'')} · ${dt(e.created_at)}</small></button>`).join('')}</div>
 </details>`}
function registryRow(r){const t=r.treatments?.[0];return`<tr><td><strong>${esc(r.product_name)}</strong><div class="small muted">${esc(r.ean)}${r.lot_ref?' · '+esc(r.lot_ref):''}</div></td><td>${esc(r.department||'—')}<div class="small muted">${esc(r.family||'—')}</div></td><td>${esc(r.expiry_type||'DLC')} · ${fmtDate(r.expiry_date)}<div class="small muted">${r.risk?.daysRemaining??'—'} j</div></td><td>${r.original_quantity} ${esc(r.unit||'')}</td><td>${r.remaining_quantity} ${esc(r.unit||'')}</td><td>${r.status==='CLOSED'?status('Clôturé','ok'):status(r.risk?.label||'Actif',sev(r.risk?.severity))}</td><td>${t?esc(actionLabel(t.action_type)):'—'}<div class="small muted">${t?dt(t.performed_at):''}</div></td></tr>`}

function thresholdPanel(){return`<div class="network-section-title"><div><strong>Paramétrage des seuils DLC</strong><span>Valeurs initiales reprises du fichier O2.PR2.F1. Modification réservée à la Direction.</span></div></div>
 <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Rayon</th><th>Critique ≤ J</th><th>Alerte ≤ J</th><th>Surveiller ≤ J</th><th>Familles</th><th></th></tr></thead><tbody>
 ${cfg.departments.map((d,i)=>`<tr data-dlc-th-row="${i}"><td><strong>${esc(d.department)}</strong></td><td><input data-th="critical" type="number" min="0" value="${d.critical_days}" style="width:76px"></td><td><input data-th="alert" type="number" min="0" value="${d.alert_days}" style="width:76px"></td><td><input data-th="watch" type="number" min="0" value="${d.watch_days}" style="width:76px"></td><td><span class="small muted">${(d.families||[]).length} famille(s)</span></td><td><button class="btn soft" data-save-dlc-th="${encodeURIComponent(d.department)}">Enregistrer</button></td></tr>`).join('')}
 </tbody></table></div></div>`}

function bindDlc(){
 $('#dlcDepartment')?.addEventListener('change',updateFamilies);
 $('#dlcLookup')?.addEventListener('click',lookupProduct);
 $('#dlcEan')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookupProduct()}});
 $('#saveDlc')?.addEventListener('click',saveDlc);
 document.querySelectorAll('[data-dlc-treat]').forEach(b=>b.addEventListener('click',()=>treat(b.dataset.dlcTreat)));
 document.querySelectorAll('[data-dlc-recheck]').forEach(b=>b.addEventListener('click',()=>recheck(b.dataset.dlcRecheck)));
 document.querySelectorAll('[data-dlc-evidence]').forEach(b=>b.addEventListener('click',()=>viewEvidence(b.dataset.dlcEvidence)));
 document.querySelectorAll('[data-save-dlc-th]').forEach(b=>b.addEventListener('click',()=>saveThreshold(b)));
}
function updateFamilies(){const d=cfg.departments.find(x=>x.department===$('#dlcDepartment').value);$('#dlcFamily').innerHTML=(d?.families||[]).map(x=>`<option>${esc(x)}</option>`).join('')}
async function lookupProduct(){try{const ean=$('#dlcEan').value.trim();if(!ean)throw new Error('Scanner ou saisir un EAN.');productPreview=await api(`/api/products/${encodeURIComponent(ean)}`);$('#dlcProductPreview').innerHTML=`<strong>${esc(productPreview.name)}</strong> · ${esc(productPreview.category||'')}`;toast('Article identifié.')}catch(e){productPreview=null;$('#dlcProductPreview').textContent=e.message;toast(e.message)}}
async function saveDlc(){try{if(!productPreview||productPreview.ean!==$('#dlcEan').value.trim())await lookupProduct();if(!productPreview)throw new Error('Article non identifié.');const b={ean:$('#dlcEan').value.trim(),expiryType:$('#dlcExpiryType').value,expiryDate:$('#dlcDate').value,quantity:Number($('#dlcQty').value),unit:$('#dlcUnit').value,department:$('#dlcDepartment').value,family:$('#dlcFamily').value||null,zone:$('#dlcZone').value,lotRef:$('#dlcLot').value.trim(),comment:$('#dlcComment').value.trim()};await api(`/api/stores/${app.storeId}/dlc`,{method:'POST',body:JSON.stringify(b)});toast('Lot enregistré et risque calculé.');productPreview=null;await renderDlc()}catch(e){toast(e.message)}}
async function treat(id){try{const actionType=document.querySelector(`[data-dlc-action="${id}"]`).value,quantity=Number(document.querySelector(`[data-dlc-action-qty="${id}"]`).value||0),note=document.querySelector(`[data-dlc-action-note="${id}"]`).value.trim(),file=document.querySelector(`[data-dlc-proof="${id}"]`).files?.[0]||null,caption=document.querySelector(`[data-dlc-proof-caption="${id}"]`).value.trim();let dataUrl=null;if(file)dataUrl=await fileDataUrl(file);await api(`/api/dlc/${id}/treatments`,{method:'POST',body:JSON.stringify({actionType,quantity,note,dataUrl,fileName:file?.name||null,caption})});toast('Action DLC enregistrée et auditée.');await renderDlc()}catch(e){toast(e.message)}}
async function recheck(id){try{const quantity=Number(document.querySelector(`[data-dlc-recheck-qty="${id}"]`).value),note=document.querySelector(`[data-dlc-recheck-note="${id}"]`).value.trim();await api(`/api/dlc/${id}/recheck`,{method:'POST',body:JSON.stringify({quantity,note})});toast(quantity===0?'Lot clôturé.':'Recontrôle enregistré.');await renderDlc()}catch(e){toast(e.message)}}
async function viewEvidence(id){try{const blob=await apiBlob(`/api/dlc-media/${id}`);const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){toast(e.message)}}
async function saveThreshold(btn){try{const row=btn.closest('[data-dlc-th-row]'),get=n=>Number(row.querySelector(`[data-th="${n}"]`).value);await api(`/api/dlc/thresholds/${btn.dataset.saveDlcTh}`,{method:'PUT',body:JSON.stringify({criticalDays:get('critical'),alertDays:get('alert'),watchDays:get('watch')})});toast('Seuil DLC réseau mis à jour.');await renderDlc()}catch(e){toast(e.message)}}
function actionLabel(code){return cfg?.actions?.find(x=>x.code===code)?.label||code||'—'}
function stateLabel(x){return({SELLABLE:'En vente',SHORT_DATE:'DLC courte / démarque',FEFO:'FEFO renforcé',ISOLATED:'Isolé hors vente',DISPOSED:'Sorti du stock'}[x]||x||'—')}
function fileDataUrl(file){return new Promise((resolve,reject)=>{if(file.size>8*1024*1024)return reject(new Error('Preuve trop volumineuse (8 Mo max).'));const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Impossible de lire le fichier.'));r.readAsDataURL(file)})}

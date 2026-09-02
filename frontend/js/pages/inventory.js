import{api}from'../api.js';
import{app,canManage,isDirector}from'../state.js';
import{$,status,esc,toast}from'../ui.js';

let cfg=null,data=null;
const reasonLabel=code=>cfg?.reasons?.find(x=>x.code===code)?.label||code||'—';
const sessionLabel=x=>({CYCLE:'Inventaire tournant',TARGETED:'Inventaire ciblé',FULL:'Inventaire complet'}[x]||x);
const sessionStatus=x=>({COUNTING:'Comptage',REVIEW:'Revue',READY_TO_POST:'Prêt à poster',POSTED:'Posté',CANCELLED:'Annulé'}[x]||x);
const statusKind=x=>x==='POSTED'?'ok':x==='READY_TO_POST'?'warn':x==='CANCELLED'?'neutral':'neutral';
const dt=v=>v?new Date(String(v).replace(' ','T')+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';

export async function renderInventory(){
  cfg=await api('/api/inventory/config');
  data=await api(`/api/stores/${app.storeId}/inventory?status=ALL`);
  const s=data.summary||{},items=data.items||[];
  $('#inventoryContent').innerHTML=`
    <div class="grid g4">
      ${kpi('Sessions ouvertes',s.openSessions||0,'inventaires en cours')}
      ${kpi('Recomptages',s.pendingRecounts||0,'écarts à revérifier','warn')}
      ${kpi('Lignes en écart',s.varianceLines||0,'écarts finaux en cours','warn')}
      ${kpi('Prêts à poster',s.readyToPost||0,'validés StoreOps')}
    </div>
    <div class="grid g2" style="margin-top:12px">
      ${kpi('Écart absolu',s.absoluteVarianceQty||0,'unités cumulées',s.absoluteVarianceQty?'warn':'')}
      ${isDirector()?policyCard():conceptCard()}
    </div>
    ${canManage()?createPanel():`<div class="role-lock" style="margin-top:14px">Lecture seule. Le comptage et la validation sont réservés au Responsable magasin et au Directeur d’Exploitation.</div>`}
    <div class="network-section-title"><div><strong>Sessions d’inventaire</strong><span>Le stock théorique provient de Dynamics ; StoreOps conserve le snapshot utilisé pour le contrôle.</span></div><span class="pill">${items.length}</span></div>
    <div class="inventory-session-list">${items.length?items.map(sessionCard).join(''):'<div class="card empty">Aucun inventaire enregistré.</div>'}</div>
  `;
  bindInventory();
}

function kpi(label,value,sub,type=''){return`<div class="card ${type==='warn'?'inventory-kpi-warn':''}"><div class="label">${esc(label)}</div><div class="kpi">${value}</div><div class="small muted">${esc(sub)}</div></div>`}
function conceptCard(){return`<div class="card"><div class="label">Règle de contrôle</div><strong>Écart ≥ ${cfg.policy.recount_qty_threshold} → recomptage</strong><div class="small muted" style="margin-top:5px">Écart ≥ ${cfg.policy.incident_qty_threshold} → incident Stock avec preuve.</div></div>`}
function policyCard(){return`<div class="card inventory-policy"><div class="label">Politique réseau</div><div class="form-grid" style="margin-top:8px"><div class="field"><label>Recomptage dès écart ≥</label><input id="invRecountThreshold" type="number" min="0" step="0.01" value="${cfg.policy.recount_qty_threshold}"></div><div class="field"><label>Incident dès écart ≥</label><input id="invIncidentThreshold" type="number" min="0" step="0.01" value="${cfg.policy.incident_qty_threshold}"></div></div><button class="btn soft" id="saveInventoryPolicy">Enregistrer la politique</button></div>`}
function createPanel(){return`<div class="card inventory-create" style="margin-top:14px"><div class="row"><div><strong>Lancer un inventaire</strong><div class="small muted">Le stock théorique sera figé article par article au moment du scan.</div></div><span class="pill">Responsable / Direction</span></div><div class="form-grid" style="margin-top:10px"><div class="field"><label>Type</label><select id="invType">${cfg.types.map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select></div><div class="field"><label>Zone / périmètre</label><input id="invZone" placeholder="Ex. PLS, Réserve, Allée 3"></div><div class="field full"><label>Commentaire</label><input id="invComment" placeholder="Objectif du comptage / anomalie déclencheuse"></div></div><button class="btn brand" id="createInventory" style="margin-top:10px">Démarrer l’inventaire</button></div>`}

function sessionCard(inv){
 const editable=canManage()&&['COUNTING','REVIEW'].includes(inv.status),ready=inv.status==='READY_TO_POST';
 return`<article class="card inventory-session ${ready?'inventory-ready':''}">
   <div class="row"><div><div class="small muted">${sessionLabel(inv.inventory_type)} · ${esc(inv.zone||'Périmètre non précisé')}</div><h3>${esc(inv.id)}</h3><div class="small muted">Créé par ${esc(inv.created_by_name||'—')} · ${dt(inv.created_at)}</div></div>${status(sessionStatus(inv.status),statusKind(inv.status))}</div>
   <div class="inventory-session-kpis"><div><span>Articles</span><strong>${inv.metrics.lines}</strong></div><div><span>Comptés</span><strong>${inv.metrics.counted}</strong></div><div><span>Recomptages</span><strong>${inv.metrics.recounts}</strong></div><div><span>Écart abs.</span><strong>${inv.metrics.absoluteVarianceQty}</strong></div></div>
   ${editable?addLinePanel(inv):''}
   <div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>Article</th><th>Théorique</th><th>1er comptage</th><th>Écart</th><th>Recomptage / final</th><th>Motif</th><th>Action</th></tr></thead><tbody>${inv.lines.map(lineRow).join('')||'<tr><td colspan="7"><div class="empty compact">Aucun article. Scanne un EAN pour commencer.</div></td></tr>'}</tbody></table></div>
   <div class="inventory-footer">
     <div class="small muted">${inv.status==='POSTED'?`Posté par ${esc(inv.posted_by_name||'—')} · ${dt(inv.posted_at)}`:inv.status==='READY_TO_POST'?`Validé par ${esc(inv.reviewed_by_name||'—')} · ${dt(inv.reviewed_at)}`:'Tous les écarts doivent être motivés avant validation.'}</div>
     <div class="row">${editable?`<button class="btn brand" data-finalize-inventory="${inv.id}" ${!inv.lines.length?'disabled':''}>Valider le comptage</button>`:''}${ready&&canManage()?`<button class="btn brand" data-post-inventory="${inv.id}">Poster l’ajustement Dynamics</button>`:''}</div>
   </div>
 </article>`}
function addLinePanel(inv){return`<div class="inventory-add-line"><div><strong>Ajouter un article</strong><div class="small muted">EAN scanné → stock théorique Dynamics snapshoté dans cette session.</div></div><div class="row"><input data-inv-ean="${inv.id}" placeholder="Scanner / saisir EAN"><button class="btn soft" data-add-inv-line="${inv.id}">Ajouter</button></div></div>`}
function lineRow(l){
 const variance=l.final_variance??l.variance1,varianceClass=Number(variance)===0?'':'inventory-variance';
 const action=l.status==='TO_COUNT'?countForm(l,false):l.status==='RECOUNT'?countForm(l,true):status('Compté','ok');
 return`<tr><td><strong>${esc(l.product_name)}</strong><div class="small muted">${esc(l.ean)}${l.product_number?' · '+esc(l.product_number):''}</div></td><td><strong>${l.theoretical_qty}</strong></td><td>${l.count1_qty??'—'}<div class="small muted">${l.count1_by_name?esc(l.count1_by_name):''}</div></td><td class="${varianceClass}">${variance??'—'}</td><td>${l.count2_qty??l.final_qty??'—'}${l.requires_recount?'<div class="small danger-text">Recomptage obligatoire</div>':''}</td><td>${esc(reasonLabel(l.reason_code))}${l.note?`<div class="small muted">${esc(l.note)}</div>`:''}</td><td>${action}</td></tr>`}
function countForm(l,recount){
 return`<div class="inventory-count-form"><input data-count-qty="${l.id}" type="number" min="0" step="0.01" placeholder="Qté"><select data-count-reason="${l.id}"><option value="">Motif si écart</option>${cfg.reasons.map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select><input data-count-note="${l.id}" placeholder="Note"><button class="btn ${recount?'brand':'soft'}" data-count-line="${l.id}" data-recount="${recount?'1':'0'}">${recount?'Valider recomptage':'Valider comptage'}</button></div>`}
function bindInventory(){
 $('#createInventory')?.addEventListener('click',createSession);
 $('#saveInventoryPolicy')?.addEventListener('click',savePolicy);
 document.querySelectorAll('[data-add-inv-line]').forEach(b=>b.addEventListener('click',()=>addLine(b.dataset.addInvLine)));
 document.querySelectorAll('[data-count-line]').forEach(b=>b.addEventListener('click',()=>countLine(b)));
 document.querySelectorAll('[data-finalize-inventory]').forEach(b=>b.addEventListener('click',()=>finalize(b.dataset.finalizeInventory)));
 document.querySelectorAll('[data-post-inventory]').forEach(b=>b.addEventListener('click',()=>postInventory(b.dataset.postInventory)));
}
async function createSession(){try{const payload={type:$('#invType').value,zone:$('#invZone').value.trim(),comment:$('#invComment').value.trim()};await api(`/api/stores/${app.storeId}/inventory`,{method:'POST',body:JSON.stringify(payload)});toast('Inventaire démarré.');await renderInventory()}catch(e){toast(e.message)}}
async function addLine(sessionId){try{const input=document.querySelector(`[data-inv-ean="${sessionId}"]`),ean=input.value.trim();if(!ean)throw new Error('Scanner ou saisir un EAN.');await api(`/api/inventory/${sessionId}/lines`,{method:'POST',body:JSON.stringify({ean})});toast('Article ajouté avec stock théorique Dynamics.');await renderInventory()}catch(e){toast(e.message)}}
async function countLine(btn){try{const id=btn.dataset.countLine,quantity=Number(document.querySelector(`[data-count-qty="${id}"]`).value),reasonCode=document.querySelector(`[data-count-reason="${id}"]`).value||null,note=document.querySelector(`[data-count-note="${id}"]`).value.trim();await api(`/api/inventory/lines/${id}/count`,{method:'POST',body:JSON.stringify({quantity,reasonCode,note,recount:btn.dataset.recount==='1'})});toast(btn.dataset.recount==='1'?'Recomptage enregistré.':'Comptage enregistré.');await renderInventory()}catch(e){toast(e.message)}}
async function finalize(id){try{const r=await api(`/api/inventory/${id}/finalize`,{method:'POST'});toast(r.highVarianceLines?.length?`Inventaire validé · ${r.highVarianceLines.length} écart(s) escaladé(s) en incident Stock.`:'Inventaire validé, prêt à poster.');await renderInventory()}catch(e){toast(e.message)}}
async function postInventory(id){try{const r=await api(`/api/inventory/${id}/post`,{method:'POST'});toast(r.dynamics?.simulated?'Ajustement Dynamics simulé et inventaire clôturé.':'Ajustement Dynamics posté.');await renderInventory()}catch(e){toast(e.message)}}
async function savePolicy(){try{await api('/api/inventory/policy',{method:'PUT',body:JSON.stringify({recountThreshold:Number($('#invRecountThreshold').value),incidentThreshold:Number($('#invIncidentThreshold').value)})});toast('Politique inventaire réseau mise à jour.');await renderInventory()}catch(e){toast(e.message)}}

import{api}from'../api.js';
import{app,canManage,isDirector}from'../state.js';
import{$,status,esc,toast}from'../ui.js';
import{DEFAULT_INVENTORY_COUNTING_POLICY,inventoryLinePresentation}from'../inventory-privacy.js';

let cfg=null,data=null;
const countingPolicy=()=>({...DEFAULT_INVENTORY_COUNTING_POLICY,...(cfg?.countingPolicy||{})});
const reasonLabel=code=>cfg?.reasons?.find(x=>x.code===code)?.label||code||'—';
const sessionLabel=x=>({CYCLE:'Inventaire tournant',TARGETED:'Inventaire ciblé',FULL:'Inventaire complet'}[x]||x);
const sessionStatus=x=>({COUNTING:'Comptage',REVIEW:'Revue',READY_TO_POST:'Prêt à poster',POSTED:'Posté',CANCELLED:'Annulé'}[x]||x);
const statusKind=x=>x==='POSTED'?'ok':x==='READY_TO_POST'?'warn':x==='CANCELLED'?'neutral':'neutral';
const dt=v=>v?new Date(String(v).replace(' ','T')+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const lineById=id=>(data?.items||[]).flatMap(x=>x.lines||[]).find(x=>x.id===id)||null;

export async function renderInventory(){
  cfg=await api('/api/inventory/config');
  data=await api(`/api/stores/${app.storeId}/inventory?status=ALL`);
  const s=data.summary||{},items=data.items||[],policy=countingPolicy();
  $('#inventoryContent').innerHTML=`
    ${policy.blindFirstCount?`<div class="banner ban-info inventory-blind-banner"><strong>Comptage aveugle actif</strong><div class="small">Le stock théorique Dynamics est masqué pendant le premier comptage${policy.blindRecount?' et pendant le recomptage':''}. Il n’est révélé qu’après validation pour réduire le biais de comptage.</div></div>`:''}
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
    <div class="network-section-title"><div><strong>Sessions d’inventaire</strong><span>Le stock théorique vient de Dynamics et reste figé dans le snapshot de session, mais il est masqué au compteur tant que le comptage n’est pas validé.</span></div><span class="pill">${items.length}</span></div>
    <div class="inventory-session-list">${items.length?items.map(sessionCard).join(''):'<div class="card empty">Aucun inventaire enregistré.</div>'}</div>
  `;
  bindInventory();
}

function kpi(label,value,sub,type=''){return`<div class="card ${type==='warn'?'inventory-kpi-warn':''}"><div class="label">${esc(label)}</div><div class="kpi">${value}</div><div class="small muted">${esc(sub)}</div></div>`}
function conceptCard(){return`<div class="card"><div class="label">Règle de contrôle</div><strong>Écart ≥ ${cfg.policy.recount_qty_threshold} → recomptage</strong><div class="small muted" style="margin-top:5px">Écart ≥ ${cfg.policy.incident_qty_threshold} → incident Stock avec preuve. Le comptage reste aveugle jusqu’à validation.</div></div>`}
function policyCard(){return`<div class="card inventory-policy"><div class="label">Politique réseau</div><div class="form-grid" style="margin-top:8px"><div class="field"><label>Recomptage dès écart ≥</label><input id="invRecountThreshold" type="number" min="0" step="0.01" value="${cfg.policy.recount_qty_threshold}"></div><div class="field"><label>Incident dès écart ≥</label><input id="invIncidentThreshold" type="number" min="0" step="0.01" value="${cfg.policy.incident_qty_threshold}"></div></div><div class="small muted" style="margin:8px 0">Comptage aveugle activé pour limiter le biais du stock système. Si possible, faire réaliser le recomptage par une autre personne.</div><button class="btn soft" id="saveInventoryPolicy">Enregistrer la politique</button></div>`}
function createPanel(){return`<div class="card inventory-create" style="margin-top:14px"><div class="row"><div><strong>Lancer un inventaire</strong><div class="small muted">Le stock théorique est figé au scan mais reste invisible pendant le comptage.</div></div><span class="pill">Responsable / Direction</span></div><div class="form-grid" style="margin-top:10px"><div class="field"><label>Type</label><select id="invType">${cfg.types.map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select></div><div class="field"><label>Zone / périmètre</label><input id="invZone" placeholder="Ex. PLS, Réserve, Allée 3"></div><div class="field full"><label>Commentaire</label><input id="invComment" placeholder="Objectif du comptage / anomalie déclencheuse"></div></div><button class="btn brand" id="createInventory" style="margin-top:10px">Démarrer l’inventaire</button></div>`}

function sessionCard(inv){
 const editable=canManage()&&['COUNTING','REVIEW'].includes(inv.status),ready=inv.status==='READY_TO_POST',pending=Number(inv.metrics?.pending||0),pct=inv.metrics?.lines?Math.round((Number(inv.metrics.counted||0)/Number(inv.metrics.lines))*100):0;
 return`<article class="card inventory-session ${ready?'inventory-ready':''}">
   <div class="row"><div><div class="small muted">${sessionLabel(inv.inventory_type)} · ${esc(inv.zone||'Périmètre non précisé')}</div><h3>${esc(inv.id)}</h3><div class="small muted">Créé par ${esc(inv.created_by_name||'—')} · ${dt(inv.created_at)}</div></div>${status(sessionStatus(inv.status),statusKind(inv.status))}</div>
   <div class="inventory-session-kpis"><div><span>Articles</span><strong>${inv.metrics.lines}</strong></div><div><span>Comptés</span><strong>${inv.metrics.counted}</strong></div><div><span>Recomptages</span><strong>${inv.metrics.recounts}</strong></div><div><span>Écart abs.</span><strong>${inv.metrics.absoluteVarianceQty}</strong></div></div>
   ${editable&&inv.metrics.lines?`<div class="small muted inventory-progress-line">Progression ${pct}% · ${pending} ligne(s) restante(s)</div>`:''}
   ${editable?addLinePanel(inv):''}
   <div class="table-wrap inventory-table-wrap" style="margin-top:10px"><table class="table inventory-table"><thead><tr><th>Article</th><th>Théorique</th><th>1er comptage</th><th>Écart</th><th>Recomptage / final</th><th>Motif</th><th>Action</th></tr></thead><tbody>${inv.lines.map(lineRow).join('')||'<tr><td colspan="7"><div class="empty compact">Aucun article. Scanne un EAN pour commencer.</div></td></tr>'}</tbody></table></div>
   <div class="inventory-footer">
     <div class="small muted">${inv.status==='POSTED'?`Posté par ${esc(inv.posted_by_name||'—')} · ${dt(inv.posted_at)}`:inv.status==='READY_TO_POST'?`Validé par ${esc(inv.reviewed_by_name||'—')} · ${dt(inv.reviewed_at)}`:pending?`${pending} ligne(s) restent à compter ou recomptabiliser.`:'Tous les écarts sont comptés ; valide la session pour préparer le posting.'}</div>
     <div class="row">${editable?`<button class="btn brand" data-finalize-inventory="${inv.id}" ${!inv.lines.length||pending?'disabled':''}>Valider le comptage</button>`:''}${ready&&canManage()?`<button class="btn brand" data-post-inventory="${inv.id}">Poster l’ajustement Dynamics</button>`:''}</div>
   </div>
 </article>`}
function addLinePanel(inv){return`<div class="inventory-add-line"><div><strong>Ajouter un article</strong><div class="small muted">EAN scanné → snapshot Dynamics enregistré, quantité système masquée au compteur.</div></div><div class="row"><input data-inv-ean="${inv.id}" inputmode="numeric" autocomplete="off" placeholder="Scanner / saisir EAN"><button class="btn soft" data-add-inv-line="${inv.id}">Ajouter</button></div></div>`}
function hiddenValue(label='Masqué'){return`<span class="inventory-hidden" title="Comptage aveugle">${esc(label)}</span>`}
function lineRow(l){
 const view=inventoryLinePresentation(l,countingPolicy()),variance=view.variance,varianceClass=variance==null||Number(variance)===0?'':'inventory-variance';
 const action=l.status==='TO_COUNT'?countForm(l,false,view):l.status==='RECOUNT'?countForm(l,true,view):status('Compté','ok');
 const theoretical=view.blind?hiddenValue():`<strong>${view.theoretical}</strong>`;
 const count1=view.blind?hiddenValue(view.blind==='RECOUNT'?'1er comptage masqué':'—'):`${view.count1??'—'}<div class="small muted">${view.count1By?esc(view.count1By):''}</div>`;
 const varianceHtml=view.blind?hiddenValue():`${variance??'—'}`;
 const finalHtml=view.blind?(l.status==='RECOUNT'?hiddenValue('À recompter'):'—'):`${view.final??'—'}${l.requires_recount?'<div class="small danger-text">Recomptage obligatoire</div>':''}`;
 const reasonHtml=view.showReason?`${esc(reasonLabel(l.reason_code))}${l.note?`<div class="small muted">${esc(l.note)}</div>`:''}`:hiddenValue();
 return`<tr class="inventory-line-row ${view.blind?'inventory-line-blind':''}"><td data-label="Article"><strong>${esc(l.product_name)}</strong><div class="small muted">${esc(l.ean)}${l.product_number?' · '+esc(l.product_number):''}</div>${view.message?`<div class="small inventory-blind-note">${esc(view.message)}</div>`:''}</td><td data-label="Théorique">${theoretical}</td><td data-label="1er comptage">${count1}</td><td data-label="Écart" class="${varianceClass}">${varianceHtml}</td><td data-label="Recomptage / final">${finalHtml}</td><td data-label="Motif">${reasonHtml}</td><td data-label="Action">${action}</td></tr>`}
function countForm(l,recount,view){
 const helper=recount?(countingPolicy().recountDifferentCounterRecommended?'Recompter physiquement sans consulter le 1er résultat. Si possible, faire recompter par une autre personne.':'Recompter physiquement sans consulter le 1er résultat.'):'Compter physiquement avant de valider. Le stock système reste masqué.';
 return`<div class="inventory-count-form"><div class="small muted inventory-count-helper">${esc(helper)}</div><input data-count-qty="${l.id}" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Quantité physique"><select data-count-reason="${l.id}"><option value="">Motif si écart</option>${cfg.reasons.map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select><input data-count-note="${l.id}" placeholder="Note"><button class="btn ${recount?'brand':'soft'}" data-count-line="${l.id}" data-recount="${recount?'1':'0'}">${recount?'Valider recomptage':'Valider comptage'}</button></div>`}
function bindInventory(){
 $('#createInventory')?.addEventListener('click',createSession);
 $('#saveInventoryPolicy')?.addEventListener('click',savePolicy);
 document.querySelectorAll('[data-add-inv-line]').forEach(b=>b.addEventListener('click',()=>addLine(b.dataset.addInvLine)));
 document.querySelectorAll('[data-inv-ean]').forEach(input=>input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addLine(input.dataset.invEan)}}));
 document.querySelectorAll('[data-count-line]').forEach(b=>b.addEventListener('click',()=>countLine(b)));
 document.querySelectorAll('[data-count-qty]').forEach(input=>input.addEventListener('keydown',e=>{if(e.key==='Enter'){const b=document.querySelector(`[data-count-line="${input.dataset.countQty}"]`);if(b)countLine(b)}}));
 document.querySelectorAll('[data-finalize-inventory]').forEach(b=>b.addEventListener('click',()=>finalize(b.dataset.finalizeInventory,b)));
 document.querySelectorAll('[data-post-inventory]').forEach(b=>b.addEventListener('click',()=>postInventory(b.dataset.postInventory,b)));
}
async function createSession(){const b=$('#createInventory');if(b?.disabled)return;try{if(b)b.disabled=true;const payload={type:$('#invType').value,zone:$('#invZone').value.trim(),comment:$('#invComment').value.trim()};await api(`/api/stores/${app.storeId}/inventory`,{method:'POST',body:JSON.stringify(payload)});toast('Inventaire démarré.');await renderInventory()}catch(e){toast(e.message)}finally{if(b)b.disabled=false}}
async function addLine(sessionId){const btn=document.querySelector(`[data-add-inv-line="${sessionId}"]`);if(btn?.disabled)return;try{if(btn)btn.disabled=true;const input=document.querySelector(`[data-inv-ean="${sessionId}"]`),ean=input.value.trim();if(!ean)throw new Error('Scanner ou saisir un EAN.');await api(`/api/inventory/${sessionId}/lines`,{method:'POST',body:JSON.stringify({ean})});toast('Article ajouté. Le stock Dynamics reste masqué pendant le comptage.');await renderInventory()}catch(e){toast(e.message)}finally{if(btn)btn.disabled=false}}
async function countLine(btn){if(btn?.disabled)return;try{
 const id=btn.dataset.countLine,input=document.querySelector(`[data-count-qty="${id}"]`),raw=input?.value;
 if(raw==null||String(raw).trim()==='')throw new Error('Saisis la quantité physique comptée.');
 const quantity=Number(raw);if(!Number.isFinite(quantity)||quantity<0)throw new Error('Quantité physique invalide.');
 const reasonEl=document.querySelector(`[data-count-reason="${id}"]`),noteEl=document.querySelector(`[data-count-note="${id}"]`),reasonCode=reasonEl?.value||null,note=noteEl?.value.trim()||'',line=lineById(id),recount=btn.dataset.recount==='1';
 if(line&&Number.isFinite(Number(line.theoretical_qty))){const variance=quantity-Number(line.theoretical_qty),needsRecount=Math.abs(variance)>=Number(cfg.policy.recount_qty_threshold);if(variance!==0&&((recount)||(!needsRecount))&&!reasonCode)throw new Error('Écart détecté après saisie : sélectionne un motif avant de valider. Le stock système reste masqué.');}
 btn.disabled=true;btn.textContent=recount?'Recomptage…':'Enregistrement…';
 await api(`/api/inventory/lines/${id}/count`,{method:'POST',body:JSON.stringify({quantity,reasonCode,note,recount})});toast(recount?'Recomptage enregistré. Écart final maintenant révélé.':'Comptage enregistré.');await renderInventory();
 }catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent=btn.dataset.recount==='1'?'Valider recomptage':'Valider comptage'}}}
async function finalize(id,btn){if(btn?.disabled)return;try{if(btn){btn.disabled=true;btn.textContent='Validation…'}const r=await api(`/api/inventory/${id}/finalize`,{method:'POST'});toast(r.highVarianceLines?.length?`Inventaire validé · ${r.highVarianceLines.length} écart(s) escaladé(s) en incident Stock.`:'Inventaire validé, prêt à poster.');await renderInventory()}catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent='Valider le comptage'}}}
async function postInventory(id,btn){if(btn?.disabled)return;try{if(btn){btn.disabled=true;btn.textContent='Posting…'}const r=await api(`/api/inventory/${id}/post`,{method:'POST'});toast(r.dynamics?.simulated?'Ajustement Dynamics simulé et inventaire clôturé.':'Ajustement Dynamics posté.');await renderInventory()}catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent='Poster l’ajustement Dynamics'}}}
async function savePolicy(){try{await api('/api/inventory/policy',{method:'PUT',body:JSON.stringify({recountThreshold:Number($('#invRecountThreshold').value),incidentThreshold:Number($('#invIncidentThreshold').value)})});toast('Politique inventaire réseau mise à jour.');await renderInventory()}catch(e){toast(e.message)}}

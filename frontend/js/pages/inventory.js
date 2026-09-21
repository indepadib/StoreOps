import{api}from'../api.js';
import{app,canManage,isDirector}from'../state.js';
import{$,status,esc,toast}from'../ui.js';
import{DEFAULT_INVENTORY_COUNTING_POLICY,inventoryLinePresentation}from'../inventory-privacy.js';

let cfg=null,data=null,quickProduct=null;
const countingPolicy=()=>({...DEFAULT_INVENTORY_COUNTING_POLICY,...(cfg?.countingPolicy||{})});
const reasonLabel=code=>cfg?.reasons?.find(x=>x.code===code)?.label||code||'—';
const sessionLabel=x=>({CYCLE:'Inventaire tournant',TARGETED:'Inventaire ciblé',FULL:'Inventaire complet'}[x]||x);
const sessionStatus=x=>({COUNTING:'Comptage',REVIEW:'Revue',READY_TO_POST:'Prêt à exporter',POSTED:'Traité',CANCELLED:'Annulé'}[x]||x);
const statusKind=x=>x==='POSTED'?'ok':x==='READY_TO_POST'?'warn':x==='CANCELLED'?'neutral':'neutral';
const dt=v=>v?new Date(String(v).replace(' ','T')+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const lineById=id=>(data?.items||[]).flatMap(x=>x.lines||[]).find(x=>x.id===id)||null;
const isExpress=x=>x?.inventory_type==='TARGETED'&&x?.zone==='Express';
const activeExpress=items=>(items||[]).find(x=>isExpress(x)&&['COUNTING','REVIEW'].includes(x.status))||null;
const unitOf=x=>String(x?.stock_unit||x?.inventoryUnit||'').trim();
const qtyWithUnit=(v,u)=>String(v??'—')+(u?' '+esc(u):'');

export async function renderInventory(){
  [cfg,data]=await Promise.all([api('/api/inventory/config'),api(`/api/stores/${app.storeId}/inventory?status=ALL`)]);
  const s=data.summary||{},items=data.items||[],express=activeExpress(items),policy=countingPolicy();
  $('#inventoryContent').innerHTML=`
    ${canManage()?quickPanel(express):'<div class="banner ban-info"><strong>Lecture seule.</strong><span>Le comptage est réservé au Responsable magasin et à la Direction.</span></div>'}
    <div class="inventory-overview">
      ${miniKpi('Ouverts',s.openSessions||0)}
      ${miniKpi('À recompter',s.pendingRecounts||0,s.pendingRecounts?'warn':'')}
      ${miniKpi('Écarts',s.varianceLines||0,s.varianceLines?'warn':'')}
      ${miniKpi('Prêts export',s.readyToPost||0)}
    </div>
    <details class="card inventory-advanced" ${items.some(x=>x.status==='READY_TO_POST')?'open':''}>
      <summary><div><strong>Détails & inventaires avancés</strong><span>Sessions, inventaire complet, politique et export Excel.</span></div><b>⌄</b></summary>
      <div class="inventory-advanced-body">
        ${policy.blindFirstCount?'<div class="banner ban-info"><strong>Comptage aveugle actif</strong><span>Le stock théorique Dynamics reste masqué pendant le comptage pour éviter le biais.</span></div>':''}
        <div class="grid g2" style="margin-top:12px">${isDirector()?policyCard():conceptCard()}<div class="card"><div class="label">Unités de comptage</div><div class="kpi">${s.varianceLines||0}</div><div class="small muted">ligne(s) avec écart · g, kg et pièces ne sont jamais additionnés ensemble</div></div></div>
        ${canManage()?createPanel():''}
        <div class="network-section-title"><div><strong>Sessions d’inventaire</strong><span>Traçabilité complète des comptages, écarts et validations.</span></div><span class="pill">${items.length}</span></div>
        <div class="inventory-session-list">${items.length?items.map(sessionCard).join(''):'<div class="card empty">Aucun inventaire enregistré.</div>'}</div>
      </div>
    </details>
  `;
  bindInventory();
  setTimeout(()=>{let prefill='';try{prefill=sessionStorage.getItem('storeops_express_prefill_ean')||'';sessionStorage.removeItem('storeops_express_prefill_ean')}catch{}const ean=$('#invQuickEan');if(ean&&prefill){ean.value=prefill;$('#invQuickQty')?.focus?.()}else{const target=$('#invQuickReasonExplain')||$('#invQuickRecountQty')||ean;target?.focus?.()}},80);
}

function miniKpi(label,value,type=''){return`<div class="inventory-mini-kpi ${type}"><span>${esc(label)}</span><strong>${value}</strong></div>`}
function quickPanel(express){
  const recount=express?.lines?.find(x=>x.status==='RECOUNT')||null,explain=express?.lines?.find(x=>x.status==='COUNTED'&&Number(x.final_variance)!==0&&!x.reason_code)||null;
  const metrics=express?.metrics||{lines:0,counted:0,pending:0,recounts:0,unexplained:0};
  if(recount)return`<section class="card inventory-express inventory-express-recount">
    <div class="inventory-express-head"><div><span class="manager-eyebrow">INVENTAIRE EXPRESS</span><h2>Recompter ${esc(recount.product_name)}</h2><p>Un écart important a été détecté. Recomptez physiquement sans consulter le stock système.</p></div><span class="pill">EAN ${esc(recount.ean)}</span></div>
    <div class="inventory-express-grid">
      <label><span>Quantité recomptée${unitOf(recount)?` (${esc(unitOf(recount))})`:``}</span><input id="invQuickRecountQty" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"></label>
    </div>
    <button class="btn brand inventory-primary-cta" id="invQuickCount" data-ean="${esc(recount.ean)}">Valider le recomptage</button>
    <div class="inventory-express-progress"><span>${metrics.counted}/${metrics.lines} article(s) compté(s)</span><span>${metrics.recounts} recomptage(s) en attente</span></div>
  </section>`;

  if(explain)return`<section class="card inventory-express inventory-express-recount">
    <div class="inventory-express-head"><div><span class="manager-eyebrow">ÉCART À EXPLIQUER</span><h2>${esc(explain.product_name)}</h2><p>Le comptage est terminé. StoreOps révèle maintenant l’écart : choisis simplement sa cause.</p></div><span class="pill">${Number(explain.final_variance)>0?'+':''}${explain.final_variance}</span></div>
    <div class="inventory-session-kpis"><div><span>Théorique</span><strong>${qtyWithUnit(explain.theoretical_qty,unitOf(explain))}</strong></div><div><span>Compté</span><strong>${qtyWithUnit(explain.final_qty,unitOf(explain))}</strong></div><div><span>Écart</span><strong>${qtyWithUnit(explain.final_variance,unitOf(explain))}</strong></div></div>
    <div class="inventory-express-grid" style="margin-top:12px"><label><span>Motif de l’écart *</span><select id="invQuickReasonExplain"><option value="">Choisir le motif</option>${cfg.reasons.map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select></label><label><span>Commentaire</span><input id="invQuickReasonNote" placeholder="Précision facultative"></label></div>
    <button class="btn brand inventory-primary-cta" id="invQuickExplain" data-line="${esc(explain.id)}">Valider le motif & continuer</button>
  </section>`;

  return`<section class="card inventory-express">
    <div class="inventory-express-head"><div><span class="manager-eyebrow">INVENTAIRE EXPRESS</span><h2>Scanner, compter, continuer.</h2><p>Pas de session à préparer : StoreOps crée automatiquement l’inventaire terrain et masque le stock théorique.</p></div>${express?status('En cours','ok'):'<span class="pill">Prêt à scanner</span>'}</div>
    <div class="inventory-express-grid inventory-express-scan">
      <label class="inventory-ean-field"><span>1 · Scanner l’article</span><input id="invQuickEan" inputmode="numeric" autocomplete="off" placeholder="Scanner ou saisir l’EAN"><small id="invQuickProduct" class="muted">L’article et son unité de stock seront identifiés avant le comptage.</small></label>
      <label><span id="invQuickQtyLabel">2 · Quantité physique</span><input id="invQuickQty" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0"></label>
    </div>
    <button class="btn brand inventory-primary-cta" id="invQuickCount">Valider & article suivant</button>
    <div class="inventory-express-progress"><span>${express?`${metrics.counted}/${metrics.lines} article(s) finalisé(s)`:'Le premier scan démarre automatiquement la session.'}</span>${express&&metrics.lines&&metrics.pending===0&&!metrics.unexplained?`<button class="btn soft" id="invQuickFinish" data-session="${esc(express.id)}">Terminer l’inventaire</button>`:''}</div>
  </section>`
}

function conceptCard(){return`<div class="card"><div class="label">Règle de contrôle</div><strong>Écart ≥ ${cfg.policy.recount_qty_threshold} → recomptage</strong><div class="small muted" style="margin-top:5px">Écart ≥ ${cfg.policy.incident_qty_threshold} → incident Stock avec preuve. Le comptage reste aveugle jusqu’à validation.</div></div>`}
function policyCard(){return`<div class="card inventory-policy"><div class="label">Politique réseau</div><div class="form-grid" style="margin-top:8px"><div class="field"><label>Recomptage dès écart ≥</label><input id="invRecountThreshold" type="number" min="0" step="0.01" value="${cfg.policy.recount_qty_threshold}"></div><div class="field"><label>Incident dès écart ≥</label><input id="invIncidentThreshold" type="number" min="0" step="0.01" value="${cfg.policy.incident_qty_threshold}"></div></div><div class="small muted" style="margin:8px 0">Comptage aveugle activé. Si possible, faire réaliser le recomptage par une autre personne.</div><button class="btn soft" id="saveInventoryPolicy">Enregistrer la politique</button></div>`}
function createPanel(){return`<div class="card inventory-create" style="margin-top:14px"><div class="row"><div><strong>Inventaire avancé</strong><div class="small muted">Pour un inventaire complet, tournant ou sur une zone précise.</div></div><span class="pill">Optionnel</span></div><div class="form-grid" style="margin-top:10px"><div class="field"><label>Type</label><select id="invType">${cfg.types.map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select></div><div class="field"><label>Zone / périmètre</label><input id="invZone" placeholder="Ex. PLS, Réserve, Allée 3"></div><div class="field full"><label>Commentaire</label><input id="invComment" placeholder="Objectif du comptage / anomalie déclencheuse"></div></div><button class="btn soft" id="createInventory" style="margin-top:10px">Créer l’inventaire avancé</button></div>`}

function sessionCard(inv){
 const editable=canManage()&&['COUNTING','REVIEW'].includes(inv.status),ready=inv.status==='READY_TO_POST',pending=Number(inv.metrics?.pending||0),unexplained=Number(inv.metrics?.unexplained||0),blocking=pending+unexplained,pct=inv.metrics?.lines?Math.round((Number(inv.metrics.counted||0)/Number(inv.metrics.lines))*100):0;
 return`<article class="card inventory-session ${ready?'inventory-ready':''}">
   <div class="row"><div><div class="small muted">${isExpress(inv)?'Inventaire express':sessionLabel(inv.inventory_type)} · ${esc(inv.zone||'Périmètre non précisé')}</div><h3>${esc(inv.id)}</h3><div class="small muted">Créé par ${esc(inv.created_by_name||'—')} · ${dt(inv.created_at)}</div></div>${status(sessionStatus(inv.status),statusKind(inv.status))}</div>
   <div class="inventory-session-kpis"><div><span>Articles</span><strong>${inv.metrics.lines}</strong></div><div><span>Comptés</span><strong>${inv.metrics.counted}</strong></div><div><span>Recomptages</span><strong>${inv.metrics.recounts}</strong></div><div><span>Lignes en écart</span><strong>${inv.metrics.varianceLines}</strong></div></div>
   ${editable&&inv.metrics.lines?`<div class="small muted inventory-progress-line">Progression ${pct}% · ${pending} à compter · ${unexplained} écart(s) à expliquer</div>`:''}
   ${editable&&!isExpress(inv)?addLinePanel(inv):''}
   <div class="table-wrap inventory-table-wrap" style="margin-top:10px"><table class="table inventory-table"><thead><tr><th>Article</th><th>Théorique</th><th>1er comptage</th><th>Écart</th><th>Recomptage / final</th><th>Motif</th><th>Action</th></tr></thead><tbody>${inv.lines.map(lineRow).join('')||'<tr><td colspan="7"><div class="empty compact">Aucun article.</div></td></tr>'}</tbody></table></div>
   <div class="inventory-footer"><div class="small muted">${inv.status==='POSTED'?`Traité · ${dt(inv.posted_at)}`:inv.status==='READY_TO_POST'?`Validé par ${esc(inv.reviewed_by_name||'—')} · ${dt(inv.reviewed_at)} · prêt pour Excel`:pending?`${pending} ligne(s) restent à compter ou recomptabiliser.`:'Tous les écarts sont comptés.'}</div>
   <div class="row">${editable?`<button class="btn soft" data-finalize-inventory="${inv.id}" ${!inv.lines.length||blocking?'disabled':''}>Valider la session</button>`:''}${ready&&canManage()?`<button class="btn brand" data-export-inventory="${inv.id}">Exporter Excel</button>`:''}</div></div>
 </article>`}
function addLinePanel(inv){return`<div class="inventory-add-line"><div><strong>Ajouter un article</strong><div class="small muted">EAN scanné → snapshot Dynamics enregistré.</div></div><div class="row"><input data-inv-ean="${inv.id}" inputmode="numeric" autocomplete="off" placeholder="Scanner / saisir EAN"><button class="btn soft" data-add-inv-line="${inv.id}">Ajouter</button></div></div>`}
function hiddenValue(label='Masqué'){return`<span class="inventory-hidden" title="Comptage aveugle">${esc(label)}</span>`}
function lineRow(l){
 const view=inventoryLinePresentation(l,countingPolicy()),variance=view.variance,varianceClass=variance==null||Number(variance)===0?'':'inventory-variance';
 const action=l.status==='TO_COUNT'?countForm(l,false):l.status==='RECOUNT'?countForm(l,true):(Number(l.final_variance)!==0&&!l.reason_code?explainForm(l):status('Compté','ok'));
 const theoretical=view.blind?hiddenValue():`<strong>${view.theoretical}</strong>`;
 const count1=view.blind?hiddenValue(view.blind==='RECOUNT'?'1er comptage masqué':'—'):`${view.count1??'—'}<div class="small muted">${view.count1By?esc(view.count1By):''}</div>`;
 const varianceHtml=view.blind?hiddenValue():`${variance??'—'}`;
 const finalHtml=view.blind?(l.status==='RECOUNT'?hiddenValue('À recompter'):'—'):`${view.final??'—'}${l.requires_recount?'<div class="small danger-text">Recomptage obligatoire</div>':''}`;
 const reasonHtml=view.showReason?`${esc(reasonLabel(l.reason_code))}${l.note?`<div class="small muted">${esc(l.note)}</div>`:''}`:hiddenValue();
 return`<tr class="inventory-line-row ${view.blind?'inventory-line-blind':''}"><td data-label="Article"><strong>${esc(l.product_name)}</strong><div class="small muted">${esc(l.ean)}${l.product_number?' · '+esc(l.product_number):''}</div></td><td data-label="Théorique">${theoretical}</td><td data-label="1er comptage">${count1}</td><td data-label="Écart" class="${varianceClass}">${varianceHtml}</td><td data-label="Recomptage / final">${finalHtml}</td><td data-label="Motif">${reasonHtml}</td><td data-label="Action">${action}</td></tr>`}
function countForm(l,recount){return`<div class="inventory-count-form"><input data-count-qty="${l.id}" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Quantité"><button class="btn ${recount?'brand':'soft'}" data-count-line="${l.id}" data-recount="${recount?'1':'0'}">${recount?'Valider recomptage':'Valider'}</button></div>`}
function explainForm(l){return`<div class="inventory-count-form"><select data-explain-reason="${l.id}"><option value="">Expliquer l’écart</option>${cfg.reasons.map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('')}</select><button class="btn soft" data-explain-line="${l.id}">Valider motif</button></div>`}

function bindInventory(){
 $('#invQuickEan')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#invQuickQty')?.focus()}});
 $('#invQuickQty')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();quickCount()}});
 $('#invQuickRecountQty')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();quickCount()}});
 $('#invQuickCount')?.addEventListener('click',quickCount);
 $('#invQuickExplain')?.addEventListener('click',quickExplain);
 $('#invQuickFinish')?.addEventListener('click',e=>finalize(e.currentTarget.dataset.session,e.currentTarget,true));
 $('#createInventory')?.addEventListener('click',createSession);
 $('#saveInventoryPolicy')?.addEventListener('click',savePolicy);
 document.querySelectorAll('[data-add-inv-line]').forEach(b=>b.addEventListener('click',()=>addLine(b.dataset.addInvLine)));
 document.querySelectorAll('[data-inv-ean]').forEach(input=>input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addLine(input.dataset.invEan)}}));
 document.querySelectorAll('[data-count-line]').forEach(b=>b.addEventListener('click',()=>countLine(b)));
 document.querySelectorAll('[data-explain-line]').forEach(b=>b.addEventListener('click',()=>explainLine(b)));
 document.querySelectorAll('[data-finalize-inventory]').forEach(b=>b.addEventListener('click',()=>finalize(b.dataset.finalizeInventory,b)));
 document.querySelectorAll('[data-export-inventory]').forEach(b=>b.addEventListener('click',()=>exportInventory(b.dataset.exportInventory,b)));
}
async function quickCount(){
 const btn=$('#invQuickCount');if(btn?.disabled)return;
 try{
  const forced=btn?.dataset?.ean||'',ean=forced||$('#invQuickEan')?.value.trim(),qtyInput=$('#invQuickRecountQty')||$('#invQuickQty'),raw=qtyInput?.value;
  if(!ean)throw new Error('Scanne ou saisis l’EAN.');
  if(raw==null||String(raw).trim()==='')throw new Error('Saisis la quantité physique comptée.');
  const quantity=Number(raw);if(!Number.isFinite(quantity)||quantity<0)throw new Error('Quantité invalide.');
  btn.disabled=true;btn.textContent=forced?'Validation du recomptage…':'Enregistrement…';
  const result=await api(`/api/stores/${app.storeId}/inventory/express/count`,{method:'POST',body:JSON.stringify({ean,quantity})});
  toast(result.step==='RECOUNT_REQUIRED'?'Écart détecté : recompte sans voir le théorique.':result.step==='REASON_REQUIRED'?'Écart détecté : indique maintenant la cause.':'Comptage conforme. Scanne l’article suivant.');
  await renderInventory();
 }catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent=btn.dataset.ean?'Valider le recomptage':'Valider & article suivant'}}
}
async function quickExplain(){const btn=$('#invQuickExplain');if(btn?.disabled)return;try{const lineId=btn.dataset.line,reasonCode=$('#invQuickReasonExplain')?.value||'',note=$('#invQuickReasonNote')?.value.trim()||'';if(!reasonCode)throw new Error('Choisis le motif de l’écart.');btn.disabled=true;await api(`/api/inventory/lines/${lineId}/explain`,{method:'POST',body:JSON.stringify({reasonCode,note})});toast('Écart expliqué. Tu peux continuer le comptage.');await renderInventory()}catch(e){toast(e.message);if(btn)btn.disabled=false}}
async function createSession(){const b=$('#createInventory');if(b?.disabled)return;try{if(b)b.disabled=true;await api(`/api/stores/${app.storeId}/inventory`,{method:'POST',body:JSON.stringify({type:$('#invType').value,zone:$('#invZone').value.trim(),comment:$('#invComment').value.trim()})});toast('Inventaire avancé créé.');await renderInventory()}catch(e){toast(e.message)}finally{if(b)b.disabled=false}}
async function addLine(sessionId){const btn=document.querySelector(`[data-add-inv-line="${sessionId}"]`);if(btn?.disabled)return;try{if(btn)btn.disabled=true;const input=document.querySelector(`[data-inv-ean="${sessionId}"]`),ean=input.value.trim();if(!ean)throw new Error('Scanner ou saisir un EAN.');await api(`/api/inventory/${sessionId}/lines`,{method:'POST',body:JSON.stringify({ean})});toast('Article ajouté.');await renderInventory()}catch(e){toast(e.message)}finally{if(btn)btn.disabled=false}}
async function countLine(btn){if(btn?.disabled)return;try{const id=btn.dataset.countLine,input=document.querySelector(`[data-count-qty="${id}"]`),raw=input?.value;if(raw==null||String(raw).trim()==='')throw new Error('Saisis la quantité physique comptée.');const quantity=Number(raw);if(!Number.isFinite(quantity)||quantity<0)throw new Error('Quantité physique invalide.');btn.disabled=true;await api(`/api/inventory/lines/${id}/count`,{method:'POST',body:JSON.stringify({quantity,recount:btn.dataset.recount==='1'})});toast('Comptage enregistré.');await renderInventory()}catch(e){toast(e.message);btn.disabled=false}}
async function explainLine(btn){if(btn?.disabled)return;try{const id=btn.dataset.explainLine,reasonCode=document.querySelector(`[data-explain-reason="${id}"]`)?.value||'';if(!reasonCode)throw new Error('Choisis le motif de l’écart.');btn.disabled=true;await api(`/api/inventory/lines/${id}/explain`,{method:'POST',body:JSON.stringify({reasonCode})});toast('Écart expliqué.');await renderInventory()}catch(e){toast(e.message);btn.disabled=false}}
async function finalize(id,btn,express=false){if(btn?.disabled)return;try{if(btn){btn.disabled=true;btn.textContent='Validation…'}const r=await api(`/api/inventory/${id}/finalize`,{method:'POST'});toast(r.highVarianceLines?.length?`Inventaire terminé · ${r.highVarianceLines.length} écart(s) à analyser avant export.`:'Inventaire terminé · export Excel disponible.');await renderInventory()}catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent=express?'Terminer l’inventaire':'Valider la session'}}}
function downloadExcel(file){const blob=new Blob([file.content],{type:file.mimeType||'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.fileName||'inventaire.xls';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function exportInventory(id,btn){if(btn?.disabled)return;try{btn.disabled=true;btn.textContent='Préparation Excel…';const r=await api(`/api/inventory/${id}/export-excel`,{method:'POST'});downloadExcel(r.file);toast(`Export Excel généré · ${Number(r.adjustmentLines||0)} ligne(s) d’ajustement · aucune écriture D365.`)}catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent='Exporter Excel'}}
async function savePolicy(){try{await api('/api/inventory/policy',{method:'PUT',body:JSON.stringify({recountThreshold:Number($('#invRecountThreshold').value),incidentThreshold:Number($('#invIncidentThreshold').value)})});toast('Politique inventaire mise à jour.');await renderInventory()}catch(e){toast(e.message)}}

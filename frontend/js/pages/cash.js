import{api}from'../api.js';
import{app,canManage,isDirector}from'../state.js';
import{$,status,esc,toast}from'../ui.js';

let cfg=null,payload=null,incidentMap=new Map();
const money=v=>Number(v||0).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2})+' DH';
const reasonLabel=code=>cfg?.reasons?.find(x=>x.code===code)?.label||code||'—';
const stateLabel=s=>({COUNTING:'Comptage',REVIEW:'Rapprochement',READY:'Validée',CLOSED:'Clôturée'}[s]||s);
const stateKind=s=>s==='CLOSED'?'ok':s==='READY'?'ok':s==='REVIEW'?'warn':'neutral';
const lineKind=s=>s==='COUNTED'?'ok':s==='RECOUNT'?'warn':'neutral';
const lineLabel=s=>({PENDING:'À compter',RECOUNT:'Recomptage',COUNTED:'Rapproché'}[s]||s);
const dt=v=>v?new Date(String(v).replace(' ','T')+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';

export async function renderCash(){
 cfg=await api('/api/cash/config');
 payload=await api(`/api/stores/${app.storeId}/cash-closing`);
 try{const inc=await api(`/api/stores/${app.storeId}/incidents?status=OPEN`);incidentMap=new Map((inc.items||[]).filter(x=>x.source_type==='CASH_SHIFT').map(x=>[x.source_id,x]))}catch{incidentMap=new Map()}
 const c=payload.closing,s=payload.summary||{};
 $('#cashContent').innerHTML=`
  ${payload.sync&&!payload.sync.ok?`<div class="banner ban-danger"><strong>Flux caisse Dynamics indisponible.</strong><div class="small">${esc(payload.sync.error||'Mapping requis')}</div></div>`:''}
  <div class="grid g4">
   ${kpi('CA Dynamics',c?.metrics?.expectedSales||0,'ventes attendues','money')}
   ${kpi('Espèces',c?.metrics?.expectedCash||0,`écart final ${money(c?.metrics?.cashVariance||0)}`,'money')}
   ${kpi('TPE',c?.metrics?.expectedCard||0,`écart final ${money(c?.metrics?.cardVariance||0)}`,'money')}
   ${kpi('Shifts à traiter',(s.pending||0)+(s.recounts||0),`${s.recounts||0} recomptage(s)`,s.recounts?'warn':'')}
  </div>
  <div class="card cash-summary" style="margin-top:14px">
   <div class="row"><div><strong>Clôture caisses & TPE</strong><div class="small muted">Les montants attendus viennent de Dynamics. StoreOps ne conserve que le contrôle terrain, les écarts et la justification.</div></div>${status(stateLabel(c?.status||'NOT_STARTED'),stateKind(c?.status))}</div>
   <div class="cash-rule-strip"><span>Tolérance <strong>${money(cfg.policy.tolerance_dh)}</strong></span><span>Recomptage dès <strong>${money(cfg.policy.recount_threshold_dh)}</strong></span><span>Preuve dès <strong>${money(cfg.policy.evidence_threshold_dh)}</strong></span></div>
   ${canManage()?`<button class="btn soft" id="syncCashBtn">Rafraîchir les shifts Dynamics</button>`:''}
  </div>
  ${c?`<div class="cash-shifts">${c.lines.map(shiftCard).join('')}</div>${closingFooter(c)}`:'<div class="card empty" style="margin-top:12px">Aucune clôture caisse disponible pour cette journée.</div>'}
  ${isDirector()?policyCard():''}`;
 bindCash();
}

function kpi(label,value,sub,type=''){return`<div class="card ${type==='warn'?'cash-kpi-warn':''}"><div class="label">${esc(label)}</div><div class="kpi">${type==='money'?money(value):value}</div><div class="small muted">${esc(sub)}</div></div>`}
function shiftCard(l){
 const inc=incidentMap.get(l.id),recount=l.status==='RECOUNT',editable=canManage()&&['COUNTING','REVIEW'].includes(payload.closing.status)&&l.status!=='COUNTED';
 const cashVar=l.final_cash_variance??l.cash_variance,cardVar=l.final_card_variance??l.card_variance;
 return`<article class="card cash-shift ${recount?'cash-recount':''} ${inc?'cash-incident':''}">
   <div class="row"><div><div class="small muted">${esc(l.till_code)} · ${esc(l.shift_id)}</div><h3>${esc(l.cashier_name||'Caissier non renseigné')}</h3></div><div class="row">${inc?status(inc.criticality,inc.criticality==='CRITICAL'?'danger':'warn'):''}${status(lineLabel(l.status),lineKind(l.status))}</div></div>
   <div class="cash-expected-grid">
    <div><span>CA attendu</span><strong>${money(l.expected_sales)}</strong></div>
    <div><span>Espèces attendues</span><strong>${money(l.expected_cash)}</strong></div>
    <div><span>TPE attendu</span><strong>${money(l.expected_card)}</strong></div>
    <div><span>Autres paiements</span><strong>${money(l.expected_other)}</strong></div>
   </div>
   ${l.declared_cash!=null?`<div class="cash-result-grid"><div><span>${recount?'1er comptage espèces':'Espèces finales'}</span><strong>${money(recount?l.declared_cash:l.final_cash)}</strong></div><div><span>${recount?'1re clôture TPE':'TPE final'}</span><strong>${money(recount?l.card_settlement:l.final_card)}</strong></div><div class="${Number(cashVar)?'variance':''}"><span>Écart espèces</span><strong>${money(cashVar||0)}</strong></div><div class="${Number(cardVar)?'variance':''}"><span>Écart TPE</span><strong>${money(cardVar||0)}</strong></div></div>`:''}
   ${l.reason_code?`<div class="cash-note"><span>Motif</span><strong>${esc(reasonLabel(l.reason_code))}</strong>${l.note?`<small>${esc(l.note)}</small>`:''}</div>`:''}
   ${inc?`<div class="banner ban-danger"><strong>Incident caisse ouvert</strong><div class="small">${esc(inc.title)} · ${inc.requires_evidence?'preuve requise':'justification requise'}</div><button class="btn soft" data-open-incident="${inc.id}" style="margin-top:7px">Traiter l’incident</button></div>`:''}
   ${editable?countForm(l,recount):''}
  </article>`}
function countForm(l,recount){return`<div class="cash-count-form"><div class="label">${recount?'Recomptage obligatoire':'Comptage de clôture'}</div><div class="form-grid">
 <div class="field"><label>Espèces ${recount?'recomptées':'déclarées'} *</label><input data-cash-amount="${l.id}" type="number" min="0" step="0.01" value="${recount?(l.recount_cash??''):(l.declared_cash??'')}"></div>
 <div class="field"><label>Remise / clôture TPE *</label><input data-card-amount="${l.id}" type="number" min="0" step="0.01" value="${recount?(l.recount_card??''):(l.card_settlement??'')}"></div>
 <div class="field"><label>Statement Dynamics contrôlé *</label><select data-statement="${l.id}"><option value="">— Choisir —</option><option value="true" ${Number(l.statement_ok)===1?'selected':''}>Oui</option><option value="false" ${Number(l.statement_ok)===0?'selected':''}>Non</option></select></div>
 <div class="field"><label>Motif si écart</label><select data-cash-reason="${l.id}"><option value="">— Aucun —</option>${cfg.reasons.map(x=>`<option value="${x.code}" ${l.reason_code===x.code?'selected':''}>${esc(x.label)}</option>`).join('')}</select></div>
 <div class="field full"><label>Note</label><input data-cash-note="${l.id}" value="${esc(l.note||'')}" placeholder="Explication / action réalisée"></div>
 </div><button class="btn ${recount?'brand':'soft'}" data-count-cash="${l.id}" data-recount="${recount?'1':'0'}">${recount?'Valider le recomptage':'Valider le comptage'}</button></div>`}
function closingFooter(c){
 const canFinalize=canManage()&&['COUNTING','REVIEW'].includes(c.status)&&c.metrics.lines>0&&!c.metrics.pending&&!c.metrics.recounts;
 const canClose=canManage()&&c.status==='READY';
 return`<div class="card cash-finalize"><div><strong>Validation de la clôture</strong><div class="small muted">La validation alimente automatiquement l’étape « Clôture caisses » du parcours de fermeture. Les incidents d’écart restent néanmoins bloquants jusqu’à leur résolution.</div></div><div class="row">${['COUNTING','REVIEW'].includes(c.status)?`<button class="btn brand" id="finalizeCashBtn" ${canFinalize?'':'disabled'}>Valider le rapprochement</button>`:''}${c.status==='READY'?`<button class="btn brand" id="closeCashBtn" ${canClose?'':'disabled'}>Clôturer les caisses</button>`:''}${c.status==='CLOSED'?status('Clôture terminée','ok'):''}</div></div>`}
function policyCard(){return`<div class="network-section-title"><div><strong>Politique caisse réseau</strong><span>Seuils appliqués à tous les magasins.</span></div></div><div class="card"><div class="form-grid"><div class="field"><label>Tolérance (DH)</label><input id="cashTolerance" type="number" min="0" step="0.01" value="${cfg.policy.tolerance_dh}"></div><div class="field"><label>Recomptage dès (DH)</label><input id="cashRecount" type="number" min="0" step="0.01" value="${cfg.policy.recount_threshold_dh}"></div><div class="field"><label>Preuve dès (DH)</label><input id="cashEvidence" type="number" min="0" step="0.01" value="${cfg.policy.evidence_threshold_dh}"></div></div><button class="btn soft" id="saveCashPolicy">Enregistrer la politique</button></div>`}
function bindCash(){
 $('#syncCashBtn')?.addEventListener('click',syncCash);
 $('#finalizeCashBtn')?.addEventListener('click',finalizeCash);
 $('#closeCashBtn')?.addEventListener('click',closeCash);
 $('#saveCashPolicy')?.addEventListener('click',savePolicy);
 document.querySelectorAll('[data-count-cash]').forEach(b=>b.addEventListener('click',()=>countLine(b)));
}
async function syncCash(){try{await api(`/api/stores/${app.storeId}/cash-closing/sync`,{method:'POST'});toast('Shifts et statements rafraîchis depuis Dynamics.');await renderCash()}catch(e){toast(e.message)}}
async function countLine(btn){try{const id=btn.dataset.countCash,cash=document.querySelector(`[data-cash-amount="${id}"]`),card=document.querySelector(`[data-card-amount="${id}"]`),st=document.querySelector(`[data-statement="${id}"]`),reason=document.querySelector(`[data-cash-reason="${id}"]`),note=document.querySelector(`[data-cash-note="${id}"]`);if(cash.value===''||card.value===''||st.value==='')throw new Error('Renseigne espèces, TPE et contrôle du statement.');await api(`/api/cash/lines/${id}/count`,{method:'POST',body:JSON.stringify({declaredCash:Number(cash.value),cardSettlement:Number(card.value),statementOk:st.value==='true',reasonCode:reason.value||null,note:note.value.trim(),recount:btn.dataset.recount==='1'})});toast(btn.dataset.recount==='1'?'Recomptage enregistré.':'Comptage enregistré.');await renderCash()}catch(e){toast(e.message);await renderCash()}}
async function finalizeCash(){try{const r=await api(`/api/cash/${payload.closing.id}/finalize`,{method:'POST'});toast(r.varianceLines?.length?`Rapprochement validé · ${r.varianceLines.length} incident(s) caisse à traiter.`:'Rapprochement conforme et validé.');await renderCash()}catch(e){toast(e.message)}}
async function closeCash(){try{await api(`/api/cash/${payload.closing.id}/close`,{method:'POST'});toast('Caisses officiellement clôturées.');await renderCash()}catch(e){toast(e.message)}}
async function savePolicy(){try{await api('/api/cash/policy',{method:'PUT',body:JSON.stringify({tolerance:Number($('#cashTolerance').value),recountThreshold:Number($('#cashRecount').value),evidenceThreshold:Number($('#cashEvidence').value)})});toast('Politique caisse réseau mise à jour.');await renderCash()}catch(e){toast(e.message)}}

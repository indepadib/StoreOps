import {api} from './api.js';
import {app} from './state.js';
import {esc,toast,status} from './ui.js';

const labelForLevel=level=>level==='STORE_OPENING'?'Avant ouverture':'Avant fermeture';
const runTone=run=>run.status==='COMPLETED'?'ok':run.evaluation?.blockers?.length?'danger':'info';

function runCard(run){
 const stepRows=(run.template?.steps||[]).map(step=>{
  const state=(run.steps||[]).find(x=>x.step_code===step.code),done=state?.status==='COMPLETED';
  return `<div class="studio-run-step ${done?'done':''}"><div><strong>${done?'✓ ':''}${esc(step.title)}</strong><div class="small muted">${step.required?'Obligatoire':'Facultatif'}${step.evidenceRequired?' · preuve requise':''}</div></div>${done?status('Fait','ok'):`<div class="studio-run-actions">${step.evidenceRequired?`<input class="studio-evidence" data-evidence-for="${esc(step.code)}" placeholder="Référence preuve / photo / ticket">`:''}<button class="btn soft" data-custom-step="${esc(step.code)}">Valider</button></div>`}</div>`
 }).join('');
 const gates=(run.template?.gates||[]).map(g=>{const state=(run.gates||[]).find(x=>x.gate_code===g.code),ok=!!state?.ok;return `<div class="studio-run-step ${ok?'done':''}"><div><strong>${ok?'✓ ':''}${esc(g.label)}</strong><div class="small muted">Condition de validation</div></div>${ok?status('OK','ok'):`<button class="btn soft" data-custom-gate="${esc(g.code)}">Confirmer</button>`}</div>`}).join('');
 const ready=!run.evaluation?.blockers?.length&&run.status!=='COMPLETED';
 return `<article class="card studio-run-card" data-run-id="${esc(run.id)}"><div class="row"><div><div class="label">${esc(labelForLevel(run.blocking_level))}</div><h3>${esc(run.template_name)}</h3><div class="small muted">${esc(run.template_code)} · ${run.evaluation?.progress?.completed||0}/${run.evaluation?.progress?.total||0} étape(s)</div></div>${status(run.status==='COMPLETED'?'Terminé':ready?'Prêt à clôturer':'À faire',runTone(run))}</div><div class="studio-progress"><span style="width:${Number(run.evaluation?.progress?.percent||0)}%"></span></div><div class="studio-run-list">${stepRows}${gates}</div>${ready?`<button class="btn brand studio-complete-run" data-complete-run>Terminer ce process</button>`:''}</article>`
}

async function load(level){const payload=await api(`/api/stores/${app.storeId}/process-runs`);return (payload.items||[]).filter(x=>x.blocking_level===level)}

export async function mountCustomProcessRuns(containerId,level){
 const root=document.getElementById(containerId);if(!root)return;
 let host=root.querySelector('.custom-process-host');if(!host){host=document.createElement('div');host.className='custom-process-host';root.prepend(host)}
 try{
  const runs=await load(level);if(!runs.length){host.innerHTML='';return}
  host.innerHTML=`<div class="studio-runtime-head"><div><div class="label">Process Studio</div><strong>${runs.filter(x=>x.status!=='COMPLETED').length} process personnalisé(s)</strong></div><span class="pill">${esc(labelForLevel(level))}</span></div><div class="grid g2 studio-runtime-grid">${runs.map(runCard).join('')}</div>`;
  host.querySelectorAll('[data-custom-step]').forEach(btn=>btn.onclick=async()=>{const card=btn.closest('[data-run-id]'),stepCode=btn.dataset.customStep,input=card.querySelector(`[data-evidence-for="${CSS.escape(stepCode)}"]`);btn.disabled=true;try{await api(`/api/process-runs/${encodeURIComponent(card.dataset.runId)}/steps/${encodeURIComponent(stepCode)}/complete`,{method:'POST',body:{evidenceRef:input?.value?.trim()||null}});toast('Étape validée.');await mountCustomProcessRuns(containerId,level)}catch(e){btn.disabled=false;toast(e.message)}});
  host.querySelectorAll('[data-custom-gate]').forEach(btn=>btn.onclick=async()=>{const card=btn.closest('[data-run-id]');btn.disabled=true;try{await api(`/api/process-runs/${encodeURIComponent(card.dataset.runId)}/gates/${encodeURIComponent(btn.dataset.customGate)}`,{method:'POST',body:{ok:true,detail:'Confirmé depuis le parcours magasin'}});toast('Condition confirmée.');await mountCustomProcessRuns(containerId,level)}catch(e){btn.disabled=false;toast(e.message)}});
  host.querySelectorAll('[data-complete-run]').forEach(btn=>btn.onclick=async()=>{const card=btn.closest('[data-run-id]');btn.disabled=true;try{await api(`/api/process-runs/${encodeURIComponent(card.dataset.runId)}/complete`,{method:'POST'});toast('Process terminé.');await mountCustomProcessRuns(containerId,level)}catch(e){btn.disabled=false;toast(e.message)}})
 }catch(e){host.innerHTML=`<div class="banner ban-danger"><strong>Process Studio indisponible</strong><span>${esc(e.message)}</span></div>`}
}

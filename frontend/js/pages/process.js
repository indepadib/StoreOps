import { api } from '../api.js';
import { app,canManage } from '../state.js';
import { $,status,progress,esc,toast } from '../ui.js';

let activeTask=null;

const timeOf=v=>v?new Date(v+'Z').toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'—';
const dateTime=v=>v?new Date(v+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';

export async function renderProcess(group){
  const data=await api(`/api/stores/${app.storeId}/tasks?group=${group}`);
  const p=data[group];
  const el=$(`#${group}Content`);
  const owner=group==='opening'?data.day.opening_owner_name:data.day.closing_owner_name;
  const finalState=group==='opening'?data.day.opening_status==='OPENED':data.day.closing_status==='CLOSED';
  const closingLocked=group==='closing' && data.day.opening_status!=='OPENED';
  const processStarted=group==='opening'?data.day.opening_status!=='NOT_STARTED':data.day.closing_status!=='NOT_STARTED';
  const canInteract=canManage() && !finalState && !closingLocked;
  const currentTask=data.tasks.find(t=>t.id===p.currentTaskId);
  const relatedTaskIds=new Set(data.tasks.map(t=>t.id));
  const timeline=(data.timeline||[]).filter(a=>relatedTaskIds.has(a.entity_id)||a.action===`${group.toUpperCase()}_TAKEN`||(group==='opening'&&a.action==='STORE_OPENED')||(group==='closing'&&a.action==='STORE_CLOSED')).slice(0,16);

  const takeBtn=document.querySelector(`[data-take="${group}"]`);
  if(takeBtn){
    takeBtn.disabled=!canManage()||finalState||closingLocked;
    takeBtn.textContent=owner?`Pris en charge · ${owner}`:'Prendre en charge';
  }

  el.innerHTML=`
    ${closingLocked?`<div class="banner ban-danger process-lock"><strong>Fermeture verrouillée</strong><span>L’ouverture du magasin doit être validée avant de commencer le parcours de fermeture.</span></div>`:''}
    <div class="process-overview">
      <div class="card hero process-score">
        <div class="label muted">Parcours ${group==='opening'?'d’ouverture':'de fermeture'}</div>
        <div class="row process-score-row"><div class="kpi">${p.percent}%</div>${status(finalState?(group==='opening'?'Magasin ouvert':'Magasin fermé'):p.blockers?`${p.blockers} blocage(s)`:processStarted?'En cours':'À démarrer',finalState?'ok':p.blockers?'danger':processStarted?'warn':'neutral')}</div>
        <div style="margin-top:15px">${progress(p.percent)}</div>
        <div class="small hero-sub">${p.done}/${p.total} étapes conformes</div>
      </div>
      <div class="card process-focus">
        <div class="label">Étape active</div>
        <strong class="focus-title">${esc(currentTask?.title||'Parcours terminé')}</strong>
        <div class="small muted">${currentTask?`Étape ${currentTask.step_order}/${p.total}`:'Toutes les étapes ont été traitées.'}</div>
        <div class="focus-meta"><span>Responsable</span><strong>${esc(owner||'Non pris en charge')}</strong></div>
        <div class="focus-meta"><span>Blocages</span><strong>${p.blockers}</strong></div>
      </div>
      <div class="card process-rule">
        <div class="label">Validation finale</div>
        <p class="small muted">StoreOps vérifie les étapes obligatoires et les incidents bloquants côté serveur.</p>
        <button class="btn brand wide" data-validate="${group}" ${(!canInteract||p.done<p.total)?'disabled':''}>${group==='opening'?'Déclarer le magasin prêt':'Déclarer le magasin fermé'}</button>
      </div>
    </div>

    <div class="card journey-panel">
      <div class="row"><div><strong>Parcours</strong><div class="small muted">Une étape non conforme reste ouverte jusqu’à correction.</div></div><span class="pill">${p.total} étapes</span></div>
      <div class="journey-rail">${data.tasks.map(t=>railStep(t,p,canInteract)).join('')}</div>
    </div>

    <div class="process-layout">
      <div class="stack">${data.tasks.map(t=>stepCard(t,p,canInteract)).join('')}</div>
      <aside class="process-side">
        <div class="card">
          <div class="row"><strong>Anomalies ouvertes</strong><span class="pill">${data.incidents?.length||0}</span></div>
          <div class="side-list">${data.incidents?.length?data.incidents.map(incidentHtml).join(''):'<div class="empty compact">Aucune anomalie ouverte sur ce parcours.</div>'}</div>
        </div>
        <div class="card">
          <div class="row"><strong>Journal du parcours</strong><span class="pill">Audit</span></div>
          <div class="timeline">${timeline.length?timeline.map(timelineHtml).join(''):'<div class="empty compact">Aucune action enregistrée.</div>'}</div>
        </div>
      </aside>
    </div>`;
}

function railStep(t,p,canInteract){
  const done=t.status==='COMPLETED';
  const current=p.currentTaskId===t.id;
  return `<button class="rail-step ${done?'done':''} ${current?'current':''}" ${!canInteract||done?'disabled':''} data-task-form="${t.id}"><span>${done?'✓':t.step_order}</span><small>${esc(t.title)}</small></button>`;
}

function stepCard(t,p,canInteract){
  const done=t.status==='COMPLETED';
  const current=p.currentTaskId===t.id;
  const critical=t.criticality==='CRITICAL';
  return `<div class="step-card ${done?'done':''} ${current?'current':''}">
    <div class="step-index">${done?'✓':t.step_order}</div>
    <div class="step-main">
      <div class="step-title-row"><h3>${esc(t.title)}</h3>${critical?'<span class="mini-tag">Critique</span>':''}</div>
      <p>${esc(t.description||'')}</p>
      ${done?`<div class="step-audit">Validé par <strong>${esc(t.completed_by_name||'Système')}</strong> · ${timeOf(t.completed_at)}</div>`:`<div class="step-audit">${current?'Étape à traiter maintenant':'En attente des étapes précédentes'}</div>`}
    </div>
    ${done?status('Conforme','ok'):`<button class="btn ${current?'brand':'soft'}" data-task-form="${t.id}" ${canInteract?'':'disabled'}>${t.status==='IN_PROGRESS'?'Corriger':'Contrôler'}</button>`}
  </div>`;
}

function incidentHtml(i){
  const severity=i.criticality==='CRITICAL'?'danger':i.criticality==='HIGH'?'warn':'neutral';
  return `<button class="side-item incident-side-button" data-open-incident="${i.id}"><div class="row"><strong>${esc(i.title)}</strong>${status(i.criticality,severity)}</div><div class="small muted">${esc(i.category)} · ${dateTime(i.created_at)}</div>${i.blocking_level!=='NONE'?`<div class="small blocker-note">Bloque : ${esc(i.blocking_level)}</div>`:''}</button>`;
}

function timelineHtml(a){
  const labels={OPENING_TAKEN:'Ouverture prise en charge',CLOSING_TAKEN:'Fermeture prise en charge',TASK_COMPLETED:'Contrôle conforme',TASK_NONCONFORM:'Non-conformité détectée',STORE_OPENED:'Magasin déclaré prêt',STORE_CLOSED:'Magasin déclaré fermé'};
  const dangerous=a.action==='TASK_NONCONFORM';
  return `<div class="timeline-row ${dangerous?'danger':''}"><span class="timeline-dot"></span><div><strong>${esc(labels[a.action]||a.action.replaceAll('_',' '))}</strong><small>${esc(a.actor||'Système')} · ${dateTime(a.created_at)}</small></div></div>`;
}

export async function openTask(taskId){
  activeTask=await api(`/api/tasks/${taskId}/form`);
  $('#modalStep').textContent=`Étape ${activeTask.task.step_order} · ${activeTask.task.group_name==='opening'?'Ouverture':'Fermeture'}`;
  $('#modalTitle').textContent=activeTask.task.title;
  $('#modalDescription').textContent=activeTask.task.description||'';
  $('#modalBody').innerHTML=`<div class="control-intro"><strong>Contrôle opérationnel</strong><span>Renseigne uniquement ce qui est réellement constaté en magasin. Toute non-conformité est auditée.</span></div><div class="form-grid control-grid">${activeTask.fields.map(fieldHtml).join('')}</div>`;
  $('#taskModal').hidden=false;
  bindBooleanChoices();
}

function fieldHtml(f){
  const id=`tf_${f.code}`;
  const val=f.value;
  const help=[f.unit,f.min_value!=null||f.max_value!=null?`Tolérance ${f.min_value??'—'} à ${f.max_value??'—'}${f.unit?' '+f.unit:''}`:''].filter(Boolean).join(' · ');
  if(f.input_type==='BOOLEAN') return `<div class="field"><label>${esc(f.label)}</label><input id="${id}" type="hidden" value="${val===true?'true':val===false?'false':''}"><div class="boolean-choice" data-target="${id}"><button type="button" class="choice yes ${val===true?'active':''}" data-value="true">Conforme</button><button type="button" class="choice no ${val===false?'active':''}" data-value="false">Non conforme</button></div>${help?`<div class="field-help">${esc(help)}</div>`:''}</div>`;
  if(f.input_type==='TEXT') return `<div class="field full"><label>${esc(f.label)}</label><textarea id="${id}" rows="3" placeholder="Ajouter une note si nécessaire">${esc(val??'')}</textarea></div>`;
  if(f.input_type==='SELECT') return `<div class="field"><label>${esc(f.label)}</label><select id="${id}"><option value="">— Choisir —</option>${(f.options||[]).map(o=>`<option value="${esc(o)}" ${val===o?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
  return `<div class="field metric-field"><label>${esc(f.label)}</label><div class="metric-input"><input id="${id}" type="number" step="0.01" value="${val??''}" placeholder="0"><span>${esc(f.unit||'')}</span></div>${help?`<div class="field-help">${esc(help)}</div>`:''}</div>`;
}

function bindBooleanChoices(){
  document.querySelectorAll('.boolean-choice').forEach(group=>group.querySelectorAll('.choice').forEach(btn=>btn.addEventListener('click',()=>{
    const target=$(`#${group.dataset.target}`);target.value=btn.dataset.value;group.querySelectorAll('.choice').forEach(x=>x.classList.toggle('active',x===btn));
  })));
}

export function closeTask(){activeTask=null;$('#taskModal').hidden=true}

export async function submitActiveTask(){
  if(!activeTask)return;
  const values={};
  for(const f of activeTask.fields){
    const el=$(`#tf_${f.code}`);
    if(f.input_type==='BOOLEAN') values[f.code]=el.value===''?null:el.value==='true';
    else if(['NUMBER','MONEY'].includes(f.input_type)) values[f.code]=el.value===''?null:Number(el.value);
    else values[f.code]=el.value;
  }
  try{
    const group=activeTask.task.group_name;
    const r=await api(`/api/tasks/${activeTask.task.id}/submit`,{method:'POST',body:JSON.stringify({values})});
    toast('Contrôle conforme et audité.');closeTask();await renderProcess(group);return r;
  }catch(e){
    toast(e.message);
    const details=e.details||e.issues;
    if(details){
      $('#modalBody').querySelector('.ban-danger')?.remove();
      $('#modalBody').insertAdjacentHTML('beforeend',`<div class="banner ban-danger" style="margin-top:12px"><strong>Non-conformité détectée</strong><div style="margin-top:5px">${Array.isArray(details)?details.map(x=>esc(x.message||x.label||x)).join('<br>'):esc(JSON.stringify(details))}</div><div class="small" style="margin-top:7px">Corrige la situation terrain puis renseigne le nouveau contrôle. L’anomalie reste historisée.</div></div>`);
    }
    throw e;
  }
}

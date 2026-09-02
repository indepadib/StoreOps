import { api } from '../api.js';
import { app,canManage } from '../state.js';
import { $,status,progress,esc,toast } from '../ui.js';

let activeTask=null;
const CATEGORIES=[
  ['OPERATIONS','Exploitation'],['STAFFING','Équipe'],['SECURITY','Sécurité'],['COLD','Froid'],
  ['TECHNICAL','Technique'],['STOCK','Stock'],['CASH','Caisses'],['QUALITY','Qualité'],['COMMERCIAL','Commerce']
];
const PRIORITIES=[['LOW','Basse'],['NORMAL','Normale'],['HIGH','Haute'],['CRITICAL','Critique']];

const timeOf=v=>v?new Date(String(v).replace(' ','T')+'Z').toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'—';
const dateTime=v=>v?new Date(String(v).replace(' ','T')+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const dateOnly=v=>v?new Date(v+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
const nextDate=v=>{const d=new Date((v||new Date().toISOString().slice(0,10))+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
const duration=m=>m==null?'—':m<60?`${m} min`:`${Math.floor(m/60)} h ${m%60} min`;

export async function renderProcess(group){
  const data=await api(`/api/stores/${app.storeId}/tasks?group=${group}`);
  let outgoing=[];
  if(group==='closing'){
    const all=await api(`/api/stores/${app.storeId}/handover?status=ALL`);
    outgoing=(all.items||[]).filter(x=>x.source_business_date===data.day.business_date&&x.status!=='CANCELLED');
  }
  const p=data[group],el=$(`#${group}Content`);
  const owner=group==='opening'?data.day.opening_owner_name:data.day.closing_owner_name;
  const finalState=group==='opening'?data.day.opening_status==='OPENED':data.day.closing_status==='CLOSED';
  const closingLocked=group==='closing'&&data.day.opening_status!=='OPENED';
  const processStarted=group==='opening'?data.day.opening_status!=='NOT_STARTED':data.day.closing_status!=='NOT_STARTED';
  const canInteract=canManage()&&!finalState&&!closingLocked;
  const currentTask=data.tasks.find(t=>t.id===p.currentTaskId);
  const relatedTaskIds=new Set(data.tasks.map(t=>t.id));
  const timeline=(data.timeline||[]).filter(a=>relatedTaskIds.has(a.entity_id)||a.entity_type==='HANDOVER'||a.action===`${group.toUpperCase()}_TAKEN`||(group==='opening'&&a.action==='STORE_OPENED')||(group==='closing'&&a.action==='STORE_CLOSED')||a.action==='HANDOVER_REVIEWED').slice(0,20);
  const handover=data.handover||{stats:{pending:0,blocking:0,unacknowledged:0},items:[]};
  const closingReviewed=group!=='closing'||!!data.day.handover_reviewed_at;
  const openingHandoverBlocking=group==='opening'?Number(handover.stats?.blocking||0):0;
  const commercialBlocking=group==='opening'?Number(data.commercial?.blocking||0):0;
  const canValidate=canInteract&&p.done>=p.total&&closingReviewed&&openingHandoverBlocking===0&&commercialBlocking===0;

  const takeBtn=document.querySelector(`[data-take="${group}"]`);
  if(takeBtn){
    takeBtn.disabled=!canManage()||finalState||closingLocked;
    takeBtn.textContent=owner?`Pris en charge · ${owner}`:'Prendre en charge';
  }

  el.innerHTML=`
    ${closingLocked?`<div class="banner ban-danger process-lock"><strong>Fermeture verrouillée</strong><span>L’ouverture du magasin doit être validée avant de commencer le parcours de fermeture.</span></div>`:''}
    ${group==='opening'&&openingHandoverBlocking?`<div class="banner ban-danger process-lock"><strong>${openingHandoverBlocking} passation(s) bloquent l’ouverture</strong><span>Ces sujets doivent être résolus avant de pouvoir déclarer le magasin prêt.</span></div>`:''}
    ${group==='opening'&&commercialBlocking?`<div class="banner ban-danger process-lock"><strong>${commercialBlocking} action(s) prix/promo restent à vérifier</strong><span>Traite la file « Prix & promotions » avant de déclarer le magasin prêt.</span></div>`:''}
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
        <div class="focus-meta"><span>Blocages</span><strong>${p.blockers+openingHandoverBlocking+commercialBlocking}</strong></div>
      </div>
      <div class="card process-rule">
        <div class="label">Cycle opérationnel</div>
        <div class="focus-meta"><span>Début</span><strong>${timeOf(group==='opening'?data.day.opening_started_at:data.day.closing_started_at)}</strong></div>
        <div class="focus-meta"><span>Durée</span><strong>${duration(group==='opening'?data.cycle?.openingDurationMinutes:data.cycle?.closingDurationMinutes)}</strong></div>
        <button class="btn brand wide" data-validate="${group}" ${canValidate?'':'disabled'}>${group==='opening'?'Déclarer le magasin prêt':'Déclarer le magasin fermé'}</button>
      </div>
    </div>

    ${group==='opening'?openingHandoverPanel(handover,canInteract):closingHandoverPanel(data,outgoing,canInteract)}

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
  bindHandover(group,data);
}

function openingHandoverPanel(handover,canInteract){
 const items=handover.items||[];
 return`<div class="card handover-panel opening-handover">
   <div class="row"><div><strong>Passation reçue</strong><div class="small muted">Sujets transmis des jours précédents à reprendre avant ou pendant l’ouverture.</div></div><div class="handover-badges"><span class="pill">${items.length} en cours</span>${handover.stats?.blocking?`<span class="pill handover-danger">${handover.stats.blocking} bloquante(s)</span>`:''}</div></div>
   <div class="handover-list">${items.length?items.map(x=>handoverItem(x,canInteract)).join(''):'<div class="empty compact">Aucune passation en attente. Le magasin démarre sans sujet reporté.</div>'}</div>
 </div>`}
function closingHandoverPanel(data,outgoing,canInteract){
 const reviewed=!!data.day.handover_reviewed_at;
 return`<div class="card handover-panel closing-handover">
   <div class="row"><div><strong>Passation vers le lendemain</strong><div class="small muted">Tout sujet non terminé doit être transmis explicitement à l’équipe suivante.</div></div>${status(reviewed?'Passation revue':'À revoir',reviewed?'ok':'warn')}</div>
   ${canInteract?`<details class="handover-create" open><summary>Ajouter un sujet à transmettre</summary>
    <div class="form-grid" style="margin-top:10px">
      <div class="field"><label>Sujet *</label><input id="handoverTitle" placeholder="Ex. balance rayon 3 à contrôler"></div>
      <div class="field"><label>Catégorie</label><select id="handoverCategory">${CATEGORIES.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select></div>
      <div class="field"><label>Priorité</label><select id="handoverPriority">${PRIORITIES.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select></div>
      <div class="field"><label>Cible</label><input id="handoverTarget" type="date" value="${nextDate(data.day.business_date)}"></div>
      <div class="field full"><label>Détail</label><textarea id="handoverDescription" rows="2" placeholder="Ce que l’équipe suivante doit savoir / faire."></textarea></div>
      <label class="handover-check full"><input id="handoverBlocking" type="checkbox"> <span><strong>Bloquer l’ouverture suivante</strong><small>À utiliser uniquement si le magasin ne doit pas ouvrir tant que le sujet n’est pas résolu.</small></span></label>
    </div>
    <button class="btn soft" id="createHandoverBtn" style="margin-top:10px">Ajouter à la passation</button>
   </details>`:''}
   <div class="handover-list outgoing">${outgoing.length?outgoing.map(x=>handoverItem(x,canInteract,{outgoing:true})).join(''):'<div class="empty compact">Aucun sujet ajouté pour demain.</div>'}</div>
   <div class="handover-review-row">
     <div><strong>Contrôle de fin de passation</strong><div class="small muted">Même si aucun sujet n’est transmis, le Responsable confirme avoir vérifié qu’il ne reste rien à passer à l’équipe suivante.</div></div>
     <button class="btn ${reviewed?'soft':'brand'}" id="reviewHandoverBtn" ${!canInteract||reviewed?'disabled':''}>${reviewed?`Revue confirmée · ${timeOf(data.day.handover_reviewed_at)}`:'Confirmer la revue de passation'}</button>
   </div>
 </div>`}
function handoverItem(x,canInteract,{outgoing=false}={}){
 const pri=x.priority==='CRITICAL'?'danger':x.priority==='HIGH'?'warn':'neutral';
 const cat=CATEGORIES.find(c=>c[0]===x.category)?.[1]||x.category;
 const ack=x.status==='ACKNOWLEDGED';
 return`<div class="handover-item ${x.blocking_opening?'blocking':''}">
   <div class="handover-item-head"><div><div class="small muted">${esc(cat)} · cible ${dateOnly(x.target_business_date)}</div><strong>${esc(x.title)}</strong></div><div class="row">${status(PRIORITIES.find(p=>p[0]===x.priority)?.[1]||x.priority,pri)}${x.blocking_opening?'<span class="mini-tag">Bloque ouverture</span>':''}</div></div>
   ${x.description?`<p>${esc(x.description)}</p>`:''}
   <div class="small muted">Créé par ${esc(x.created_by_name||'—')} · ${dateTime(x.created_at)}${x.acknowledged_by_name?` · lu par ${esc(x.acknowledged_by_name)}`:''}</div>
   ${canInteract&&!outgoing?`<div class="handover-actions">
      ${!ack?`<button class="btn soft" data-handover-ack="${x.id}">Prendre connaissance</button>`:''}
      <input data-handover-note="${x.id}" placeholder="Note de résolution" aria-label="Note de résolution">
      <button class="btn brand" data-handover-resolve="${x.id}">Résoudre</button>
   </div>`:''}
 </div>`}

function bindHandover(group,data){
 if(!canManage())return;
 $('#createHandoverBtn')?.addEventListener('click',async()=>{
   try{
     const payload={title:$('#handoverTitle').value.trim(),description:$('#handoverDescription').value.trim(),category:$('#handoverCategory').value,priority:$('#handoverPriority').value,targetDate:$('#handoverTarget').value,blockingOpening:$('#handoverBlocking').checked,sourceBusinessDate:data.day.business_date};
     if(!payload.title)throw new Error('Le sujet de passation est obligatoire.');
     await api(`/api/stores/${app.storeId}/handover`,{method:'POST',body:JSON.stringify(payload)});
     toast('Sujet ajouté à la passation du lendemain.');await renderProcess(group);
   }catch(e){toast(e.message)}
 });
 $('#reviewHandoverBtn')?.addEventListener('click',async()=>{
   try{await api(`/api/stores/${app.storeId}/handover/review-closing?date=${data.day.business_date}`,{method:'POST'});toast('Passation de fermeture revue et auditée.');await renderProcess(group)}catch(e){toast(e.message)}
 });
 document.querySelectorAll('[data-handover-ack]').forEach(b=>b.addEventListener('click',async()=>{
   try{await api(`/api/handover/${b.dataset.handoverAck}/acknowledge`,{method:'POST'});toast('Prise de connaissance enregistrée.');await renderProcess(group)}catch(e){toast(e.message)}
 }));
 document.querySelectorAll('[data-handover-resolve]').forEach(b=>b.addEventListener('click',async()=>{
   try{const note=document.querySelector(`[data-handover-note="${b.dataset.handoverResolve}"]`)?.value.trim()||'';if(!note)throw new Error('Ajoute une note de résolution.');await api(`/api/handover/${b.dataset.handoverResolve}/resolve`,{method:'POST',body:JSON.stringify({note})});toast('Sujet de passation résolu.');await renderProcess(group)}catch(e){toast(e.message)}
 }));
}

function railStep(t,p,canInteract){
  const done=t.status==='COMPLETED',current=p.currentTaskId===t.id;
  return `<button class="rail-step ${done?'done':''} ${current?'current':''}" ${!canInteract||done?'disabled':''} data-task-form="${t.id}"><span>${done?'✓':t.step_order}</span><small>${esc(t.title)}</small></button>`;
}
function stepCard(t,p,canInteract){
  const done=t.status==='COMPLETED',current=p.currentTaskId===t.id,critical=t.criticality==='CRITICAL';
  return `<div class="step-card ${done?'done':''} ${current?'current':''}">
    <div class="step-index">${done?'✓':t.step_order}</div><div class="step-main"><div class="step-title-row"><h3>${esc(t.title)}</h3>${critical?'<span class="mini-tag">Critique</span>':''}</div><p>${esc(t.description||'')}</p>
    ${done?`<div class="step-audit">Validé par <strong>${esc(t.completed_by_name||'Système')}</strong> · ${timeOf(t.completed_at)}</div>`:`<div class="step-audit">${current?'Étape à traiter maintenant':'En attente des étapes précédentes'}</div>`}</div>
    ${done?status('Conforme','ok'):`<button class="btn ${current?'brand':'soft'}" data-task-form="${t.id}" ${canInteract?'':'disabled'}>${t.status==='IN_PROGRESS'?'Corriger':'Contrôler'}</button>`}</div>`;
}
function incidentHtml(i){
  const severity=i.criticality==='CRITICAL'?'danger':i.criticality==='HIGH'?'warn':'neutral';
  return `<button class="side-item incident-side-button" data-open-incident="${i.id}"><div class="row"><strong>${esc(i.title)}</strong>${status(i.criticality,severity)}</div><div class="small muted">${esc(i.category)} · ${dateTime(i.created_at)}</div>${i.blocking_level!=='NONE'?`<div class="small blocker-note">Bloque : ${esc(i.blocking_level)}</div>`:''}</button>`;
}
function timelineHtml(a){
  const labels={OPENING_TAKEN:'Ouverture prise en charge',CLOSING_TAKEN:'Fermeture prise en charge',TASK_COMPLETED:'Contrôle conforme',TASK_NONCONFORM:'Non-conformité détectée',STORE_OPENED:'Magasin déclaré prêt',STORE_CLOSED:'Magasin déclaré fermé',HANDOVER_CREATED:'Sujet de passation créé',HANDOVER_ACKNOWLEDGED:'Passation prise en compte',HANDOVER_RESOLVED:'Passation résolue',HANDOVER_REVIEWED:'Passation de fermeture revue'};
  const dangerous=a.action==='TASK_NONCONFORM';
  return `<div class="timeline-row ${dangerous?'danger':''}"><span class="timeline-dot"></span><div><strong>${esc(labels[a.action]||a.action.replaceAll('_',' '))}</strong><small>${esc(a.actor||'Système')} · ${dateTime(a.created_at)}</small></div></div>`;
}

export async function openTask(taskId){
  activeTask=await api(`/api/tasks/${taskId}/form`);
  $('#modalStep').textContent=`Étape ${activeTask.task.step_order} · ${activeTask.task.group_name==='opening'?'Ouverture':'Fermeture'}`;
  $('#modalTitle').textContent=activeTask.task.title;$('#modalDescription').textContent=activeTask.task.description||'';
  $('#modalBody').innerHTML=`<div class="control-intro"><strong>Contrôle opérationnel</strong><span>Renseigne uniquement ce qui est réellement constaté en magasin. Toute non-conformité est auditée.</span></div><div class="form-grid control-grid">${activeTask.fields.map(fieldHtml).join('')}</div>`;
  $('#taskModal').hidden=false;bindBooleanChoices();
}
function fieldHtml(f){
  const id=`tf_${f.code}`,val=f.value,help=[f.unit,f.min_value!=null||f.max_value!=null?`Tolérance ${f.min_value??'—'} à ${f.max_value??'—'}${f.unit?' '+f.unit:''}`:''].filter(Boolean).join(' · ');
  if(f.input_type==='BOOLEAN')return `<div class="field"><label>${esc(f.label)}</label><input id="${id}" type="hidden" value="${val===true?'true':val===false?'false':''}"><div class="boolean-choice" data-target="${id}"><button type="button" class="choice yes ${val===true?'active':''}" data-value="true">Conforme</button><button type="button" class="choice no ${val===false?'active':''}" data-value="false">Non conforme</button></div>${help?`<div class="field-help">${esc(help)}</div>`:''}</div>`;
  if(f.input_type==='TEXT')return `<div class="field full"><label>${esc(f.label)}</label><textarea id="${id}" rows="3" placeholder="Ajouter une note si nécessaire">${esc(val??'')}</textarea></div>`;
  if(f.input_type==='SELECT')return `<div class="field"><label>${esc(f.label)}</label><select id="${id}"><option value="">— Choisir —</option>${(f.options||[]).map(o=>`<option value="${esc(o)}" ${val===o?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
  return `<div class="field metric-field"><label>${esc(f.label)}</label><div class="metric-input"><input id="${id}" type="number" step="0.01" value="${val??''}" placeholder="0"><span>${esc(f.unit||'')}</span></div>${help?`<div class="field-help">${esc(help)}</div>`:''}</div>`;
}
function bindBooleanChoices(){document.querySelectorAll('.boolean-choice').forEach(group=>group.querySelectorAll('.choice').forEach(btn=>btn.addEventListener('click',()=>{const target=$(`#${group.dataset.target}`);target.value=btn.dataset.value;group.querySelectorAll('.choice').forEach(x=>x.classList.toggle('active',x===btn))})))}
export function closeTask(){activeTask=null;$('#taskModal').hidden=true}
export async function submitActiveTask(){
  if(!activeTask)return;const values={};
  for(const f of activeTask.fields){const el=$(`#tf_${f.code}`);if(f.input_type==='BOOLEAN')values[f.code]=el.value===''?null:el.value==='true';else if(['NUMBER','MONEY'].includes(f.input_type))values[f.code]=el.value===''?null:Number(el.value);else values[f.code]=el.value}
  try{const group=activeTask.task.group_name,r=await api(`/api/tasks/${activeTask.task.id}/submit`,{method:'POST',body:JSON.stringify({values})});toast('Contrôle conforme et audité.');closeTask();await renderProcess(group);return r}
  catch(e){toast(e.message);const details=e.details||e.issues;if(details){$('#modalBody').querySelector('.ban-danger')?.remove();$('#modalBody').insertAdjacentHTML('beforeend',`<div class="banner ban-danger" style="margin-top:12px"><strong>Non-conformité détectée</strong><div style="margin-top:5px">${Array.isArray(details)?details.map(x=>esc(x.message||x.label||x)).join('<br>'):esc(JSON.stringify(details))}</div><div class="small" style="margin-top:7px">Corrige la situation terrain puis renseigne le nouveau contrôle. L’anomalie reste historisée.</div></div>`)}throw e}
}

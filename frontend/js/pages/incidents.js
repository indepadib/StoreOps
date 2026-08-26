import { api,apiBlob } from '../api.js';
import { app,canManage } from '../state.js';
import { $,status,esc,toast } from '../ui.js';

let activeIncident=null;
let assignees=[];
const dt=v=>v?new Date(v.endsWith?.('Z')?v:v+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const severityType=v=>v==='CRITICAL'?'danger':v==='HIGH'?'warn':v==='MEDIUM'?'neutral':'ok';
const overdue=i=>i.status==='OPEN'&&i.due_at&&new Date(i.due_at)<new Date();

export async function renderIncidents(){
  const data=await api(`/api/stores/${app.storeId}/incidents?status=ALL`);
  assignees=canManage()?await api(`/api/stores/${app.storeId}/assignees`):[];
  const open=data.items.filter(i=>i.status==='OPEN');
  const resolved=data.items.filter(i=>i.status==='RESOLVED');
  $('#incidentsContent').innerHTML=`
    <div class="grid g4">
      <div class="card"><div class="label">Ouverts</div><div class="kpi">${data.stats.open}</div><div class="small muted">à traiter</div></div>
      <div class="card"><div class="label">Critiques</div><div class="kpi">${data.stats.critical}</div><div class="small muted">priorité immédiate</div></div>
      <div class="card"><div class="label">En retard</div><div class="kpi">${data.stats.overdue}</div><div class="small muted">échéance dépassée</div></div>
      <div class="card"><div class="label">Résolus aujourd’hui</div><div class="kpi">${data.stats.resolvedToday}</div><div class="small muted">historisés</div></div>
    </div>
    ${canManage()?newIncidentPanel():`<div class="role-lock" style="margin-top:14px">Lecture seule. La gestion des incidents est réservée au Responsable magasin et au Directeur d’Exploitation.</div>`}
    <div class="network-section-title"><div><strong>Incidents ouverts</strong><span>Actions correctives, preuves et résolution.</span></div><span class="pill">${open.length}</span></div>
    <div class="incident-list">${open.length?open.map(incidentCard).join(''):'<div class="card empty">Aucun incident ouvert.</div>'}</div>
    <div class="network-section-title"><div><strong>Historique résolu</strong><span>Traçabilité des incidents clôturés.</span></div><span class="pill">${resolved.length}</span></div>
    <div class="incident-list resolved-list">${resolved.length?resolved.slice(0,20).map(incidentCard).join(''):'<div class="card empty">Aucun incident résolu.</div>'}</div>`;
  bindCreateForm();
}

function newIncidentPanel(){
  return `<div class="card incident-create" style="margin-top:14px"><div class="row"><div><strong>Signaler un incident</strong><div class="small muted">Sécurité, technique, froid, qualité, réception ou exploitation.</div></div><button class="btn soft" id="toggleIncidentCreate">Nouveau</button></div>
  <div id="incidentCreateForm" hidden><div class="form-grid" style="margin-top:13px">
    <div class="field full"><label>Titre *</label><input id="newIncTitle" placeholder="Ex. Porte arrière impossible à verrouiller"></div>
    <div class="field"><label>Catégorie</label><select id="newIncCategory"><option>OPERATIONS</option><option>SECURITY</option><option>TECHNICAL</option><option>COLD</option><option>QUALITY</option><option>RECEPTION</option><option>STOCK</option></select></div>
    <div class="field"><label>Criticité</label><select id="newIncCriticality"><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option><option>LOW</option></select></div>
    <div class="field"><label>Blocage</label><select id="newIncBlocking"><option value="NONE">Aucun</option><option value="PROCESS">Process</option><option value="STORE_OPENING">Ouverture magasin</option><option value="STORE_CLOSING">Fermeture magasin</option><option value="TRANSACTION">Transaction</option></select></div>
    <div class="field"><label>Affecter à</label><select id="newIncAssignee"><option value="">Non affecté</option>${assignees.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Échéance</label><input id="newIncDue" type="datetime-local"></div>
    <div class="field"><label>Preuve photo requise</label><select id="newIncEvidence"><option value="false">Non</option><option value="true">Oui</option></select></div>
    <div class="field full"><label>Description</label><textarea id="newIncDescription" rows="3" placeholder="Décrire précisément le constat et le risque."></textarea></div>
  </div><div class="row" style="justify-content:flex-end;margin-top:11px"><button class="btn brand" id="saveIncident">Créer l’incident</button></div></div></div>`;
}

function bindCreateForm(){
  $('#toggleIncidentCreate')?.addEventListener('click',()=>{const f=$('#incidentCreateForm');f.hidden=!f.hidden});
  $('#saveIncident')?.addEventListener('click',async()=>{
    try{
      const body={title:$('#newIncTitle').value.trim(),description:$('#newIncDescription').value.trim(),category:$('#newIncCategory').value,criticality:$('#newIncCriticality').value,blockingLevel:$('#newIncBlocking').value,assignedTo:$('#newIncAssignee').value||null,dueAt:$('#newIncDue').value||null,requiresEvidence:$('#newIncEvidence').value==='true'};
      await api(`/api/stores/${app.storeId}/incidents`,{method:'POST',body:JSON.stringify(body)});toast('Incident créé.');await renderIncidents();
    }catch(e){toast(e.message)}
  });
}

function incidentCard(i){
  const actionsDone=i.actions.filter(a=>a.status==='DONE').length;
  const late=overdue(i);
  return `<button class="card incident-card ${late?'late':''}" data-open-incident="${i.id}">
    <div class="row incident-card-head"><div><div class="small muted">${esc(i.category)} · ${dt(i.created_at)}</div><h3>${esc(i.title)}</h3></div>${status(i.status==='RESOLVED'?'Résolu':i.criticality,i.status==='RESOLVED'?'ok':severityType(i.criticality))}</div>
    ${i.description?`<p class="incident-description">${esc(i.description)}</p>`:''}
    <div class="incident-meta-grid"><div><span>Affecté à</span><strong>${esc(i.assigned_to_name||'Non affecté')}</strong></div><div><span>Échéance</span><strong class="${late?'danger-text':''}">${i.due_at?dt(i.due_at):'—'}</strong></div><div><span>Actions</span><strong>${actionsDone}/${i.actions.length}</strong></div><div><span>Preuves</span><strong>${i.evidence.length}${i.requires_evidence?' requise':''}</strong></div></div>
    ${i.blocking_level!=='NONE'?`<div class="incident-blocking">Bloque : ${esc(i.blocking_level)}</div>`:''}
  </button>`;
}

export async function openIncident(id){
  activeIncident=await api(`/api/incidents/${id}`);
  $('#incidentModalTitle').textContent=activeIncident.title;
  $('#incidentModalMeta').textContent=`${activeIncident.category} · créé ${dt(activeIncident.created_at)}${activeIncident.created_by_name?' par '+activeIncident.created_by_name:''}`;
  $('#incidentModalBody').innerHTML=incidentDetail(activeIncident);
  $('#incidentModal').hidden=false;
  bindDetailForm();
}

export function closeIncident(){activeIncident=null;$('#incidentModal').hidden=true}

function incidentDetail(i){
  const can=canManage();
  return `<div class="incident-detail-head"><div>${status(i.status==='RESOLVED'?'Résolu':i.criticality,i.status==='RESOLVED'?'ok':severityType(i.criticality))}</div><div class="incident-detail-grid"><div><span>Affecté à</span><strong>${esc(i.assigned_to_name||'Non affecté')}</strong></div><div><span>Échéance</span><strong>${i.due_at?dt(i.due_at):'—'}</strong></div><div><span>Blocage</span><strong>${esc(i.blocking_level)}</strong></div><div><span>Preuve</span><strong>${i.requires_evidence?'Obligatoire':'Selon besoin'}</strong></div></div>${i.description?`<p>${esc(i.description)}</p>`:''}</div>
  <div class="incident-section"><div class="row"><strong>Actions correctives</strong><span class="pill">${i.actions.filter(a=>a.status==='DONE').length}/${i.actions.length}</span></div><div class="stack" style="margin-top:9px">${i.actions.length?i.actions.map(actionRow).join(''):'<div class="empty compact">Aucune action corrective.</div>'}</div>
  ${can&&i.status==='OPEN'?`<div class="incident-inline-form"><div class="form-grid"><div class="field full"><label>Nouvelle action</label><input id="incActionTitle" placeholder="Ex. Contacter maintenance et sécuriser la zone"></div><div class="field"><label>Affecter à</label><select id="incActionAssignee"><option value="">Responsable incident</option>${assignees.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></div><div class="field"><label>Échéance</label><input id="incActionDue" type="datetime-local"></div><div class="field full"><label>Note</label><input id="incActionNote" placeholder="Instruction / contexte"></div></div><button class="btn soft" id="addIncidentAction">Ajouter l’action</button></div>`:''}</div>
  <div class="incident-section"><div class="row"><strong>Preuves</strong><span class="pill">${i.evidence.length}</span></div><div class="evidence-grid" style="margin-top:9px">${i.evidence.length?i.evidence.map(evidenceCard).join(''):'<div class="empty compact">Aucune preuve ajoutée.</div>'}</div>
  ${can&&i.status==='OPEN'?`<div class="incident-inline-form"><div class="form-grid"><div class="field"><label>Photo</label><input id="incidentEvidenceFile" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></div><div class="field"><label>Légende</label><input id="incidentEvidenceCaption" placeholder="Ex. Porte condamnée après intervention"></div></div><button class="btn soft" id="addIncidentEvidence">Ajouter la preuve</button><div class="field-help">JPG, PNG ou WEBP · 5 Mo max.</div></div>`:''}</div>
  <div class="incident-section resolution-box"><strong>Clôture</strong>${i.status==='RESOLVED'?`<div class="resolved-summary"><p>${esc(i.resolution_note||'Résolu')}</p><small>${esc(i.resolved_by_name||'Système')} · ${dt(i.resolved_at)}</small></div>${can?'<button class="btn soft" id="reopenIncident">Réouvrir l’incident</button>':''}`:can?`<div class="field" style="margin-top:9px"><label>Compte-rendu de résolution</label><textarea id="incidentResolutionNote" rows="3" placeholder="Décrire la correction et le recontrôle réalisé."></textarea></div><button class="btn brand" id="resolveIncident" ${i.open_actions?'disabled':''}>Clôturer l’incident</button>${i.open_actions?`<div class="field-help">Terminer d’abord ${i.open_actions} action(s) corrective(s).</div>`:''}`:'<div class="readonly-note">Seul le Responsable magasin ou le Directeur peut clôturer.</div>'}</div>`;
}

function actionRow(a){return `<div class="action-row ${a.status==='DONE'?'done':''}"><div><strong>${esc(a.title)}</strong><small>${esc(a.assigned_to_name||'Non affecté')}${a.due_at?' · échéance '+dt(a.due_at):''}${a.note?' · '+esc(a.note):''}</small>${a.status==='DONE'?`<small>Terminé par ${esc(a.completed_by_name||'—')} · ${dt(a.completed_at)}${a.completion_note?' · '+esc(a.completion_note):''}</small>`:''}</div>${a.status==='DONE'?status('Terminée','ok'):canManage()?`<button class="btn soft" data-complete-incident-action="${a.id}">Terminer</button>`:status('Ouverte','warn')}</div>`}
function evidenceCard(e){return `<button class="evidence-card" data-view-evidence="${e.id}"><strong>${esc(e.file_name)}</strong><span>${esc(e.caption||'Preuve photo')}</span><small>${esc(e.created_by_name||'—')} · ${dt(e.created_at)}</small></button>`}

function bindDetailForm(){
  $('#addIncidentAction')?.addEventListener('click',async()=>{try{await api(`/api/incidents/${activeIncident.id}/actions`,{method:'POST',body:JSON.stringify({title:$('#incActionTitle').value.trim(),note:$('#incActionNote').value.trim(),assignedTo:$('#incActionAssignee').value||null,dueAt:$('#incActionDue').value||null})});toast('Action corrective ajoutée.');await openIncident(activeIncident.id);await renderIncidents()}catch(e){toast(e.message)}});
  $('#addIncidentEvidence')?.addEventListener('click',async()=>{try{const f=$('#incidentEvidenceFile').files?.[0];if(!f)throw new Error('Choisir ou prendre une photo.');const dataUrl=await fileDataUrl(f);await api(`/api/incidents/${activeIncident.id}/evidence`,{method:'POST',body:JSON.stringify({dataUrl,fileName:f.name,caption:$('#incidentEvidenceCaption').value.trim()})});toast('Preuve ajoutée.');await openIncident(activeIncident.id);await renderIncidents()}catch(e){toast(e.message)}});
  $('#resolveIncident')?.addEventListener('click',async()=>{try{await api(`/api/incidents/${activeIncident.id}/resolve`,{method:'POST',body:JSON.stringify({resolutionNote:$('#incidentResolutionNote').value.trim()})});toast('Incident clôturé.');await openIncident(activeIncident.id);await renderIncidents()}catch(e){toast(e.message)}});
  $('#reopenIncident')?.addEventListener('click',async()=>{try{await api(`/api/incidents/${activeIncident.id}/reopen`,{method:'POST',body:JSON.stringify({note:'Réouverture depuis StoreOps'})});toast('Incident réouvert.');await openIncident(activeIncident.id);await renderIncidents()}catch(e){toast(e.message)}});
}

export async function completeIncidentAction(actionId){
  if(!activeIncident)return; const note=window.prompt('Compte-rendu de l’action corrective (facultatif) :','')||'';
  await api(`/api/incidents/${activeIncident.id}/actions/${actionId}/complete`,{method:'POST',body:JSON.stringify({note})});toast('Action terminée.');await openIncident(activeIncident.id);await renderIncidents();
}

export async function viewEvidence(id){
  try{const blob=await apiBlob(`/api/media/${id}`);const url=URL.createObjectURL(blob);const w=window.open(url,'_blank','noopener,noreferrer');if(!w)toast('Autoriser les fenêtres pop-up pour voir la preuve.');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){toast(e.message)}
}

function fileDataUrl(file){return new Promise((resolve,reject)=>{if(file.size>5*1024*1024)return reject(new Error('Photo trop volumineuse (5 Mo max).'));const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Impossible de lire la photo.'));r.readAsDataURL(file)})}

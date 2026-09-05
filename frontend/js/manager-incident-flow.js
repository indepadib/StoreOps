import { api } from './api.js';
import { toast } from './ui.js';

const MANAGER=()=>document.body.classList.contains('manager-mode');
let active=null;
let busy=false;

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dt(v){if(!v)return'';try{return new Date(v.endsWith?.('Z')?v:v+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return''}}
function host(){
  let el=document.querySelector('#managerIncidentFlow');
  if(el)return el;
  el=document.createElement('div');
  el.id='managerIncidentFlow';
  el.className='manager-incident-backdrop';
  el.hidden=true;
  document.body.appendChild(el);
  return el;
}
function close(){const el=host();el.hidden=true;el.innerHTML='';active=null;busy=false}
function openActions(i){return(i.actions||[]).filter(a=>a.status==='OPEN')}
function evidenceCount(i){return(i.evidence||[]).length}
function nextState(i){
  if(i.status==='RESOLVED')return'RESOLVED';
  if(openActions(i).length)return'ACTION';
  if(i.requires_evidence&&evidenceCount(i)===0)return'EVIDENCE';
  return'RESOLVE';
}
function stateProgress(state){const n={ACTION:1,EVIDENCE:2,RESOLVE:3,RESOLVED:3}[state]||1;return`<div class="manager-incident-progress">${[1,2,3].map(x=>`<span class="${x<=n?'active':''}"></span>`).join('')}</div>`}
function meta(i){
  const blocker=i.blocking_level&&i.blocking_level!=='NONE'?'<span class="manager-incident-chip danger">Bloquant</span>':'';
  const critical=i.criticality==='CRITICAL'?'<span class="manager-incident-chip danger">Critique</span>':i.criticality==='HIGH'?'<span class="manager-incident-chip warn">Prioritaire</span>':'';
  return`<div class="manager-incident-meta">${critical}${blocker}${i.due_at?`<span class="manager-incident-chip">Avant ${esc(dt(i.due_at))}</span>`:''}</div>`;
}
function render(){
  if(!active)return;
  const el=host(),state=nextState(active),actions=openActions(active),first=actions[0];
  let content='';
  if(state==='ACTION')content=`<span class="manager-eyebrow">À faire maintenant</span><h2>${esc(first.title)}</h2>${first.note?`<p>${esc(first.note)}</p>`:'<p>Faites la correction sur le terrain, puis confirmez.</p>'}<button class="btn brand manager-incident-primary" id="managerActionDone">C’est fait</button>`;
  if(state==='EVIDENCE')content=`<span class="manager-eyebrow">Preuve</span><h2>Ajoutez une photo</h2><p>Prenez une photo de la situation corrigée. Elle sera attachée à l’alerte.</p><label class="manager-camera-button"><input id="managerIncidentPhoto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><strong>Prendre une photo</strong><span>Caméra ou photothèque</span></label>`;
  if(state==='RESOLVE')content=`<span class="manager-eyebrow">Dernière étape</span><h2>Tout est corrigé ?</h2><p>Les actions nécessaires sont terminées${active.requires_evidence?' et la preuve est enregistrée':''}.</p><button class="btn brand manager-incident-primary" id="managerResolveIncident">Clôturer l’alerte</button>`;
  if(state==='RESOLVED')content=`<div class="manager-incident-resolved-mark">✓</div><span class="manager-eyebrow">Terminé</span><h2>Alerte clôturée</h2><p>${esc(active.resolution_note||'La correction est enregistrée.')}</p><button class="btn soft manager-incident-primary" id="managerIncidentCloseDone">Fermer</button>`;
  el.hidden=false;
  el.innerHTML=`<section class="manager-incident-sheet"><button class="manager-incident-close" id="managerIncidentClose" aria-label="Fermer">×</button>${stateProgress(state)}${meta(active)}<div class="manager-incident-context"><small>${esc(active.category||'Alerte')}</small><strong>${esc(active.title)}</strong></div>${content}<details class="manager-incident-details"><summary>Voir le détail</summary><div><p>${esc(active.description||'Aucun détail supplémentaire.')}</p><small>Créée ${esc(dt(active.created_at))}${active.created_by_name?` par ${esc(active.created_by_name)}`:''}</small></div></details></section>`;
  bind(state,first);
}
function bind(state,action){
  document.querySelector('#managerIncidentClose')?.addEventListener('click',close);
  document.querySelector('#managerIncidentCloseDone')?.addEventListener('click',()=>{close();refreshAlerts()});
  if(state==='ACTION')document.querySelector('#managerActionDone')?.addEventListener('click',()=>completeAction(action));
  if(state==='EVIDENCE')document.querySelector('#managerIncidentPhoto')?.addEventListener('change',e=>uploadEvidence(e.target.files?.[0]));
  if(state==='RESOLVE')document.querySelector('#managerResolveIncident')?.addEventListener('click',resolveIncident);
}
async function load(id){active=await api(`/api/incidents/${id}`);render()}
async function completeAction(action){
  if(busy)return;busy=true;
  const b=document.querySelector('#managerActionDone');if(b){b.disabled=true;b.textContent='Enregistrement…'}
  try{await api(`/api/incidents/${active.id}/actions/${action.id}/complete`,{method:'POST',body:JSON.stringify({note:'Correction confirmée depuis le parcours Responsable magasin.'})});active=await api(`/api/incidents/${active.id}`);toast('Action terminée.');busy=false;render()}catch(e){busy=false;if(b){b.disabled=false;b.textContent='C’est fait'}toast(e.message)}
}
function fileDataUrl(file){return new Promise((resolve,reject)=>{if(!file)return reject(new Error('Choisir une photo.'));if(file.size>5*1024*1024)return reject(new Error('Photo trop volumineuse (5 Mo max).'));const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Impossible de lire la photo.'));r.readAsDataURL(file)})}
async function uploadEvidence(file){
  if(busy||!file)return;busy=true;
  try{const dataUrl=await fileDataUrl(file);await api(`/api/incidents/${active.id}/evidence`,{method:'POST',body:JSON.stringify({dataUrl,fileName:file.name||'preuve.jpg',caption:'Preuve après correction terrain'})});active=await api(`/api/incidents/${active.id}`);toast('Photo enregistrée.');busy=false;render()}catch(e){busy=false;toast(e.message)}
}
async function resolveIncident(){
  if(busy)return;busy=true;
  const b=document.querySelector('#managerResolveIncident');if(b){b.disabled=true;b.textContent='Clôture…'}
  try{await api(`/api/incidents/${active.id}/resolve`,{method:'POST',body:JSON.stringify({resolutionNote:'Correction confirmée et recontrôlée en magasin.'})});active=await api(`/api/incidents/${active.id}`);busy=false;render();refreshAlerts()}catch(e){busy=false;if(b){b.disabled=false;b.textContent='Clôturer l’alerte'}toast(e.message)}
}
function refreshAlerts(){document.querySelector('#managerNav [data-page="incidents"]')?.click()}

export function initManagerIncidentFlow(){
  document.addEventListener('click',e=>{
    if(!MANAGER())return;
    const target=e.target.closest?.('#incidentsPage [data-open-incident]');
    if(!target)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    load(target.dataset.openIncident).catch(err=>toast(err.message));
  },true);
}
document.addEventListener('DOMContentLoaded',initManagerIncidentFlow,{once:true});

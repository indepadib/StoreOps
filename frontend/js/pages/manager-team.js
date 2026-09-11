import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,esc,toast } from '../ui.js';

let teamData=null;
const today=()=>new Date().toISOString().slice(0,10);
const roleLabel=x=>({MANAGER:'Responsable',CASHIER:'Caisse',FLOOR:'Surface',OTHER:'Autre'}[x]||x||'Autre');
const contractLabel=x=>({CDI:'CDI',CDD:'CDD',INTERIM:'Intérim',STAGE:'Stage',PRESTATAIRE:'Prestataire',OTHER:'Autre'}[x]||x);
const employeeOptions=()=>`<option value="">Choisir…</option>${(teamData?.employees||[]).filter(x=>x.status!=='ENDED').map(e=>`<option value="${esc(e.id)}">${esc(e.display_name)} · ${esc(roleLabel(e.role_code))}</option>`).join('')}`;

function employeeCard(e){return`<article class="manager-team-person"><div class="manager-avatar">${esc((e.first_name||'?').slice(0,1)+(e.last_name||'').slice(0,1))}</div><div><strong>${esc(e.display_name)}</strong><span>${esc(roleLabel(e.role_code))} · ${esc(contractLabel(e.contract_type))}</span><small>${esc(e.employee_code)} · depuis ${esc(e.contract_start)}${e.contract_end?` · fin ${esc(e.contract_end)}`:''}</small></div><div class="manager-team-person-actions"><span class="manager-team-status ${e.status==='NOTICE'?'warn':'ok'}">${e.status==='NOTICE'?'Préavis':'Actif'}</span><button class="btn ghost" data-end-employee="${esc(e.id)}">Fin contrat</button></div></article>`}
function shiftCard(s){return`<article class="manager-shift-card"><div><strong>${esc(s.start_time)}–${esc(s.end_time)}</strong><span>${esc(s.employee_name)}</span><small>${esc(roleLabel(s.role_code))}</small></div><div>${s.status==='PUBLISHED'?'<span class="manager-team-status ok">Publié</span>':s.status==='DRAFT'?`<button class="btn soft" data-publish-shift="${esc(s.id)}">Publier</button>`:'<span class="manager-team-status">Annulé</span>'}</div></article>`}
function objectiveCard(o){const progress=o.target_value?Math.min(100,Math.round((Number(o.progress_value||0)/Number(o.target_value))*100)):null;return`<article class="manager-objective-card"><div><strong>${esc(o.title)}</strong><span>${esc(o.employee_name||roleLabel(o.role_code)||'Magasin')}</span><small>jusqu’au ${esc(o.period_end)}</small></div><div>${o.target_value!=null?`<strong>${o.progress_value??0}/${o.target_value} ${esc(o.unit||'')}</strong>${progress!=null?`<span>${progress}%</span>`:''}`:'<span>Objectif actif</span>'}</div></article>`}

export async function renderManagerTeam(){
 const date=today();teamData=await api(`/api/stores/${app.storeId}/workforce?date=${date}`);const s=teamData.summary||{},store=currentStore();
 $('#managerTeamContent').innerHTML=`<div class="manager-team-shell">
  <header class="manager-team-head"><span class="manager-eyebrow">${esc(store?.name||'Votre magasin')}</span><h2>Votre équipe</h2><p>Collaborateurs, planning et objectifs. Les accès StoreOps restent gérés séparément.</p></header>
  <section class="manager-team-kpis"><div><strong>${s.activeEmployees||0}</strong><span>collaborateurs actifs</span></div><div><strong>${s.publishedShifts||0}/${s.shifts||0}</strong><span>shifts publiés aujourd’hui</span></div><div><strong>${s.activeObjectives||0}</strong><span>objectifs actifs</span></div></section>

  <section class="manager-team-actions">
   <details><summary>+ Ajouter un collaborateur</summary><form id="newEmployeeForm" class="manager-team-form"><input name="employeeCode" placeholder="Matricule *" required><input name="firstName" placeholder="Prénom *" required><input name="lastName" placeholder="Nom"><select name="roleCode"><option value="FLOOR">Surface</option><option value="CASHIER">Caisse</option><option value="MANAGER">Responsable</option><option value="OTHER">Autre</option></select><select name="contractType"><option>CDI</option><option>CDD</option><option>INTERIM</option><option>STAGE</option><option>PRESTATAIRE</option></select><label>Début contrat<input name="contractStart" type="date" value="${date}" required></label><button class="btn brand" type="submit">Créer le collaborateur</button></form></details>
   <details><summary>+ Créer un shift</summary><form id="newShiftForm" class="manager-team-form"><select name="employeeId" required>${employeeOptions()}</select><label>Date<input name="shiftDate" type="date" value="${date}" required></label><label>Début<input name="startTime" type="time" value="08:00" required></label><label>Fin<input name="endTime" type="time" value="16:00" required></label><button class="btn brand" type="submit">Créer le shift</button></form></details>
   <details><summary>+ Affecter un objectif</summary><form id="newObjectiveForm" class="manager-team-form"><select name="employeeId">${employeeOptions()}</select><input name="title" placeholder="Objectif *" required><input name="targetValue" type="number" step="0.01" placeholder="Cible"><input name="unit" placeholder="Unité : %, DH, contrôles…"><label>Du<input name="periodStart" type="date" value="${date}" required></label><label>Au<input name="periodEnd" type="date" value="${date}" required></label><button class="btn brand" type="submit">Affecter</button></form></details>
  </section>

  <section class="manager-team-section"><div class="manager-team-section-head"><div><h3>Planning aujourd’hui</h3><span>Publiez le planning avant le pointage.</span></div><button class="btn ghost" data-manager-go="staffing">Pointage →</button></div><div class="manager-shift-list">${teamData.shifts?.length?teamData.shifts.map(shiftCard).join(''):'<div class="manager-team-empty">Aucun shift aujourd’hui.</div>'}</div></section>
  <section class="manager-team-section"><div class="manager-team-section-head"><div><h3>Collaborateurs</h3><span>Les fins de contrat conservent tout l’historique.</span></div></div><div class="manager-team-list">${teamData.employees?.length?teamData.employees.map(employeeCard).join(''):'<div class="manager-team-empty">Aucun collaborateur actif.</div>'}</div></section>
  <section class="manager-team-section"><div class="manager-team-section-head"><div><h3>Objectifs actifs</h3><span>Individuels, rôle ou magasin.</span></div></div><div class="manager-objective-list">${teamData.objectives?.length?teamData.objectives.map(objectiveCard).join(''):'<div class="manager-team-empty">Aucun objectif actif.</div>'}</div></section>
 </div>`;
 bindTeam()
}

function formObject(form){return Object.fromEntries(new FormData(form).entries())}
function bindTeam(){
 $('#newEmployeeForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await api(`/api/stores/${app.storeId}/employees`,{method:'POST',body:JSON.stringify(formObject(e.currentTarget))});toast('Collaborateur créé.');renderManagerTeam()}catch(err){toast(err.message)}});
 $('#newShiftForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await api(`/api/stores/${app.storeId}/shifts`,{method:'POST',body:JSON.stringify(formObject(e.currentTarget))});toast('Shift créé en brouillon.');renderManagerTeam()}catch(err){toast(err.message)}});
 $('#newObjectiveForm')?.addEventListener('submit',async e=>{e.preventDefault();try{const b=formObject(e.currentTarget);if(b.targetValue==='')delete b.targetValue;await api(`/api/stores/${app.storeId}/objectives`,{method:'POST',body:JSON.stringify(b)});toast('Objectif affecté.');renderManagerTeam()}catch(err){toast(err.message)}});
 document.querySelectorAll('[data-publish-shift]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/api/shifts/${b.dataset.publishShift}/status`,{method:'POST',body:JSON.stringify({status:'PUBLISHED'})});toast('Shift publié.');renderManagerTeam()}catch(err){toast(err.message)}}));
 document.querySelectorAll('[data-end-employee]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Mettre fin au contrat ? Les shifts futurs seront annulés mais l’historique sera conservé.'))return;try{await api(`/api/employees/${b.dataset.endEmployee}/end`,{method:'POST',body:JSON.stringify({endDate:today(),reason:'Fin de contrat enregistrée par le Responsable magasin'})});toast('Fin de contrat enregistrée.');renderManagerTeam()}catch(err){toast(err.message)}}))
}

import { api } from '../api.js';
import { app,canManage,isDirector } from '../state.js';
import { $,esc,status,toast } from '../ui.js';

let cfg=null;
const STATE={PENDING:['À contrôler','neutral'],MISMATCH:['Non conforme','danger'],READY:['Conforme','ok']};
const dayState={NOT_STARTED:['À démarrer','neutral'],PREPARING:['Contrôle en cours','warn'],READY:['Froid conforme','ok'],OPENED:['Ouverture validée','ok']};

export async function renderColdChain(){
 const [config,data]=await Promise.all([api('/api/cold-chain/config'),api(`/api/stores/${app.storeId}/cold-chain`)]);cfg=config;const d=data.day,s=data.summary||{},locked=d?.status==='OPENED',ds=dayState[s.status]||[s.status,'neutral'];
 $('#coldChainContent').innerHTML=`
  <div class="grid g4 cold-kpis">
   <div class="card"><div class="label">Zones conformes</div><div class="kpi">${s.ready||0}/${s.lines||0}</div><div class="small muted">avant ouverture</div></div>
   <div class="card"><div class="label">À contrôler</div><div class="kpi">${s.pending||0}</div><div class="small muted">relevé initial manquant</div></div>
   <div class="card"><div class="label">Hors tolérance</div><div class="kpi">${s.mismatch||0}</div><div class="small muted">bloque(nt) l’ouverture</div></div>
   <div class="card"><div class="label">Incidents liés</div><div class="kpi">${s.openIncidents||0}</div><div class="small muted">preuve/action à clôturer</div></div>
  </div>
  <div class="card cold-head" style="margin-top:14px"><div class="row"><div><strong>Chaîne du froid · ouverture</strong><div class="small muted">Relevés terrain StoreOps. Les plages sont pilotées au niveau réseau.</div></div>${status(ds[0],ds[1])}</div><div class="cold-rule-strip"><span>Température dans la plage</span><span>Porte / fermeture conforme</span><span>Recontrôle après correction si NOK</span><span>Preuve obligatoire sur incident</span></div></div>
  ${!canManage()?'<div class="banner ban-info" style="margin-top:14px"><strong>Lecture seule.</strong> Les contrôles sont réservés au Responsable magasin et à la Direction.</div>':''}
  <div class="cold-grid">${(d?.lines||[]).map(x=>zoneCard(x,locked)).join('')}</div>
  ${isDirector()?profilePanel(config.profiles):''}`;
 bind();
}
function t(v){return v==null?'—':`${Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1})} °C`}
function zoneCard(x,locked){const p=x.profile||{},st=STATE[x.status]||[x.status,'neutral'],incident=x.incident,openIncident=incident?.status==='OPEN';return`<article class="card cold-card ${x.status==='MISMATCH'?'has-error':x.status==='READY'?'is-ready':''}">
 <div class="row"><div><div class="label">${esc(x.device_code)}</div><strong>${esc(p.label||x.profile_code)}</strong></div>${status(st[0],st[1])}</div>
 <div class="cold-range"><span>Plage attendue</span><strong>${t(p.temp_min)} → ${t(p.temp_max)}</strong></div>
 <div class="cold-readings"><div><span>1er relevé</span><strong>${t(x.first_temp)}</strong></div><div><span>Recontrôle</span><strong>${t(x.second_temp)}</strong></div></div>
 ${x.status==='READY'&&openIncident?`<div class="banner ban-danger compact"><strong>Température revenue conforme</strong><span>L’incident reste bloquant jusqu’à clôture de l’action corrective et ajout de la preuve.</span></div>`:''}
 ${x.status==='MISMATCH'?`<div class="banner ban-danger compact"><strong>Anomalie froid</strong><span>Corrige la cause, attends la stabilisation puis réalise un second relevé.</span></div>`:''}
 ${canManage()&&!locked?controlForm(x):''}
 <div class="cold-footer"><div class="small muted">${x.checked_by_name?`1er contrôle · ${esc(x.checked_by_name)}`:'Pas encore contrôlé'}${x.rechecked_by_name?` · recontrôle ${esc(x.rechecked_by_name)}`:''}</div>${x.incident_id?`<button class="btn soft" data-open-incident="${x.incident_id}">${openIncident?'Traiter l’incident':'Voir l’incident'}</button>`:''}</div>
 </article>`}
function controlForm(x){const recheck=x.status==='MISMATCH'||(x.first_temp!=null&&x.incident?.status==='OPEN');const value=recheck?(x.second_temp??x.first_temp??''):(x.first_temp??'');return`<div class="cold-form">
 <div class="form-grid"><div class="field"><label>${recheck?'Température de recontrôle':'Température relevée'} *</label><input type="number" step="0.1" data-cold-temp="${x.id}" value="${value}"></div><label class="cold-check"><input type="checkbox" data-cold-door="${x.id}" ${Number(x.door_ok)===1?'checked':''}><span>Porte / fermeture conforme</span></label></div>
 ${recheck?`<label class="cold-check maintenance"><input type="checkbox" data-cold-maint="${x.id}" ${Number(x.maintenance_signaled)===1?'checked':''}><span>Maintenance signalée / intervention demandée si nécessaire</span></label>`:''}
 <div class="field"><label>Note</label><input data-cold-note="${x.id}" value="${esc(x.note||'')}" placeholder="Cause constatée, action terrain, heure de stabilisation..."></div>
 <button class="btn ${recheck?'brand':'soft'} wide" data-cold-action="${x.id}" data-recheck="${recheck?'1':'0'}">${recheck?'Valider le recontrôle':'Enregistrer le relevé'}</button>
 </div>`}
function profilePanel(profiles){return`<details class="card" style="margin-top:14px"><summary><strong>Référentiel froid réseau</strong> · Direction</summary><div class="cold-profile-list">${profiles.map(p=>`<div class="cold-profile-row"><div><strong>${esc(p.label)}</strong><div class="small muted">${esc(p.device_code)} · ${esc(p.code)}</div></div><div class="field"><label>Min °C</label><input type="number" step="0.1" data-cold-min="${p.code}" value="${p.temp_min}"></div><div class="field"><label>Max °C</label><input type="number" step="0.1" data-cold-max="${p.code}" value="${p.temp_max}"></div><button class="btn soft" data-save-cold-profile="${p.code}">Enregistrer</button></div>`).join('')}</div></details>`}
function value(sel,id){return document.querySelector(`[${sel}="${id}"]`)?.value}
function checked(sel,id){return !!document.querySelector(`[${sel}="${id}"]`)?.checked}
function bind(){
 document.querySelectorAll('[data-cold-action]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.coldAction,recheck=b.dataset.recheck==='1',payload={temperature:Number(value('data-cold-temp',id)),doorOk:checked('data-cold-door',id),note:value('data-cold-note',id)||''};if(recheck)payload.maintenanceSignaled=checked('data-cold-maint',id);try{await api(`/api/cold-chain/lines/${id}/${recheck?'recheck':'check'}`,{method:'POST',body:JSON.stringify(payload)});toast(recheck?'Recontrôle froid conforme.':'Relevé froid conforme.');renderColdChain()}catch(e){toast(Array.isArray(e.details)&&e.details.length?e.details.join(' · '):e.message);renderColdChain()}}));
 document.querySelectorAll('[data-save-cold-profile]').forEach(b=>b.addEventListener('click',async()=>{const code=b.dataset.saveColdProfile;try{await api(`/api/cold-chain/profiles/${code}`,{method:'PUT',body:JSON.stringify({tempMin:Number(value('data-cold-min',code)),tempMax:Number(value('data-cold-max',code))})});toast('Plage température réseau mise à jour.');renderColdChain()}catch(e){toast(e.message)}}));
}

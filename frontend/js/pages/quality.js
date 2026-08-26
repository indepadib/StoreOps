import{api}from'../api.js';
import{app,isDirector}from'../state.js';
import{$,status,esc,toast}from'../ui.js';

export async function renderQuality(){
  const rows=await api(`/api/stores/${app.storeId}/quality`);
  const profiles=await api('/api/quality-profiles');
  const sla=isDirector()?await api('/api/sla-policies'):[];
  const nok=rows.filter(x=>x.decision!=='ACCEPT').length,rej=rows.reduce((s,x)=>s+Number(x.rejected_qty||0),0),temp=rows.filter(x=>x.temperature_status==='NOK').length,acceptance=rows.length?Math.round((rows.filter(x=>x.decision==='ACCEPT').length/rows.length)*100):100;
  const byFamily=aggregate(rows,'category'),byContext=aggregate(rows,'context');
  $('#qualityContent').innerHTML=`
  <div class="grid g4">
    <div class="card"><div class="label">Contrôles</div><div class="kpi">${rows.length}</div><div class="small muted">historisés</div></div>
    <div class="card"><div class="label">Conformité</div><div class="kpi">${acceptance}%</div><div class="small muted">contrôles acceptés</div></div>
    <div class="card"><div class="label">Qté refusée</div><div class="kpi">${rej}</div><div class="small muted">unités / kg selon article</div></div>
    <div class="card"><div class="label">Temp. NOK</div><div class="kpi">${temp}</div><div class="small muted">écarts chaîne du froid</div></div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><div class="row"><div><strong>Qualité par famille</strong><div class="small muted">Où se concentrent les non-conformités.</div></div></div>${metricTable(byFamily)}</div>
    <div class="card"><div class="row"><div><strong>Qualité par contexte</strong><div class="small muted">Réception, rayon, réserve, contrôle ponctuel…</div></div></div>${metricTable(byContext)}</div>
  </div>
  <div class="network-section-title"><div><strong>Référentiel de contrôle</strong><span>${isDirector()?'Paramètres réseau modifiables par la Direction.':'Normes réseau appliquées automatiquement par StoreOps.'}</span></div></div>
  <div class="quality-profile-grid">${profiles.map((p,i)=>profileCard(p,i)).join('')}</div>
  ${isDirector()?slaSection(sla):''}
  <div class="network-section-title"><div><strong>Historique des contrôles</strong><span>Détail article par article.</span></div><span class="pill">${rows.length}</span></div>
  <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Article</th><th>Contexte</th><th>Famille</th><th>Livré</th><th>Accepté</th><th>Refusé</th><th>Temp.</th><th>Décision</th><th>Auteur</th></tr></thead><tbody>${rows.map(q=>`<tr><td><strong>${esc(q.product_name)}</strong><div class="small muted">${esc(q.ean)}</div></td><td>${esc(q.context)}${q.po_number?' · '+esc(q.po_number):''}</td><td>${esc(q.category||'Autre')}</td><td>${q.delivered_qty}</td><td>${q.accepted_qty}</td><td>${q.rejected_qty}</td><td>${q.temperature??'—'}</td><td>${status(q.decision==='ACCEPT'?'Accepté':q.decision==='PARTIAL'?'Partiel':'Refusé',q.decision==='ACCEPT'?'ok':q.decision==='PARTIAL'?'warn':'danger')}</td><td>${esc(q.controlled_by_name)}</td></tr>`).join('')||'<tr><td colspan="9"><div class="empty">Aucun contrôle.</div></td></tr>'}</tbody></table></div></div>`;
  bindGovernance();
}

function aggregate(rows,key){const map=new Map();for(const r of rows){const k=r[key]||'Autre',x=map.get(k)||{label:k,controls:0,nok:0,rejected:0};x.controls++;if(r.decision!=='ACCEPT')x.nok++;x.rejected+=Number(r.rejected_qty||0);map.set(k,x)}return[...map.values()].sort((a,b)=>b.nok-a.nok||b.rejected-a.rejected||b.controls-a.controls)}
function metricTable(rows){return rows.length?`<div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>Segment</th><th>Contrôles</th><th>NC</th><th>Refus</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.label)}</strong></td><td>${x.controls}</td><td>${x.nok}</td><td>${x.rejected}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty compact">Pas encore assez de données.</div>'}

function profileCard(p,i){
  const temp=p.temperature_required?`${p.temp_min??'—'} à ${p.temp_max??'—'} °C`:'Non requise';
  return`<div class="card quality-profile-card" data-profile-card="${i}"><div class="row"><div><div class="label">${esc(p.category)}</div><strong>${esc(p.label)}</strong></div>${status(p.active?'Actif':'Inactif',p.active?'ok':'neutral')}</div>
  <div class="profile-rules"><div><span>Température</span><strong>${esc(temp)}</strong></div><div><span>Conditionnement</span><strong>${p.packaging_required?'Obligatoire':'Selon besoin'}</strong></div><div><span>Aspect / fraîcheur</span><strong>${p.appearance_required?'Obligatoire':'Selon besoin'}</strong></div><div><span>DLC</span><strong>${p.expiry_required?'Obligatoire':'Selon besoin'}</strong></div><div><span>Lot</span><strong>${p.lot_required?'Obligatoire':'Selon besoin'}</strong></div><div><span>Photo si NC</span><strong>${p.photo_on_nonconform?'Oui':'Non'}</strong></div></div>
  ${isDirector()?`<details class="governance-editor"><summary>Modifier ce référentiel</summary><div class="form-grid" style="margin-top:10px"><div class="field full"><label>Libellé</label><input data-qf="label" value="${esc(p.label)}"></div><div class="field"><label>Température obligatoire</label><input data-qf="temperatureRequired" type="checkbox" ${p.temperature_required?'checked':''}></div><div class="field"><label>Min °C</label><input data-qf="tempMin" type="number" step="0.1" value="${p.temp_min??''}"></div><div class="field"><label>Max °C</label><input data-qf="tempMax" type="number" step="0.1" value="${p.temp_max??''}"></div><div class="field"><label>Conditionnement</label><input data-qf="packagingRequired" type="checkbox" ${p.packaging_required?'checked':''}></div><div class="field"><label>Aspect / fraîcheur</label><input data-qf="appearanceRequired" type="checkbox" ${p.appearance_required?'checked':''}></div><div class="field"><label>DLC</label><input data-qf="expiryRequired" type="checkbox" ${p.expiry_required?'checked':''}></div><div class="field"><label>Lot</label><input data-qf="lotRequired" type="checkbox" ${p.lot_required?'checked':''}></div><div class="field"><label>Photo si non conforme</label><input data-qf="photoOnNonconform" type="checkbox" ${p.photo_on_nonconform?'checked':''}></div><div class="field"><label>Profil actif</label><input data-qf="active" type="checkbox" ${p.active?'checked':''}></div></div><button class="btn brand" style="margin-top:10px" data-save-profile="${encodeURIComponent(p.category)}">Enregistrer le référentiel</button></details>`:''}</div>`;
}

function slaSection(rows){return`<div class="network-section-title"><div><strong>SLA incidents</strong><span>Délais réseau utilisés pour les échéances et escalades automatiques.</span></div></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Criticité</th><th>1re réponse</th><th>Résolution</th><th>Escalade Direction</th><th>Actif</th><th></th></tr></thead><tbody>${rows.map((p,i)=>`<tr data-sla-row="${i}"><td>${status(p.criticality,p.criticality==='CRITICAL'?'danger':p.criticality==='HIGH'?'warn':'neutral')}</td><td><input data-sla="response" type="number" min="1" value="${p.response_minutes}" style="width:90px"> min</td><td><input data-sla="resolution" type="number" min="1" value="${p.resolution_minutes}" style="width:90px"> min</td><td><input data-sla="escalation" type="number" min="1" value="${p.escalation_minutes}" style="width:90px"> min</td><td><input data-sla="active" type="checkbox" ${p.active?'checked':''}></td><td><button class="btn soft" data-save-sla="${p.criticality}">Enregistrer</button></td></tr>`).join('')}</tbody></table></div></div>`}

function bindGovernance(){
  if(!isDirector())return;
  document.querySelectorAll('[data-save-profile]').forEach(btn=>btn.addEventListener('click',async()=>{try{const card=btn.closest('[data-profile-card]'),get=n=>card.querySelector(`[data-qf="${n}"]`),num=n=>get(n).value===''?null:Number(get(n).value),payload={label:get('label').value.trim(),temperatureRequired:get('temperatureRequired').checked,tempMin:num('tempMin'),tempMax:num('tempMax'),packagingRequired:get('packagingRequired').checked,appearanceRequired:get('appearanceRequired').checked,expiryRequired:get('expiryRequired').checked,lotRequired:get('lotRequired').checked,photoOnNonconform:get('photoOnNonconform').checked,active:get('active').checked};await api(`/api/quality-profiles/${btn.dataset.saveProfile}`,{method:'PUT',body:JSON.stringify(payload)});toast('Référentiel qualité mis à jour pour tout le réseau.');await renderQuality()}catch(e){toast(e.message)}}));
  document.querySelectorAll('[data-save-sla]').forEach(btn=>btn.addEventListener('click',async()=>{try{const row=btn.closest('[data-sla-row]'),get=n=>row.querySelector(`[data-sla="${n}"]`),payload={responseMinutes:Number(get('response').value),resolutionMinutes:Number(get('resolution').value),escalationMinutes:Number(get('escalation').value),active:get('active').checked};await api(`/api/sla-policies/${btn.dataset.saveSla}`,{method:'PUT',body:JSON.stringify(payload)});toast('Politique SLA mise à jour.');await renderQuality()}catch(e){toast(e.message)}}));
}

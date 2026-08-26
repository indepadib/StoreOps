import{api}from'../api.js';
import{app,isDirector}from'../state.js';
import{$,status,esc}from'../ui.js';

const PROFILE_CATEGORIES=['Frais','Surgelé','F&L','Épicerie','Autre'];

export async function renderQuality(){
  const rows=await api(`/api/stores/${app.storeId}/quality`);
  const profiles=await Promise.all(PROFILE_CATEGORIES.map(async c=>{try{return await api(`/api/quality-profiles/${encodeURIComponent(c)}`)}catch{return null}}));
  const nok=rows.filter(x=>x.decision!=='ACCEPT').length,rej=rows.reduce((s,x)=>s+Number(x.rejected_qty||0),0),temp=rows.filter(x=>x.temperature_status==='NOK').length;
  const acceptance=rows.length?Math.round((rows.filter(x=>x.decision==='ACCEPT').length/rows.length)*100):100;
  const byFamily=aggregate(rows,'category');
  const byContext=aggregate(rows,'context');
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
  <div class="network-section-title"><div><strong>Référentiel de contrôle</strong><span>${isDirector()?'Vue Direction · les seuils sont appliqués automatiquement par le backend.':'Seuils appliqués automatiquement à chaque contrôle.'}</span></div></div>
  <div class="quality-profile-grid">${profiles.filter(Boolean).map(profileCard).join('')}</div>
  <div class="network-section-title"><div><strong>Historique des contrôles</strong><span>Détail article par article.</span></div><span class="pill">${rows.length}</span></div>
  <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Article</th><th>Contexte</th><th>Famille</th><th>Livré</th><th>Accepté</th><th>Refusé</th><th>Temp.</th><th>Décision</th><th>Auteur</th></tr></thead><tbody>${rows.map(q=>`<tr><td><strong>${esc(q.product_name)}</strong><div class="small muted">${esc(q.ean)}</div></td><td>${esc(q.context)}${q.po_number?' · '+esc(q.po_number):''}</td><td>${esc(q.category||'Autre')}</td><td>${q.delivered_qty}</td><td>${q.accepted_qty}</td><td>${q.rejected_qty}</td><td>${q.temperature??'—'}</td><td>${status(q.decision==='ACCEPT'?'Accepté':q.decision==='PARTIAL'?'Partiel':'Refusé',q.decision==='ACCEPT'?'ok':q.decision==='PARTIAL'?'warn':'danger')}</td><td>${esc(q.controlled_by_name)}</td></tr>`).join('')||'<tr><td colspan="9"><div class="empty">Aucun contrôle.</div></td></tr>'}</tbody></table></div></div>`;
}

function aggregate(rows,key){
  const map=new Map();
  for(const r of rows){const k=r[key]||'Autre',x=map.get(k)||{label:k,controls:0,nok:0,rejected:0};x.controls++;if(r.decision!=='ACCEPT')x.nok++;x.rejected+=Number(r.rejected_qty||0);map.set(k,x)}
  return [...map.values()].sort((a,b)=>b.nok-a.nok||b.rejected-a.rejected||b.controls-a.controls);
}
function metricTable(rows){return rows.length?`<div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>Segment</th><th>Contrôles</th><th>NC</th><th>Refus</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${esc(x.label)}</strong></td><td>${x.controls}</td><td>${x.nok}</td><td>${x.rejected}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty compact">Pas encore assez de données.</div>'}
function profileCard(p){const temp=p.temperature_required?`${p.temp_min??'—'} à ${p.temp_max??'—'} °C`:'Non requise';return`<div class="card quality-profile-card"><div class="row"><div><div class="label">${esc(p.category)}</div><strong>${esc(p.label)}</strong></div>${status(p.active?'Actif':'Inactif',p.active?'ok':'neutral')}</div><div class="profile-rules"><div><span>Température</span><strong>${esc(temp)}</strong></div><div><span>Conditionnement</span><strong>${p.packaging_required?'Obligatoire':'Selon besoin'}</strong></div><div><span>Aspect / fraîcheur</span><strong>${p.appearance_required?'Obligatoire':'Selon besoin'}</strong></div><div><span>DLC</span><strong>${p.expiry_required?'Obligatoire':'Selon besoin'}</strong></div><div><span>Photo si NC</span><strong>${p.photo_on_nonconform?'Oui':'Non'}</strong></div></div></div>`}

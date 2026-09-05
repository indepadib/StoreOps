import{api}from'../api.js';
import{app,canManage,isDirector}from'../state.js';
import{$,status,esc,toast}from'../ui.js';

let cfg=null,data=null,scanCtx=null;
const actionLabel=x=>cfg?.actionTypes?.find(a=>a.code===x)?.label||x;
const signageLabel=x=>cfg?.signageActions?.find(a=>a.code===x)?.label||x;
const priKind=x=>x==='CRITICAL'?'danger':x==='HIGH'?'warn':'neutral';
const stateKind=x=>x==='VERIFIED'?'ok':x==='MISMATCH'?'danger':'warn';
const stateLabel=x=>({PENDING:'À vérifier',MISMATCH:'Écart détecté',VERIFIED:'Vérifié'}[x]||x);
const money=v=>v==null?'—':Number(v).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2})+' DH';
const dt=v=>v?new Date(String(v).replace(' ','T')+'Z').toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';

export async function renderCommercial(){
 cfg=await api('/api/commercial/config');
 data=await api(`/api/stores/${app.storeId}/commercial`);
 const s=data.summary||{},rows=data.items||[];
 $('#commercialContent').innerHTML=`
   ${data.sync&&!data.sync.ok?`<div class="banner ban-danger"><strong>Flux Dynamics prix/promos indisponible.</strong><div class="small">${esc(data.sync.error||'Mapping requis')}</div></div>`:''}
   ${canManage()?priceCheckCard():''}
   <div class="grid g4" style="margin-top:14px">
    ${kpi('Actions du jour',s.total||0,'issues de Dynamics')}
    ${kpi('À vérifier',s.pending||0,'avant ouverture',s.pending?'warn':'')}
    ${kpi('Écarts',s.mismatch||0,'correction + preuve',s.mismatch?'danger':'')}
    ${kpi('Prêt commercial',`${s.readiness??100}%`,`${s.verified||0}/${s.total||0} vérifiées`,s.blocking?'warn':'')}
   </div>
   <div class="card commercial-readiness" style="margin-top:14px">
     <div class="row"><div><strong>Exécution commerciale du jour</strong><div class="small muted">Prix rayon, signalétique et exécution physique sont contrôlés par rapport au snapshot Dynamics.</div></div>${status(s.blocking?`${s.blocking} bloquante(s)`:'Prêt ouverture',s.blocking?'danger':'ok')}</div>
     ${canManage()?`<button class="btn soft" id="syncCommercialBtn" style="margin-top:10px">Rafraîchir depuis Dynamics</button>`:''}
   </div>
   <div class="commercial-list" style="margin-top:12px">${rows.length?rows.map(controlCard).join(''):'<div class="card empty">Aucun changement prix/promo pour cette journée.</div>'}</div>
   ${isDirector()?policyCard():''}
 `;
 bindCommercial();
}

function priceCheckCard(){const showcase=!!app.showcase;return`<section class="card" style="margin-bottom:14px"><div class="row"><div><strong>Contrôle prix rayon par scan</strong><div class="small muted">${showcase?'Mode démonstration : simulation du parcours scan → écart → incident → correction.':'Scanner l’EAN → StoreOps récupère le prix et la promo Dynamics → comparer au rayon.'}</div></div>${status(showcase?'MVP SHOWCASE':'LIVE D365',showcase?'neutral':'ok')}</div><div class="form-grid" style="margin-top:10px"><div class="field full"><label>EAN / code-barres</label><div class="row"><input id="priceCheckEan" inputmode="numeric" autocomplete="off" placeholder="Scanner ou saisir le code-barres" style="flex:1"><button class="btn brand" id="priceCheckLookup">Rechercher</button></div></div></div><div id="priceCheckResult" style="margin-top:10px"></div></section>`}
function priceCheckResult(c){
 const promo=c.promoLabel?`<div class="commercial-promo"><span>Promotion applicable</span><strong>${esc(c.promoLabel)}</strong></div>`:'<div class="banner ban-info"><strong>Aucune promotion active applicable.</strong></div>';
 const correction=c.openIncident?`<div class="banner ban-danger" style="margin-top:10px"><strong>Incident de prix ouvert à corriger</strong><div class="small" style="margin-top:4px">${esc(c.openIncident.title)} · Un nouveau contrôle conforme + une photo sont obligatoires pour clôturer.</div></div>`:'';
 const evidence=c.openIncident?`<div class="field full"><label>Photo de preuve après correction *</label><input id="priceCheckEvidence" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><div class="small muted">Photo du prix / étiquette / signalétique corrigée. JPG, PNG ou WEBP.</div></div>`:'';
 return`<div class="card" style="box-shadow:none"><div class="row"><div><div class="small muted">${esc(c.product.productNumber)} · ${esc(c.product.category||'')}</div><h3>${esc(c.product.name)}</h3><div class="small muted">EAN ${esc(c.ean)}</div></div><div>${status(money(c.expectedUnitPrice),'ok')}</div></div><div class="commercial-grid"><div><span>Prix fiche</span><strong>${money(c.basePrice?.price)}</strong></div><div><span>Prix unitaire attendu</span><strong>${money(c.expectedUnitPrice)}</strong></div><div><span>Stock</span><strong>${c.product.stock??'—'}</strong></div><div><span>Disponible</span><strong>${c.product.availableStock??'—'}</strong></div></div>${promo}${correction}<div class="form-grid" style="margin-top:10px"><div class="field"><label>Prix constaté rayon *</label><input id="priceCheckObserved" type="number" min="0" step="0.01" placeholder="${c.expectedUnitPrice??''}"></div><div class="field"><label>Signalétique conforme *</label><select id="priceCheckSignage"><option value="">— Choisir —</option><option value="true">Oui</option><option value="false">Non</option></select></div><div class="field"><label>Exécution rayon conforme *</label><select id="priceCheckExecution"><option value="">— Choisir —</option><option value="true">Oui</option><option value="false">Non</option></select></div>${evidence}</div><button class="btn brand" id="priceCheckSubmit" style="margin-top:10px">${c.openIncident?'Valider la correction et clôturer':'Valider le contrôle'}</button><div class="small muted" style="margin-top:6px">${c.openIncident?'La clôture n’est possible que si le nouveau scan est conforme et la preuve photo enregistrée.':'En cas d’écart, StoreOps crée automatiquement un incident avec preuve obligatoire.'}</div></div>`;
}
function kpi(label,value,sub,type=''){return`<div class="card ${type==='danger'?'commercial-kpi-danger':type==='warn'?'commercial-kpi-warn':''}"><div class="label">${esc(label)}</div><div class="kpi">${value}</div><div class="small muted">${esc(sub)}</div></div>`}
function controlCard(c){
 const expectedAction=c.action_type==='PROMO_END'?'Retirer l’ancienne promo':c.action_type==='PROMO_START'?'Installer la nouvelle promo':c.action_type==='PRICE_CHANGE'?'Mettre le nouveau prix':'Vérifier le rayon';
 const incidentOpen=c.incident&&c.incident.status==='OPEN';
 return`<article class="card commercial-card ${c.status==='MISMATCH'?'commercial-mismatch':''}"><div class="row"><div><div class="small muted">${esc(actionLabel(c.action_type))} · ${esc(c.category||'')}</div><h3>${esc(c.product_name)}</h3><div class="small muted">${esc(c.ean)}${c.product_number?' · '+esc(c.product_number):''}</div></div><div class="row">${status(c.priority,priKind(c.priority))}${status(stateLabel(c.status),stateKind(c.status))}</div></div><div class="commercial-grid"><div><span>Ancien prix</span><strong>${money(c.old_price)}</strong></div><div><span>Prix attendu</span><strong>${money(c.expected_price)}</strong></div><div><span>Signalétique</span><strong>${esc(signageLabel(c.signage_action))}</strong></div><div><span>Action rayon</span><strong>${esc(expectedAction)}</strong></div></div>${c.promo_label?`<div class="commercial-promo"><span>Information promo</span><strong>${esc(c.promo_label)}</strong></div>`:''}${c.issues?.length?`<div class="banner ban-danger"><strong>Écart détecté</strong><div class="small" style="margin-top:4px">${c.issues.map(esc).join('<br>')}</div></div>`:''}${c.status==='VERIFIED'?`<div class="banner ban-info"><strong>Contrôle terrain conforme.</strong> ${esc(c.controlled_by_name||'')} · ${dt(c.controlled_at)}${incidentOpen?' · L’incident initial reste à clôturer avec sa preuve.':''}</div>`:''}${incidentOpen?`<button class="btn soft" data-open-incident="${c.incident.id}" style="margin-top:9px">Ouvrir l’incident lié</button>`:''}${canManage()?controlForm(c):''}</article>`}
function controlForm(c){return`<details class="commercial-control" ${c.status!=='VERIFIED'?'open':''}><summary>${c.status==='MISMATCH'?'Corriger et recontrôler':c.status==='VERIFIED'?'Recontrôler':'Effectuer le contrôle'}</summary><div class="form-grid" style="margin-top:9px">${c.expected_price!=null?`<div class="field"><label>Prix constaté en rayon *</label><input data-commercial-price="${c.id}" type="number" min="0" step="0.01" value="${c.observed_price??''}" placeholder="${c.expected_price}"></div>`:''}<div class="field"><label>Signalétique conforme *</label><select data-commercial-signage="${c.id}"><option value="">— Choisir —</option><option value="true" ${Number(c.signage_ok)===1?'selected':''}>Oui</option><option value="false" ${Number(c.signage_ok)===0?'selected':''}>Non</option></select></div><div class="field"><label>Exécution rayon conforme *</label><select data-commercial-execution="${c.id}"><option value="">— Choisir —</option><option value="true" ${Number(c.execution_ok)===1?'selected':''}>Oui</option><option value="false" ${Number(c.execution_ok)===0?'selected':''}>Non</option></select></div><div class="field full"><label>Note</label><input data-commercial-note="${c.id}" value="${esc(c.note||'')}" placeholder="Correction, emplacement, remarque…"></div></div><button class="btn brand" data-commercial-submit="${c.id}" style="margin-top:9px">Valider le contrôle</button></details>`}
function policyCard(){return`<div class="network-section-title"><div><strong>Politique de contrôle prix</strong><span>Tolérance réseau utilisée pour comparer le prix rayon au prix attendu.</span></div></div><div class="card"><div class="row"><div class="field" style="max-width:240px"><label>Tolérance prix (DH)</label><input id="commercialTolerance" type="number" min="0" max="1" step="0.01" value="${cfg.policy.price_tolerance}"></div><button class="btn soft" id="saveCommercialPolicy">Enregistrer</button></div></div>`}
function bindCommercial(){
 $('#syncCommercialBtn')?.addEventListener('click',sync);$('#saveCommercialPolicy')?.addEventListener('click',savePolicy);$('#priceCheckLookup')?.addEventListener('click',lookupPrice);$('#priceCheckEan')?.addEventListener('keydown',e=>{if(e.key==='Enter')lookupPrice()});
 document.querySelectorAll('[data-commercial-submit]').forEach(b=>b.addEventListener('click',()=>submit(b.dataset.commercialSubmit)));
}
async function lookupPrice(){try{const ean=$('#priceCheckEan')?.value.trim();if(!ean)throw new Error('Scanne ou saisis un EAN.');scanCtx=await api(`/api/stores/${app.storeId}/price-check/context/${encodeURIComponent(ean)}`);$('#priceCheckResult').innerHTML=priceCheckResult(scanCtx);$('#priceCheckSubmit')?.addEventListener('click',submitPriceCheck)}catch(e){toast(e.message)}}
function fileAsDataUrl(file){return new Promise((resolve,reject)=>{if(!file)return resolve(null);const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Impossible de lire la photo.'));r.readAsDataURL(file)})}
async function submitPriceCheck(){
 const submitBtn=$('#priceCheckSubmit');if(submitBtn?.disabled)return;const hadOpenIncident=!!scanCtx?.openIncident;let originalLabel=null;
 try{
  if(!scanCtx)throw new Error('Article non chargé.');const observed=$('#priceCheckObserved')?.value,sg=$('#priceCheckSignage')?.value,ex=$('#priceCheckExecution')?.value;if(observed===''||sg===''||ex==='')throw new Error('Renseigne prix, signalétique et exécution.');
  const file=$('#priceCheckEvidence')?.files?.[0]||null;if(scanCtx.openIncident&&!file)throw new Error('Ajoute la photo de preuve après correction.');const evidenceDataUrl=await fileAsDataUrl(file);
  if(submitBtn){originalLabel=submitBtn.textContent;submitBtn.disabled=true;submitBtn.textContent='Enregistrement…'}
  const result=await api(`/api/stores/${app.storeId}/price-check`,{method:'POST',body:JSON.stringify({ean:scanCtx.ean,observedPrice:Number(observed),signageOk:sg==='true',executionOk:ex==='true',tolerance:Number(cfg.policy.price_tolerance||0.01),evidenceDataUrl,evidenceFileName:file?.name||null,evidenceCaption:'Preuve après correction prix/promo'})});
  const closed=!!result.incidentResolved;toast(closed?'Correction conforme : incident clôturé.':'Contrôle rayon conforme.');scanCtx=null;$('#priceCheckEan').value='';$('#priceCheckResult').innerHTML=`<div class="banner ban-info price-check-feedback"><strong>${closed?'Correction validée et incident clôturé.':'Contrôle conforme enregistré.'}</strong></div>`;
 }catch(e){
  if(e?.status===409&&scanCtx?.ean){
   const ean=scanCtx.ean;
   try{
    scanCtx=await api(`/api/stores/${app.storeId}/price-check/context/${encodeURIComponent(ean)}`);
    const issues=Array.isArray(e.details)?e.details:[];
    const title=hadOpenIncident?'Écart toujours présent — incident maintenu ouvert.':'Écart enregistré — incident créé.';
    const detail=issues.length?issues.map(esc).join('<br>'):esc(e.message||'Contrôle prix/promo non conforme.');
    $('#priceCheckResult').innerHTML=`<div class="banner ban-danger price-check-feedback" style="margin-bottom:8px"><strong>${title}</strong><div class="small" style="margin-top:4px">${detail}</div></div>${priceCheckResult(scanCtx)}`;
    $('#priceCheckSubmit')?.addEventListener('click',submitPriceCheck);
    toast(hadOpenIncident?'Écart toujours présent.':'Écart enregistré, incident créé.');
    return;
   }catch(refreshError){if(refreshError?.status!==409)e=refreshError}
  }
  document.querySelectorAll('#priceCheckResult .price-check-feedback').forEach(x=>x.remove());
  toast(e.message);$('#priceCheckResult')?.insertAdjacentHTML('beforeend',`<div class="banner ban-danger price-check-feedback" style="margin-top:8px"><strong>Impossible de finaliser le contrôle.</strong><div class="small">${esc(e.message)}</div></div>`)
 }finally{
  const current=$('#priceCheckSubmit');if(current&&current===submitBtn){current.disabled=false;if(originalLabel)current.textContent=originalLabel}
 }
}
async function sync(){try{await api(`/api/stores/${app.storeId}/commercial/sync`,{method:'POST'});toast('Prix et promotions rafraîchis depuis Dynamics.');await renderCommercial()}catch(e){toast(e.message)}}
async function submit(id){try{const price=document.querySelector(`[data-commercial-price="${id}"]`),sg=document.querySelector(`[data-commercial-signage="${id}"]`),ex=document.querySelector(`[data-commercial-execution="${id}"]`),note=document.querySelector(`[data-commercial-note="${id}"]`);if(sg?.value===''||ex?.value==='')throw new Error('Renseigne la signalétique et l’exécution rayon.');await api(`/api/commercial/${id}/control`,{method:'POST',body:JSON.stringify({observedPrice:price?.value===''?null:Number(price?.value),signageOk:sg?.value==='true',executionOk:ex?.value==='true',note:note?.value.trim()||''})});toast('Contrôle prix/promo conforme.');await renderCommercial()}catch(e){toast(e.message);await renderCommercial()}}
async function savePolicy(){try{await api('/api/commercial/policy',{method:'PUT',body:JSON.stringify({priceTolerance:Number($('#commercialTolerance').value)})});toast('Tolérance prix réseau mise à jour.');await renderCommercial()}catch(e){toast(e.message)}}

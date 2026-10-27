import{api}from'./api.js';
import{app,isDirector,isQualityAudit}from'./state.js';
import{esc,toast}from'./ui.js';
import{rawbtLink,isAndroid}from'./rawbt-print.js';

let workspace=null,rules=[];
const money=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' DH';
const qty=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:3});
const date=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('fr-FR'):'—';
const tone=s=>s==='EXPIRED_WITHDRAW'?'danger':s==='ACTION_REQUIRED'?'warn':s==='PROCESSED'?'ok':'neutral';
const stateLabel=s=>({ACTION_REQUIRED:'À traiter',EXPIRED_WITHDRAW:'Retrait obligatoire',NO_MARKDOWN_RULE:'Règle à configurer',PROCESSED:'Traité'}[s]||s||'—');
const jobLabel=s=>({PENDING:'En attente imprimante',PRINTING:'Impression en cours',PRINTED:'Imprimé',FAILED:'Échec'}[s]||s||'—');
const opLabel=s=>({PENDING_APPROVAL:'Approbation requise',APPROVED:'Prêt à imprimer',QUEUED:"File d'impression",PRINTING:'Impression',PRINTED:'Imprimé',APPLIED:'Étiquettes posées'}[s]||s||'—');

function ensureCss(){if(document.getElementById('dlc-markdown-css'))return;const link=document.createElement('link');link.id='dlc-markdown-css';link.rel='stylesheet';link.href='/dlc-markdown.css?v=2405';document.head.appendChild(link)}
function root(){return document.getElementById('dlcMarkdownContent')}
function profile(code){return workspace?.posProfiles?.find(x=>x.markdown_code===code)||null}
function activePrinter(){return (workspace?.printers||[]).find(x=>x.active&&x.is_default)||(workspace?.printers||[]).find(x=>x.active)||null}
function posState(code){const p=profile(code);return p?.validation_state==='VALIDATED'?{ok:true,label:`${code} validé caisse · ${p.symbology}`}:{ok:false,label:`${code} en attente de test caisse réel`}}
function renderKpis(d){
 return `<div class="md-kpis">
  <div><span>Actions aujourd’hui</span><strong>${Number(d.pendingActions||0)}</strong><small>lots à vérifier physiquement</small></div>
  <div><span>Quantité à revoir</span><strong>${qty(d.quantitiesAtRisk||0)}</strong><small>estimation · jamais prise comme stock batch exact</small></div>
  <div><span>MD20 / MD50</span><strong>${qty(d.md20Quantity||0)} / ${qty(d.md50Quantity||0)}</strong><small>selon règles actives</small></div>
  <div><span>Périmés</span><strong>${Number(d.expiredProducts||0)}</strong><small>retrait · aucune impression markdown</small></div>
 </div>`
}
function recommendationCard(r){
 const p=posState(r.markdownCode),expired=r.status==='EXPIRED_WITHDRAW',code=r.markdownCode||'—',allowOverride=isDirector()||isQualityAudit();
 return `<article class="md-action-card md-${tone(r.status)}" data-md-card="${esc(r.id)}">
  <div class="md-card-head"><div class="md-card-title">${r.status==='ACTION_REQUIRED'?`<label class="md-select"><input type="checkbox" data-md-select="${esc(r.id)}"> Sélectionner</label>`:'' }<span class="md-eyebrow">${esc(r.department||'RAYON À QUALIFIER')} · ${esc(r.productNumber||'CODE ARTICLE MANQUANT')}</span><h3>${esc(r.productName)}</h3><small>${r.ean?'EAN '+esc(r.ean)+' · ':''}${r.lotRef?'Lot '+esc(r.lotRef)+' · ':''}${date(r.expiryDate)}</small></div><span class="pill">${esc(stateLabel(r.status))}</span></div>
  <div class="md-facts"><div><span>Échéance</span><strong>${r.daysRemaining==null?'—':r.daysRemaining+' j'}</strong></div><div><span>À vérifier</span><strong>${qty(r.quantityToReview)}</strong><small>${esc(r.quantityConfidence==='ESTIMATE_REQUIRES_PHYSICAL_CONFIRMATION'?'estimation · comptage obligatoire':'dernier comptage connu')}</small></div><div><span>Déjà imprimé</span><strong>${qty(r.alreadyPrintedQuantity)}</strong></div><div><span>Recommandation</span><strong>${esc(code)}${r.discountPercent!=null?' · -'+r.discountPercent+'%':''}</strong></div></div>
  ${expired?'<div class="banner ban-danger"><strong>Produit périmé : retrait de la vente.</strong><span>StoreOps bloque toute génération d’étiquette de démarque.</span></div>':r.status==='NO_MARKDOWN_RULE'?'<div class="banner ban-warn"><strong>Aucune règle applicable.</strong><span>La Direction doit paramétrer le seuil avant de proposer une démarque.</span></div>':`
  <div class="md-execution">
   <label>Quantité physique à étiqueter<input data-md-qty="${esc(r.id)}" type="number" min="1" step="1" max="${Math.max(0,Number(r.quantityToReview||0))}" value="${Math.max(0,Math.floor(Number(r.quantityToReview||0)))}"></label>
   <label>Niveau de démarque<select data-md-code="${esc(r.id)}" ${allowOverride?'':'disabled'}><option value="${esc(code)}">${esc(code)}${r.discountPercent!=null?' · -'+r.discountPercent+'%':''}</option>${allowOverride?['MD20','MD50'].filter(x=>x!==code).map(x=>`<option value="${x}">${x}</option>`).join(''):''}</select></label>
   <button class="btn soft" data-md-preview="${esc(r.id)}">Prévisualiser</button>
  </div>
  <div class="md-pos-state ${p.ok?'ready':'blocked'}"><strong>${p.ok?'POS validé':'Impression verrouillée'}</strong><span>${esc(p.label)}. Le prix sera relu dans Dynamics au moment de la préparation.</span></div>
  <div data-md-preview-host="${esc(r.id)}"></div>`}
 </article>`
}
function labelPreview(data,r){
 const ready=data.printReady,code=data.markdownCode,printer=activePrinter(),theme=code==='MD50'?'md50':'md20';
 return `<div class="md-preview-shell">
  <div class="md-label-preview ${theme}"><div class="md-discount">-${Math.round(Number(data.discountPercent||0))}%</div><strong>${esc(r.productName)}</strong><div><span class="old">${money(data.originalPrice)}</span><span class="new">${money(data.finalPrice)}</span></div><small>DLC ${date(r.expiryDate)}</small><div class="md-barcode-placeholder">${data.symbology?esc(data.symbology):'SYMBOLOGIE NON VALIDÉE'}<strong>${esc(data.barcodeContent||'')}</strong></div></div>
  <div class="md-preview-meta">
   <strong>${ready?'Étiquette prête techniquement':'Impression bloquée'}</strong>
   <p>${data.priceSource==='D365_COMMERCE'?'Prix relu depuis Dynamics Commerce.':'Prix Dynamics indisponible.'} ${data.posValidationState==='VALIDATED'?'Profil code-barres validé.':'Le profil POS doit être validé sur une vraie caisse.'}</p>
   <p>${printer?'Imprimante : '+esc(printer.name)+' · '+printer.media_width_mm+'×'+printer.media_height_mm+' mm.':'Aucune imprimante magasin configurée.'}</p>
   <button class="btn brand" data-md-print-one="${esc(r.id)}" ${ready&&printer?'':'disabled'}>Créer l’opération et imprimer</button>
  </div>
 </div>`
}
function operationsBlock(){
 const ops=workspace?.operations||[];if(!ops.length)return'<div class="small muted">Aucune opération markdown exécutée.</div>';
 return `<div class="md-history-list">${ops.slice(0,30).map(o=>`<div class="md-history-row"><div><strong>${esc(o.product_name)}</strong><small>${esc(o.markdown_code)} · ${qty(o.quantity)} étiquette(s) · ${esc(o.barcode_content)}</small></div><div><span class="pill">${esc(opLabel(o.status))}</span>${o.status==='PRINTED'? `<button class="btn soft" data-md-applied="${esc(o.id)}">Confirmer la pose</button>`:''}</div></div>`).join('')}</div>`
}
function jobsBlock(){
 const jobs=workspace?.jobs||[];if(!jobs.length)return'<div class="small muted">Aucun job d’impression.</div>';
 return `<div class="md-history-list">${jobs.slice(0,20).map(j=>`<div class="md-history-row"><div><strong>${esc(j.printer_protocol==='ZPL_RAWBT'&&j.status==='PRINTING'?'RawBT · sortie à confirmer':jobLabel(j.status))}</strong><small>${j.total_labels} étiquette(s) · ${esc(j.printer_name||'Imprimante')}</small></div><div>${j.printer_protocol==='ZPL_RAWBT'&&j.status==='PENDING'?`<button class="btn brand" data-md-rawbt="${esc(j.id)}">Préparer sur ce PDA</button>`:''}${j.printer_protocol==='ZPL_RAWBT'&&j.status==='PRINTING'?`<button class="btn soft" data-md-confirm="${esc(j.id)}">Confirmer la sortie</button><button class="btn soft" data-md-failed="${esc(j.id)}">Signaler un échec</button>`:''}${j.status==='FAILED'? `<button class="btn soft" data-md-retry="${esc(j.id)}">Remettre en attente après contrôle</button>`:''}</div><div data-md-rawbt-host="${esc(j.id)}"></div></div>`).join('')}</div>`
}
function rulesAdmin(){
 if(!isDirector())return'';
 const printer=activePrinter();
 return `<details class="card md-admin"><summary>Paramétrage Direction · règles, POS & imprimantes</summary>
  <div class="md-admin-grid">
   <section><h4>Nouvelle règle</h4><div class="form-grid">
    <div class="field"><label>Périmètre</label><select id="mdRuleScope"><option value="ALL">Tous les articles</option><option value="CATEGORY">Catégorie / rayon</option><option value="SUBCATEGORY">Sous-catégorie / famille</option><option value="ITEM">Article précis</option></select></div>
    <div class="field"><label>Valeur</label><input id="mdRuleValue" placeholder="Ex. Frais ou HS-002345"></div>
    <div class="field"><label>Magasin</label><select id="mdRuleStore"><option value="">Tous les magasins</option>${(app.stores||[]).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Jours avant échéance</label><input id="mdRuleDays" type="number" min="0" value="7"></div>
    <div class="field"><label>Niveau</label><select id="mdRuleCode"><option>MD20</option><option>MD50</option></select></div>
    <div class="field"><label>Mode</label><select id="mdRuleMode"><option value="RECOMMENDED">Recommandé</option><option value="APPROVAL">Approbation Direction / Qualité</option><option value="AUTOMATIC">Automatique après comptage physique</option></select></div>
    <div class="field"><label>Priorité</label><input id="mdRulePriority" type="number" value="100"></div>
   </div><button class="btn brand" id="mdSaveRule">Enregistrer la règle</button>
   <div class="md-rule-list">${rules.map(r=>`<div><strong>${esc(r.markdown_code)} · J-${r.days_before_expiry}</strong><span>${esc(r.scope_type)} ${esc(r.scope_value||'tous')} · ${esc(r.store_id||'réseau')} · priorité ${r.priority}</span></div>`).join('')||'<small>Aucune règle active : aucune démarque n’est inventée par défaut.</small>'}</div></section>
   <section><h4>Validation caisse</h4>${(workspace.posProfiles||[]).map(p=>`<div class="md-pos-admin"><strong>${esc(p.markdown_code)} · préfixe ${esc(p.prefix)}</strong><span>${p.validation_state==='VALIDATED'?'Validé · '+esc(p.symbology||''):'Test réel Store Commerce requis'}</span>${p.validation_state!=='VALIDATED'? `<input data-pos-note="${esc(p.markdown_code)}" placeholder="Preuve : caisse, date, résultat du scan"><button class="btn soft" data-pos-validate="${esc(p.markdown_code)}">Valider après test CODE128 réussi</button>`:''}</div>`).join('')}</section>
   <section><h4>Imprimante magasin</h4><div class="form-grid"><div class="field"><label>Nom</label><input id="mdPrinterName" value="${esc(printer?.name||'Imprimante DLC')}"></div><div class="field"><label>Clé bridge</label><input id="mdPrinterBridge" value="${esc(printer?.bridge_key||'')}" placeholder="Identifiant local du service d’impression"></div><div class="field"><label>Format</label><input value="60 × 40 mm" disabled></div><div class="field"><label>Technologie</label><select id="mdPrinterProtocol"><option value="ZPL_BRIDGE" ${printer?.protocol==='ZPL_RAWBT'?'':'selected'}>ZPL · relais magasin (PC)</option><option value="ZPL_RAWBT" ${printer?.protocol==='ZPL_RAWBT'?'selected':''}>ZPL · RawBT Bluetooth (Android)</option></select></div></div><button class="btn brand" id="mdSavePrinter">Enregistrer comme imprimante par défaut</button><p class="small muted">RawBT : aucune clé bridge nécessaire. Associer la LNX3 sur chaque PDA et configurer RawBT en ZPL brut. Le relais PC reste disponible en choisissant son mode. Vérifier le format physique 60 × 40 mm et le scan caisse avant usage.</p></section>
  </div>
 </details>`
}
function draw(){
 const host=root();if(!host)return;const recs=workspace?.recommendations||[],alerts=workspace?.alerts||[];
 host.innerHTML=`<section class="md-workspace">
  <div class="md-hero"><div><span class="md-eyebrow">DLC & MARKDOWN · ACTIONS DU JOUR</span><h2>De la date courte à l’étiquette, sans ressaisie.</h2><p>StoreOps recommande. Le collaborateur compte physiquement. Dynamics valide le prix. L’impression n’est autorisée qu’après validation POS.</p></div><button class="btn soft" id="mdRefresh">Actualiser</button></div>
  <div class="card"><strong>Tester l’imprimante sur ce PDA</strong><p class="small muted">Test Bluetooth RawBT sans prix ni code-barres de vente. Aucune validation caisse nécessaire pour ce test. L’impression des vraies étiquettes conserve ses contrôles.</p><button class="btn soft" id="mdRawbtTest">Préparer une étiquette test RawBT</button><a class="btn brand" id="mdRawbtTestLink" hidden>Ouvrir RawBT pour le test</a></div>
  ${renderKpis(workspace.dashboard||{})}
  ${alerts.length?`<div class="md-alert-strip">${alerts.slice(0,8).map(a=>`<span class="md-alert ${String(a.priority).toLowerCase()}"><strong>${esc(a.title)}</strong><small>${esc(a.details||'')}</small></span>`).join('')}</div>`:''}
  <div class="network-section-title"><div><strong>À traiter maintenant</strong><span>Ordonné par date. La quantité affichée est une aide ; le comptage physique reste obligatoire.</span></div><span class="pill">${recs.filter(x=>x.status==='ACTION_REQUIRED').length} action(s)</span></div>
  <div class="md-bulk-bar"><label><input type="checkbox" id="mdSelectAll"> Tout sélectionner</label><div><span id="mdSelectedCount">0 sélection</span><button class="btn brand" id="mdBulkPrint" disabled>Préparer & imprimer la sélection</button></div></div>\n  <div class="md-actions">${recs.map(recommendationCard).join('')||'<div class="card empty">Aucune action markdown pour ce magasin.</div>'}</div>
  <div class="grid g2 md-followup"><div class="card"><div class="row"><strong>Opérations & pose des étiquettes</strong><span class="pill">${(workspace.operations||[]).length}</span></div>${operationsBlock()}</div><div class="card"><div class="row"><strong>File d’impression</strong><span class="pill">${(workspace.jobs||[]).filter(j=>['PENDING','PRINTING','FAILED'].includes(j.status)).length}</span></div>${jobsBlock()}</div></div>
  ${rulesAdmin()}
 </section>`;
 bind();
}
async function reload(){workspace=await api(`/api/stores/${app.storeId}/dlc-markdown`);if(isDirector())try{rules=(await api('/api/dlc-markdown/rules')).items||[]}catch{rules=[]}else rules=[];draw()}
async function preview(id){
 const card=document.querySelector(`[data-md-card="${CSS.escape(id)}"]`),code=card?.querySelector('[data-md-code]')?.value||'',host=card?.querySelector('[data-md-preview-host]'),rec=workspace.recommendations.find(x=>x.id===id);if(!host||!rec)return;
 host.innerHTML='<div class="small muted">Lecture du prix Dynamics et validation du profil POS…</div>';
 try{const data=await api(`/api/dlc-markdown/${encodeURIComponent(id)}/preview?markdown=${encodeURIComponent(code)}`);host.innerHTML=labelPreview(data,rec);host.querySelector('[data-md-print-one]')?.addEventListener('click',()=>printOne(id,data))}catch(e){host.innerHTML=`<div class="banner ban-danger"><strong>Préparation bloquée</strong><span>${esc(e.message)}</span></div>`}
}
async function printOne(id,previewData){
 const card=document.querySelector(`[data-md-card="${CSS.escape(id)}"]`),q=Number(card?.querySelector('[data-md-qty]')?.value||0),code=card?.querySelector('[data-md-code]')?.value||previewData.markdownCode,printer=activePrinter();
 if(printer?.protocol==='ZPL_RAWBT'&&!isAndroid())throw new Error('Impression RawBT disponible sur Android uniquement.');
 if(!previewData.printReady||!printer)throw new Error("Prix, profil POS et imprimante doivent être validés avant impression.");
 if(!Number.isInteger(q)||q<=0)throw new Error("Le nombre d’étiquettes doit être un entier positif.");
 const key=crypto.randomUUID(),created=await api(`/api/dlc-markdown/${encodeURIComponent(id)}/operations`,{method:'POST',body:{quantity:q,markdownCode:code,idempotencyKey:'pda:'+key}});
 if(created.operation?.status==='PENDING_APPROVAL'){toast('Opération créée · approbation requise avant impression.');await reload();return}
 const job=await api(`/api/stores/${app.storeId}/label-print-jobs`,{method:'POST',body:{operationIds:[created.operation.id],printerId:printer.id,idempotencyKey:'print:'+key}});
 toast(printer.protocol==='ZPL_RAWBT'?'Lot prêt : dans la file, touche Préparer sur ce PDA.':`${job.total_labels} étiquette(s) placée(s) en file d’impression.`);await reload()
}
function selectedRows(){
 return [...document.querySelectorAll('[data-md-select]:checked')].map(box=>{
  const id=box.dataset.mdSelect,card=document.querySelector(`[data-md-card="${CSS.escape(id)}"]`);
  return{id,quantity:Number(card?.querySelector('[data-md-qty]')?.value||0),markdownCode:card?.querySelector('[data-md-code]')?.value||'',card}
 })
}
function syncBulkState(){
 const rows=selectedRows(),count=document.getElementById('mdSelectedCount'),button=document.getElementById('mdBulkPrint'),all=document.getElementById('mdSelectAll'),eligible=[...document.querySelectorAll('[data-md-select]')];
 if(count)count.textContent=rows.length?`${rows.length} article(s) sélectionné(s)`:'0 sélection';
 if(button)button.disabled=!rows.length;
 if(all){all.checked=eligible.length>0&&rows.length===eligible.length;all.indeterminate=rows.length>0&&rows.length<eligible.length}
}
async function bulkPrint(){
 const rows=selectedRows(),printer=activePrinter();if(!rows.length)throw new Error('Sélectionne au moins un article.');if(!printer)throw new Error('Aucune imprimante magasin configurée.');
 if(printer.protocol==='ZPL_RAWBT'&&!isAndroid())throw new Error('Impression RawBT disponible sur Android uniquement.');
 const prepared=[];
 for(const row of rows){
  if(!Number.isInteger(row.quantity)||row.quantity<=0)throw new Error('Chaque quantité à imprimer doit être un nombre entier positif.');
  const p=await api(`/api/dlc-markdown/${encodeURIComponent(row.id)}/preview?markdown=${encodeURIComponent(row.markdownCode)}`);
  if(!p.printReady)throw new Error(`${workspace.recommendations.find(x=>x.id===row.id)?.productName||row.id} : prix ou profil POS non validé.`);
  prepared.push({...row,preview:p})
 }
 const batchKey=crypto.randomUUID(),created=await api(`/api/stores/${app.storeId}/dlc-markdown/bulk-operations`,{method:'POST',body:{items:prepared.map((x,i)=>({dlcId:x.id,quantity:x.quantity,markdownCode:x.markdownCode,idempotencyKey:`bulk:${batchKey}:${i}`}))}});
 const blocked=(created.operations||[]).filter(x=>x.status!=='APPROVED');if(blocked.length){toast(`${blocked.length} opération(s) attendent une approbation ; aucune impression groupée lancée.`);await reload();return}
 const job=await api(`/api/stores/${app.storeId}/label-print-jobs`,{method:'POST',body:{operationIds:(created.operations||[]).map(x=>x.id),printerId:printer.id,idempotencyKey:'bulk-print:'+batchKey}});
 toast(printer.protocol==='ZPL_RAWBT'?'Lot prêt : dans la file, touche Préparer sur ce PDA.':`Lot envoyé · ${job.total_labels} étiquette(s) pour ${prepared.length} article(s).`);await reload()
}
async function saveRule(){
 const scope=document.getElementById('mdRuleScope').value,value=document.getElementById('mdRuleValue').value.trim();
 await api('/api/dlc-markdown/rules',{method:'POST',body:{scopeType:scope,scopeValue:scope==='ALL'?null:value,storeId:document.getElementById('mdRuleStore').value||null,daysBeforeExpiry:Number(document.getElementById('mdRuleDays').value),markdownCode:document.getElementById('mdRuleCode').value,priority:Number(document.getElementById('mdRulePriority').value),actionMode:document.getElementById('mdRuleMode').value,alertPriority:'HIGH',active:true}});
 toast('Règle markdown enregistrée.');await reload()
}
async function validatePos(code){
 const note=document.querySelector(`[data-pos-note="${CSS.escape(code)}"]`)?.value.trim();if(!note)throw new Error('Décris le test réellement effectué sur Store Commerce.');
 if(!confirm(`Confirmer qu’une étiquette ${code} encodée en CODE128 a été scannée sur une vraie caisse Store Commerce avec le bon article et la bonne remise ?`))return;
 await api(`/api/dlc-markdown/pos/${encodeURIComponent(code)}`,{method:'POST',body:{symbology:'CODE128',roundingDecimals:2,evidenceNote:note,confirmed:true}});
 toast(code+' validé après test caisse.');await reload()
}
async function savePrinter(){
 const name=document.getElementById('mdPrinterName').value.trim(),bridgeKey=document.getElementById('mdPrinterBridge').value.trim(),protocol=document.getElementById('mdPrinterProtocol').value;if(protocol==='ZPL_BRIDGE'&&!bridgeKey)throw new Error('Clé bridge obligatoire pour le relais magasin.');
 const existing=activePrinter();
 await api(`/api/stores/${app.storeId}/label-printers`,{method:'POST',body:{id:existing?.protocol===protocol?existing.id:null,name,bridgeKey,protocol,mediaWidthMm:60,mediaHeightMm:40,dpi:203,colorMode:'MONO_PRECOLORED',active:true,isDefault:true}});
 toast('Imprimante magasin enregistrée.');await reload()
}
function bind(){
 document.getElementById('mdRawbtTest')?.addEventListener('click',()=>{try{if(!isAndroid())throw new Error('Test à lancer sur le PDA Android avec RawBT.');const link=document.getElementById('mdRawbtTestLink');link.href=rawbtLink('^XA\n^CI28\n^PW480\n^LL320\n^FO20,30^A0N,30,30^FDSTOREOPS - TEST ZPL^FS\n^FO20,90^A0N,22,22^FDTEST SANS VALEUR COMMERCIALE^FS\n^FO20,140^A0N,22,22^FDVerifier centrage et format 60x40^FS\n^XZ');link.hidden=false;toast('Touche Ouvrir RawBT pour envoyer le test.');}catch(e){toast(e.message)}});
 document.querySelectorAll('[data-md-rawbt]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{
  if(!isAndroid())throw new Error('Ouvre StoreOps sur le PDA Android équipé de RawBT.');
  const job=await api(`/api/label-print-jobs/${encodeURIComponent(b.dataset.mdRawbt)}/rawbt`,{method:'POST',body:{action:'prepare'}});
  const host=document.querySelector(`[data-md-rawbt-host="${CSS.escape(job.id)}"]`);
  host.innerHTML=`<p>RawBT doit utiliser le mode ZPL brut. Après impression, reviens confirmer la sortie. Aucun renvoi automatique.</p><a class="btn brand" href="${esc(rawbtLink(job.payload))}">Ouvrir RawBT et imprimer</a><button class="btn soft" data-md-mobile-done>Vérifier la sortie</button>`;
  host.querySelector('a').addEventListener('click',e=>{if(e.currentTarget.dataset.sent){e.preventDefault();return}e.currentTarget.dataset.sent='1';e.currentTarget.textContent='Transmis à RawBT · vérifier la sortie';});
  host.querySelector('[data-md-mobile-done]').addEventListener('click',()=>reload().catch(e=>toast(e.message)));
 }catch(e){toast(e.message);b.disabled=false}}));
 for(const [attr,action,message] of [['confirm','confirm','Toutes les étiquettes sont-elles sorties correctement ?'],['failed','failed','Après contrôle physique, confirmer une sortie absente ou incomplète ? Une relance peut dupliquer les étiquettes déjà sorties.']])document.querySelectorAll(`[data-md-${attr}]`).forEach(b=>b.addEventListener('click',async()=>{if(!confirm(message))return;b.disabled=true;try{await api(`/api/label-print-jobs/${encodeURIComponent(b.dataset[attr==='confirm'?'mdConfirm':'mdFailed'])}/rawbt`,{method:'POST',body:{action,confirmed:true}});await reload()}catch(e){toast(e.message);b.disabled=false}}));
 document.getElementById('mdRefresh')?.addEventListener('click',()=>reload().catch(e=>toast(e.message)));
 document.querySelectorAll('[data-md-select]').forEach(x=>x.addEventListener('change',syncBulkState));
 document.getElementById('mdSelectAll')?.addEventListener('change',e=>{document.querySelectorAll('[data-md-select]').forEach(x=>x.checked=e.target.checked);syncBulkState()});
 document.getElementById('mdBulkPrint')?.addEventListener('click',()=>bulkPrint().catch(e=>toast(e.message)));
 document.querySelectorAll('[data-md-preview]').forEach(b=>b.addEventListener('click',()=>preview(b.dataset.mdPreview)));
 document.querySelectorAll('[data-md-code]').forEach(s=>s.addEventListener('change',()=>{const host=document.querySelector(`[data-md-preview-host="${CSS.escape(s.dataset.mdCode)}"]`);if(host)host.innerHTML=''}));
 document.querySelectorAll('[data-md-applied]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/api/dlc-markdown/operations/${encodeURIComponent(b.dataset.mdApplied)}/applied`,{method:'POST'});toast('Pose des étiquettes confirmée.');await reload()}catch(e){toast(e.message)}}));
 document.querySelectorAll('[data-md-retry]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/api/label-print-jobs/${encodeURIComponent(b.dataset.mdRetry)}/retry`,{method:'POST'});toast("Job remis en file sans créer de doublon.");await reload()}catch(e){toast(e.message)}}));
 document.getElementById('mdSaveRule')?.addEventListener('click',()=>saveRule().catch(e=>toast(e.message)));
 document.querySelectorAll('[data-pos-validate]').forEach(b=>b.addEventListener('click',()=>validatePos(b.dataset.posValidate).catch(e=>toast(e.message))));
 document.getElementById('mdSavePrinter')?.addEventListener('click',()=>savePrinter().catch(e=>toast(e.message)));
}
export async function renderDlcMarkdownWorkspace(){
 ensureCss();const host=root();if(!host)return;
 host.innerHTML='<div class="card" role="status">Chargement des actions markdown…</div>';
 try{await reload()}catch(e){host.innerHTML=`<div class="banner ban-warn"><strong>Module Markdown indisponible</strong><span>${esc(e.message)}. Le suivi DLC classique reste opérationnel.</span></div>`}
}

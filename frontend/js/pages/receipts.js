import{api}from'../api.js';import{app,canManage,canManageQuality}from'../state.js';import{$,status,esc,toast}from'../ui.js';
let profiles=new Map(),documentType='PO',selectedReceiptId=null,readiness=null;
const receiptCache={PO:[],TO:[]};
const dt=v=>v?new Date(String(v).slice(0,10)+'T12:00:00Z').toLocaleDateString('fr-FR'):'—';
const currentRows=()=>receiptCache[documentType]||[];
const currentReceipt=()=>currentRows().find(x=>x.id===selectedReceiptId)||null;
const docCount=t=>(receiptCache[t]||[]).length;

export async function renderReceipts(){
 const [poResult,toResult,readinessResult]=await Promise.allSettled([
  api(`/api/stores/${app.storeId}/receipts?type=PO`),
  api(`/api/stores/${app.storeId}/receipts?type=TO`),
  api(`/api/stores/${app.storeId}/receipts/readiness`)
 ]);
 receiptCache.PO=poResult.status==='fulfilled'?(poResult.value||[]):[];
 receiptCache.TO=toResult.status==='fulfilled'?(toResult.value||[]):[];
 readiness=readinessResult.status==='fulfilled'?readinessResult.value:null;
 if(selectedReceiptId&&!currentReceipt())selectedReceiptId=null;
 await drawReceipts({
  poError:poResult.status==='rejected'?poResult.reason:null,
  toError:toResult.status==='rejected'?toResult.reason:null
 });
}

async function drawReceipts(errors={}){
 const rows=currentRows(),selected=currentReceipt(),ro=!(canManage()||canManageQuality());
 if(selected){
  const cats=[...new Set((selected.lines||[]).map(l=>l.category||'Autre'))];
  const pairs=await Promise.all(cats.map(async cat=>[cat,await api(`/api/quality-profiles/${encodeURIComponent(cat)}`).catch(()=>null)]));
  profiles=new Map(pairs);
 }else profiles=new Map();
 const health=(documentType==='TO'?readiness?.transferStores?.[app.storeId]:readiness?.stores?.[app.storeId])||null;
 const warehouse=health?.warehouseId||readiness?.storeWarehouses?.[app.storeId]||null,lastSuccess=health?.lastSuccessAt||rows.map(r=>r.source_updated_at).filter(Boolean).sort().at(-1)||null;
 const lastSyncLabel=lastSuccess?new Date(String(lastSuccess).replace(' ','T')+'Z').toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):null;
 const error=documentType==='PO'?errors.poError:errors.toError;
 const pendingLabel=documentType==='PO'?'Connexion PO Dynamics à valider':'Connexion TO Dynamics à valider',degradedLabel=documentType==='PO'?'PO Dynamics à vérifier':'TO Dynamics à vérifier';
 const sourceBanner=error
  ?`<div class="banner ban-danger"><strong>Cache ${documentType} indisponible</strong><span>${esc(error.message||'Backend Réception indisponible.')}</span></div>`
  :health?.state==='DEGRADED'
   ?`<div class="banner ban-warn"><strong>${degradedLabel}</strong><span>${esc(health.lastErrorMessage||health.reason||'Dernière synchronisation non fiable')}. Le dernier cache reste visible.</span></div>`
   :health?.state==='LIVE'
    ?`<div class="banner ban-ok"><strong>${documentType==='PO'?'PO Dynamics synchronisés':'TO Dynamics synchronisés'}</strong><span>Warehouse ${esc(warehouse||'—')}${lastSyncLabel?` · synchronisé ${lastSyncLabel}`:''} · dernier cache fiable disponible.</span></div>`
    :`<div class="banner ban-info"><strong>${pendingLabel}</strong><span>Aucune synchronisation fiable n’est encore confirmée pour ce flux.</span></div>`;
 const tabs=`<div class="receipt-doc-tabs">
   <button class="btn ${documentType==='PO'?'brand':'ghost'}" data-receipt-type="PO"><span>PO · Commandes</span><span class="pill">${docCount('PO')}</span></button>
   <button class="btn ${documentType==='TO'?'brand':'ghost'}" data-receipt-type="TO"><span>TO · Transferts</span><span class="pill">${docCount('TO')}</span></button>
  </div>`;
 const help=documentType==='PO'
   ?'Commandes PO ouvertes du dernier mois uniquement · fournisseur, date PO, entrepôt et livraison visibles avant ouverture.'
   :'Transferts TO ouverts à destination du magasin · origine et destination visibles avant ouverture.';
 const body=selected?receiptDetail(selected,ro):documentList(rows,error);
 $('#receiptsContent').innerHTML=`${tabs}<div class="small muted" style="margin:8px 0 12px">${help}</div>${ro?'<div class="role-lock">Lecture seule : contrôle réservé au Responsable magasin, à la Qualité réseau et à la Direction.</div>':''}<div class="row" style="margin:14px 0 10px"><div><strong>${selected?`${documentType} ${esc(selected.po_number)}`:`${documentType==='PO'?'Commandes à réceptionner':'Transferts à réceptionner'}`}</strong><div class="small muted">${selected?'Détail du document et contrôle article par article.':'Choisis un document pour afficher ses articles. Aucun détail lourd n’est chargé visuellement tant que tu ne l’ouvres pas.'}</div></div>${canManage()&&!selected?'<button class="btn soft" id="syncReceiptsBtn">Synchroniser D365</button>':''}</div>${sourceBanner}${body}`;
 bindReceiptControls();
 document.querySelectorAll('[data-receipt-type]').forEach(b=>b.addEventListener('click',async()=>{documentType=b.dataset.receiptType;selectedReceiptId=null;await drawReceipts()}));
 document.querySelectorAll('[data-open-receipt]').forEach(b=>b.addEventListener('click',async()=>{selectedReceiptId=b.dataset.openReceipt;await drawReceipts()}));
 $('#receiptBack')?.addEventListener('click',async()=>{selectedReceiptId=null;await drawReceipts()});
 $('#syncReceiptsBtn')?.addEventListener('click',syncReceipts);
}

function documentList(rows,error){
 if(error)return'<div class="empty">Impossible de charger les documents. Le dernier cache n’est pas exploitable.</div>';
 if(!rows.length)return`<div class="empty">Aucun ${documentType} ouvert à afficher.</div>`;
 return`<div class="receipt-document-list">${rows.map(documentRow).join('')}</div>`
}
function documentRow(r){
 const type=r.document_type||documentType,controlled=(r.lines||[]).filter(l=>l.quality_control_id).length,lineCount=Number(r.line_count??r.lines?.length??0);
 const created=r.source_created_date||null,origin=type==='PO'?(r.vendor||r.source_origin||'Fournisseur'):(r.source_origin||r.vendor||'Origine D365');
 const secondary=type==='PO'
  ?`${r.source_vendor_account?`Compte ${esc(r.source_vendor_account)} · `:''}Créé le ${dt(created||r.eta)} · Livraison ${dt(r.eta)} · Réception ${esc(r.source_warehouse_id||'—')}`
  :`Origine ${esc(origin)} · Destination ${esc(r.source_destination||r.source_warehouse_id||'—')} · Réception prévue ${dt(r.eta)}`;
 return`<button class="card receipt-document-row" data-open-receipt="${esc(r.id)}"><div class="row"><div><span class="manager-eyebrow">${esc(type)}</span><h3 style="margin:3px 0">${esc(r.po_number)}</h3><strong>${esc(origin)}</strong><div class="small muted" style="margin-top:4px">${secondary}</div></div><div style="text-align:right"><span class="pill">${lineCount} ligne${lineCount>1?'s':''}</span><div class="small muted" style="margin-top:6px">${controlled}/${lineCount} contrôlée(s)</div><div style="margin-top:8px">›</div></div></div></button>`
}
function receiptDetail(r,ro){
 const controlled=(r.lines||[]).filter(l=>l.quality_control_id).length,d365=r.source==='D365',type=r.document_type||documentType,origin=type==='PO'?(r.vendor||r.source_origin):(r.source_origin||r.vendor);
 const meta=type==='PO'
  ?`Fournisseur ${esc(r.vendor||'—')}${r.source_vendor_account?` · ${esc(r.source_vendor_account)}`:''} · Créé le ${dt(r.source_created_date||r.eta)} · Livraison ${dt(r.eta)} · Entrepôt ${esc(r.source_warehouse_id||'—')}`
  :`Origine ${esc(r.source_origin||origin||'—')} · Destination ${esc(r.source_destination||r.source_warehouse_id||'—')} · Réception ${dt(r.eta)}`;
 return`<div style="margin:12px 0"><button class="btn ghost" id="receiptBack">← Retour aux ${type}</button></div><div class="card"><div class="row"><div><strong>${esc(type)} ${esc(r.po_number)} · ${esc(origin||'—')}</strong><div class="small muted">${meta} · ${r.lines.length} ligne(s) · ${controlled}/${r.lines.length} contrôlée(s)${d365?' · D365':''}</div></div>${status(r.status==='POSTED'?'Réceptionnée':controlled===r.lines.length?'Prête à réceptionner':'À contrôler',r.status==='POSTED'?'ok':controlled===r.lines.length?'ok':'warn')}</div><div class="stack" style="margin-top:12px">${r.lines.map(l=>line(r,l,ro)).join('')}</div>${!ro&&r.status!=='POSTED'&&d365?`<div class="banner ban-info" style="margin-top:12px"><strong>Contrôle StoreOps uniquement</strong><div class="small" style="margin-top:4px">Le posting de réception dans Dynamics reste désactivé. Les contrôles qualité et quantités sont enregistrés dans StoreOps.</div></div>`:''}</div>`
}
function req(flag){return flag?' *':''}
function qualityDescription(p,cat){if(!p)return`Profil qualité ${esc(cat||'Autre')}`;const rules=[];if(p.temperature_required)rules.push(`température ${p.temp_min} à ${p.temp_max} °C`);if(p.packaging_required)rules.push('conditionnement');if(p.appearance_required)rules.push('aspect / fraîcheur');if(p.expiry_required)rules.push('DLC/DDM');if(p.lot_required)rules.push('lot');return `${esc(p.label||cat||'Profil qualité')} · ${rules.length?rules.join(' · '):'contrôle standard'}`}
function line(r,l,ro){const done=!!l.quality_control_id,p=profiles.get(l.category||'Autre')||null,tempLabel=p?.temperature_required?`Température * (${p.temp_min} à ${p.temp_max} °C)`:'Température (optionnel)',cat=l.category||'Autre';return `<div class="receipt-line"><div class="row"><div><h4>${esc(l.product_name)}</h4><div class="small muted">${esc(l.ean&&l.ean!==l.product_number?`EAN ${l.ean}`:`SKU ${l.product_number||l.ean}`)} · ${esc(cat)} · commandé ${l.ordered_qty}${l.remaining_qty!=null?` · reste ${l.remaining_qty}`:''}</div></div>${done?status('Contrôlé','ok'):status('À contrôler','warn')}</div>${!ro&&!done?`<div class="quality-form" data-quality-line="${l.id}" data-category="${esc(cat)}"><div class="banner ban-info"><strong>${qualityDescription(p,cat)}</strong><div class="small" style="margin-top:4px">Les champs marqués * sont obligatoires pour cette famille. Les tolérances sont revalidées côté serveur.</div></div><div class="form-grid" style="margin-top:10px"><div class="field"><label>Livré *</label><input id="del_${l.id}" data-qty-delivered="${l.id}" type="number" min="0" step="0.001" value="${l.ordered_qty}"></div><div class="field"><label>Accepté *</label><input id="acc_${l.id}" data-qty-accepted="${l.id}" type="number" min="0" step="0.001" value="${l.ordered_qty}"></div><div class="field"><label>Refusé *</label><input id="rej_${l.id}" data-qty-rejected="${l.id}" type="number" min="0" step="0.001" value="0"></div><div class="field"><label>${tempLabel}</label><input id="temp_${l.id}" data-temp-input="${l.id}" type="number" step="0.1" ${p?.temperature_required?'required':''}><div class="small muted" id="tempHint_${l.id}">${p?.temperature_required?'Saisir la température mesurée à réception.':'À renseigner si pertinent.'}</div></div><div class="field"><label>Conditionnement${req(p?.packaging_required)}</label><select id="pack_${l.id}"><option value="OK">Conforme</option><option value="NOK">Non conforme</option><option value="NA" ${p?.packaging_required?'':'selected'}>N/A</option></select></div><div class="field"><label>Aspect / fraîcheur${req(p?.appearance_required)}</label><select id="app_${l.id}"><option value="OK">Conforme</option><option value="NOK">Non conforme</option><option value="NA" ${p?.appearance_required?'':'selected'}>N/A</option></select></div><div class="field"><label>DLC / DDM${req(p?.expiry_required)}</label><input id="exp_${l.id}" type="date" ${p?.expiry_required?'required':''}></div><div class="field"><label>Lot${req(p?.lot_required)}</label><input id="lot_${l.id}" ${p?.lot_required?'required':''}></div><div class="field full"><div class="small muted" id="qtyHint_${l.id}">Accepté + refusé = livré.</div></div><div class="field full"><label>Commentaire</label><textarea id="com_${l.id}" rows="2" placeholder="Anomalie, réserve fournisseur, motif de refus…"></textarea></div></div><button class="btn soft wide" data-control-line="${l.id}" data-po="${esc(r.po_number)}" data-category="${esc(cat)}">Valider le contrôle article</button></div>`:done?`<div class="small muted" style="margin-top:7px">Livré ${l.delivered_qty} · Accepté ${l.accepted_qty} · Refusé ${l.rejected_qty}</div>`:''}</div>`}
function n(id){const v=Number($(id)?.value);return Number.isFinite(v)?v:null}
function updateBalance(id,source){const d=$(`#del_${id}`),a=$(`#acc_${id}`),r=$(`#rej_${id}`);if(!d||!a||!r)return;const delivered=Math.max(0,Number(d.value)||0);if(source==='rejected')a.value=String(Math.max(0,delivered-(Number(r.value)||0)));else r.value=String(Math.max(0,delivered-(Number(a.value)||0)));const accepted=Number(a.value)||0,rejected=Number(r.value)||0,ok=Math.abs(accepted+rejected-delivered)<.0001&&accepted>=0&&rejected>=0;const h=$(`#qtyHint_${id}`);if(h){h.textContent=ok?`Cohérent : ${accepted} accepté + ${rejected} refusé = ${delivered} livré.`:`Incohérent : accepté + refusé doit être égal au livré (${delivered}).`;h.style.color=ok?'var(--ok)':'var(--danger)'}}
function updateTemperature(id){const host=document.querySelector(`[data-quality-line="${id}"]`),cat=host?.dataset.category||'Autre',p=profiles.get(cat),input=$(`#temp_${id}`),hint=$(`#tempHint_${id}`);if(!p?.temperature_required||!input||!hint)return;if(input.value===''){hint.textContent=`Obligatoire · tolérance ${p.temp_min} à ${p.temp_max} °C.`;hint.style.color='var(--muted)';return}const v=Number(input.value),ok=Number.isFinite(v)&&v>=Number(p.temp_min)&&v<=Number(p.temp_max);hint.textContent=ok?`Conforme · ${v} °C dans la tolérance.`:`Hors tolérance · ${v} °C, attendu ${p.temp_min} à ${p.temp_max} °C. Prévoir une quantité refusée / une décision qualité.`;hint.style.color=ok?'var(--ok)':'var(--danger)'}
function bindReceiptControls(){document.querySelectorAll('[data-qty-delivered]').forEach(x=>x.addEventListener('input',()=>updateBalance(x.dataset.qtyDelivered,'delivered')));document.querySelectorAll('[data-qty-accepted]').forEach(x=>x.addEventListener('input',()=>updateBalance(x.dataset.qtyAccepted,'accepted')));document.querySelectorAll('[data-qty-rejected]').forEach(x=>x.addEventListener('input',()=>updateBalance(x.dataset.qtyRejected,'rejected')));document.querySelectorAll('[data-temp-input]').forEach(x=>x.addEventListener('input',()=>updateTemperature(x.dataset.tempInput)));document.querySelectorAll('[data-quality-line]').forEach(x=>updateBalance(x.dataset.qualityLine,'accepted'))}
export async function controlReceiptLine(btn){const id=btn.dataset.controlLine,po=btn.dataset.po,cat=btn.dataset.category||'Autre',p=profiles.get(cat)||null,delivered=n(`#del_${id}`),accepted=n(`#acc_${id}`),rejected=n(`#rej_${id}`),tempRaw=$(`#temp_${id}`).value,temperature=tempRaw===''?null:Number(tempRaw),expiryDate=$(`#exp_${id}`).value||null,lotRef=$(`#lot_${id}`).value.trim();if([delivered,accepted,rejected].some(x=>x==null||x<0))throw new Error('Les quantités livré, accepté et refusé doivent être positives.');if(Math.abs(accepted+rejected-delivered)>.0001)throw new Error('Accepté + refusé doit être égal au livré.');if(p?.temperature_required&&temperature==null)throw new Error('La température est obligatoire pour cette famille.');if(p?.expiry_required&&!expiryDate)throw new Error('La DLC / DDM est obligatoire pour cette famille.');if(p?.lot_required&&!lotRef)throw new Error('Le numéro de lot est obligatoire pour cette famille.');const b={deliveredQty:delivered,acceptedQty:accepted,rejectedQty:rejected,temperature,packagingStatus:$(`#pack_${id}`).value,appearanceStatus:$(`#app_${id}`).value,expiryDate,lotRef,comment:$(`#com_${id}`).value.trim()};btn.disabled=true;const old=btn.textContent;btn.textContent='Enregistrement…';try{const r=await api(`/api/receipts/${encodeURIComponent(po)}/lines/${id}/quality`,{method:'POST',body:b});toast(r.decision==='ACCEPT'?'Contrôle conforme.':'Contrôle enregistré avec non-conformité.');await renderReceipts()}finally{if(document.body.contains(btn)){btn.disabled=false;btn.textContent=old}}}

async function syncReceipts(){const b=$('#syncReceiptsBtn'),old=b?.textContent;if(b){b.disabled=true;b.textContent='Synchronisation D365…'}try{const r=await api(`/api/stores/${app.storeId}/receipts/sync?type=${documentType}`,{method:'POST'}),sync=r?.sync||{};if(sync.error||sync.synced===false)toast(`Dynamics n’a pas pu actualiser les ${documentType} : ${sync.error?.message||sync.diagnostics?.code||'connexion indisponible'}. Le dernier cache est conservé.`);else if(sync.partial)toast(`${r.items?.length||0} ${documentType} mis à jour · synchronisation partielle, le cache précédent est conservé.`);else toast(`${r.items?.length||0} ${documentType} Dynamics synchronisé(s).`);await renderReceipts()}catch(e){toast(`Synchronisation ${documentType} indisponible : ${e.message}. Le cache existant reste affiché.`);await renderReceipts()}finally{if(b&&document.body.contains(b)){b.disabled=false;b.textContent=old||'Synchroniser D365'}}}

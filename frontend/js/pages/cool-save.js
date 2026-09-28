import {api} from '../api.js';
import {app} from '../state.js';
import {$,esc,toast} from '../ui.js';

let payload=null,selected=new Map();
const money=v=>v==null?'—':Number(v).toLocaleString('fr-MA',{minimumFractionDigits:0,maximumFractionDigits:2})+' DH';
const n=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1});
const stateLabel={DRAFT:'Brouillon',PUBLISHED:'Publié',RESERVED:'Réservé',SOLD:'Vendu',CANCELLED:'Annulé',EXPIRED:'Expiré'};
function suggestRow(x){
 const checked=selected.has(x.id),qty=selected.get(x.id)?.quantity||1;
 return `<label class="coolsave-suggest ${checked?'selected':''}"><input type="checkbox" data-cs-select="${esc(x.id)}" ${checked?'checked':''}><span class="coolsave-suggest-main"><b>${esc(x.name)}</b><small>${esc(x.reason)}</small><em>${x.eligibility==='ELIGIBLE_DLC'?'DLC courte':'Revue magasin'} · stock ${n(x.quantity)} ${esc(x.unit||'')}</em></span><input class="coolsave-qty" data-cs-qty="${esc(x.id)}" type="number" min="0.001" step="0.001" value="${qty}" ${checked?'':'disabled'}></label>`
}
function basketCard(x){
 return `<article class="coolsave-basket ${x.status==='SOLD'?'sold':''}"><div class="coolsave-basket-head"><div><span class="growth-chip">${esc(stateLabel[x.status]||x.status)}</span><strong>${esc(x.title)}</strong><small>${esc(x.code)} · ${x.lines?.length||0} article(s)</small></div><div class="coolsave-price"><b>${money(x.sale_price)}</b><span>${x.reference_value!=null?`valeur ${money(x.reference_value)}`:'valeur partielle'}</span></div></div><div class="coolsave-lines">${(x.lines||[]).map(l=>`<span>${n(l.quantity)} ${esc(l.unit)} · ${esc(l.product_name)}</span>`).join('')}</div><div class="coolsave-actions">${x.status==='DRAFT'?`<button class="btn brand" data-cs-action="publish" data-cs-id="${esc(x.id)}">Publier</button>`:''}${['PUBLISHED','RESERVED'].includes(x.status)?`<button class="btn brand" data-cs-action="sold" data-cs-id="${esc(x.id)}">Marquer vendu</button>`:''}${!['SOLD','CANCELLED'].includes(x.status)?`<button class="btn soft" data-cs-action="cancel" data-cs-id="${esc(x.id)}">Annuler</button>`:''}${x.status==='SOLD'?`<span class="erp-pill">${x.erpBridge?.status==='READY_FOR_BRIDGE'?'Prêt ERP':'ERP à configurer'}</span>`:''}</div></article>`
}
function draw(){
 const host=$('#coolSaveContent');if(!host||!payload)return;const {summary={},items=[],suggestions={}}=payload;
 host.innerHTML=`<div class="growth-shell"><div class="manager-hub-head"><span class="manager-eyebrow">COOL & SAVE · ANTI-GASPI</span><h2>Transformer les invendus en paniers vendables.</h2><p>DLC courtes, invendus et rotation lente sont proposés par StoreOps. Le magasin garde la décision finale.</p></div><div class="growth-kpis"><div><span>Paniers ouverts</span><strong>${n(summary.open)}</strong><small>${n(summary.published)} publié(s)</small></div><div><span>Vendus</span><strong>${n(summary.sold)}</strong><small>${money(summary.revenue)} encaissé</small></div><div><span>Valeur sauvée</span><strong>${money(summary.savedValue)}</strong><small>vs valeur de référence connue</small></div></div><section class="coolsave-create"><div class="coolsave-create-head"><div><span class="manager-eyebrow">NOUVEAU PANIER</span><strong>Composer en quelques taps</strong><small>Les produits expirés sont exclus automatiquement.</small></div><span class="pill">${selected.size} sélectionné(s)</span></div><div class="coolsave-form"><label><span>Nom</span><input id="csTitle" value="Panier Cool & Save"></label><label><span>Prix de vente</span><input id="csPrice" type="number" min="0" step="1" placeholder="Ex. 39"></label></div><div class="coolsave-suggestions">${(suggestions.items||[]).slice(0,60).map(suggestRow).join('')||'<div class="growth-empty">Aucune suggestion disponible.</div>'}</div><button class="btn brand coolsave-create-btn" id="createCoolSave" ${selected.size?'':'disabled'}>Créer le panier</button></section><section class="coolsave-existing"><div class="growth-section-head"><strong>Paniers du magasin</strong><span>${items.length}</span></div><div class="growth-list">${items.map(basketCard).join('')||'<div class="growth-empty"><strong>Aucun panier pour le moment.</strong><span>Composez le premier panier ci-dessus.</span></div>'}</div></section><div class="growth-trust">Dynamics reste la source article/stock/prix. Le posting ERP est volontairement désactivé tant que le modèle de vente Cool & Save n’est pas validé.</div></div>`;
 host.querySelectorAll('[data-cs-select]').forEach(x=>x.onchange=()=>toggleSuggestion(x));
 host.querySelectorAll('[data-cs-qty]').forEach(x=>x.onchange=()=>updateQty(x));
 $('#createCoolSave')?.addEventListener('click',createBasket);
 host.querySelectorAll('[data-cs-action]').forEach(b=>b.onclick=()=>basketAction(b));
}
function suggestion(id){return (payload?.suggestions?.items||[]).find(x=>x.id===id)}
function toggleSuggestion(input){
 const x=suggestion(input.dataset.csSelect);if(!x)return;
 if(input.checked)selected.set(x.id,{...x,quantity:1});else selected.delete(x.id);draw()
}
function updateQty(input){
 const x=selected.get(input.dataset.csQty);if(!x)return;const q=Number(input.value);if(Number.isFinite(q)&&q>0)selected.set(x.id,{...x,quantity:q})
}
async function createBasket(){
 const price=Number($('#csPrice')?.value);if(!Number.isFinite(price)||price<0)return toast('Saisis le prix de vente du panier.');
 const items=[...selected.values()].map(x=>({productNumber:x.productNumber,ean:x.ean,productName:x.name,quantity:x.quantity,unit:x.unit,referenceUnitPrice:x.referenceUnitPrice,sourceType:x.sourceType,sourceId:x.sourceId}));
 try{await api(`/api/stores/${app.storeId}/cool-save`,{method:'POST',body:JSON.stringify({title:$('#csTitle')?.value||'Panier Cool & Save',salePrice:price,items})});selected.clear();toast('Panier créé. Il reste en brouillon tant qu’il n’est pas publié.');await renderCoolSave()}catch(e){toast(e.message)}
}
async function basketAction(btn){
 const action=btn.dataset.csAction,id=btn.dataset.csId;if(!action||!id)return;btn.disabled=true;
 try{await api(`/api/cool-save/${encodeURIComponent(id)}/${action}`,{method:'POST',body:JSON.stringify({})});toast(action==='publish'?'Panier publié.':action==='sold'?'Panier marqué vendu.':'Panier annulé.');await renderCoolSave()}catch(e){toast(e.message);btn.disabled=false}
}
function applyPrefill(){
 let sku='';try{sku=sessionStorage.getItem('storeops_coolsave_prefill')||'';sessionStorage.removeItem('storeops_coolsave_prefill')}catch{}
 if(!sku)return;const x=(payload?.suggestions?.items||[]).find(i=>i.productNumber===sku);if(x)selected.set(x.id,{...x,quantity:1})
}
export async function renderCoolSave(){
 const host=$('#coolSaveContent');if(host)host.innerHTML='<div class="growth-loading">Préparation des opportunités anti-gaspi…</div>';
 try{const [b,s]=await Promise.all([api(`/api/stores/${app.storeId}/cool-save`),api(`/api/stores/${app.storeId}/cool-save/suggestions`)]);payload={summary:b.summary||{},items:b.items||[],suggestions:s};applyPrefill();draw()}catch(e){if(host)host.innerHTML=`<div class="growth-error">${esc(e.message)}</div>`;toast(e.message)}
}

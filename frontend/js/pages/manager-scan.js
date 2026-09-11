import { api } from '../api.js';
import { app,currentStore } from '../state.js';
import { $,esc,toast } from '../ui.js';

let lastContext=null,lastRequest=null;
const money=v=>v==null?'—':Number(v).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2})+' DH';
const qty=v=>v==null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:3});
const requestStatus={REQUESTED:'En attente Direction',APPROVED:'Approuvée',SENT:'Envoyée',PARTIAL_RECEIVED:'Partiellement reçue',RECEIVED:'Reçue',REJECTED:'Refusée',CANCELLED:'Annulée'};

function assortmentPresentation(a={}){
 if(a.status==='ASSORTED')return{label:'Dans l’assortiment',tone:'ok',detail:'Cet article fait partie du référentiel actif de ce magasin.'};
 if(a.status==='NOT_ASSORTED')return{label:'Hors assortiment',tone:'neutral',detail:'Cet article ne doit pas être piloté comme une rupture magasin.'};
 return{label:'Assortiment à actualiser',tone:'warn',detail:'StoreOps ne calcule pas de rupture tant que le référentiel assortiment n’est pas fiable.'}
}
function availabilityPresentation(state){
 return {
  OUT_OF_STOCK:{label:'Rupture magasin',tone:'danger'},
  STOCK_ANOMALY:{label:'Stock à contrôler',tone:'danger'},
  RESIDUAL_STOCK_OUTSIDE_ASSORTMENT:{label:'Stock hors assortiment',tone:'warn'},
  NOT_ASSORTED:{label:'Hors assortiment',tone:'neutral'},
  ASSORTMENT_UNKNOWN:{label:'Référentiel à actualiser',tone:'warn'},
  AVAILABLE:{label:'Disponible',tone:'ok'}
 }[state]||{label:'À vérifier',tone:'neutral'}
}
function taxPath(rows=[]){
 const clean=(rows||[]).filter(x=>x.category_name).sort((a,b)=>(a.level??999)-(b.level??999));
 if(!clean.length)return null;
 const explicit=clean.find(x=>x.path)?.path;if(explicit)return explicit;
 return [...new Set(clean.map(x=>x.category_name))].join(' › ')
}
function sourceState(ctx){
 const missing=[];
 if(ctx.storeStock?.mappingRequired)missing.push('stock magasin');
 if(ctx.supplyStock?.mappingRequired)missing.push('entrepôt');
 if(ctx.merchandising?.assortment?.status==='UNKNOWN')missing.push('assortiment');
 if(ctx.replenishment?.missingInputs?.includes('sales.velocity'))missing.push('ventes article');
 return missing
}
function sourceLabel(source){if(!source)return'par défaut';const map={DEFAULT:'défaut',NETWORK:'réseau',STORE:'magasin',CATEGORY:'catégorie',ITEM:'article'};return source.label?`${source.label} · ${map[source.type]||source.type}`:(map[source.type]||source.type)}
function recommendationWhy(c){
 const r=c.replenishment||{},m=r.metrics||{},p=r.policy||{},s=r.policySource||{},rules=(r.appliedRules||[]).map(x=>x.name).filter(Boolean);
 return `<details class="manager-reco-why"><summary>Pourquoi ${qty(r.actionQty)} ? <span>⌄</span></summary><div class="manager-reco-why-body"><div class="manager-reco-math"><div><span>Vente pondérée</span><strong>${m.dailyVelocity==null?'—':qty(m.dailyVelocity)+'/j'}</strong></div><div><span>Couverture cible</span><strong>${m.targetDays==null?'—':qty(m.targetDays)+' j'}</strong></div><div><span>Besoin brut</span><strong>${m.rawNeed==null?'—':qty(m.rawNeed)}</strong></div><div><span>Colisage</span><strong>${qty(p.packSize)}</strong></div></div><div class="manager-policy-grid"><div><span>Lead time</span><strong>${qty(p.leadTimeDays)} j</strong><small>${esc(sourceLabel(s.leadTimeDays))}</small></div><div><span>Sécurité</span><strong>${qty(p.safetyDays)} j</strong><small>${esc(sourceLabel(s.safetyDays))}</small></div><div><span>MOQ</span><strong>${qty(p.minOrderQty)}</strong><small>${esc(sourceLabel(s.minOrderQty))}</small></div><div><span>Facteur promo</span><strong>${qty(p.promoFactor)}</strong><small>${r.promotionFactorApplied?'appliqué':'non appliqué'}</small></div></div>${rules.length?`<div class="manager-policy-rules"><span>Règles appliquées</span><strong>${esc(rules.join(' → '))}</strong></div>`:''}</div></details>`
}
function requestCard(c){
 if(!lastRequest||lastRequest.product_number!==c.item.productNumber)return'';
 const closed=['RECEIVED','REJECTED','CANCELLED'].includes(lastRequest.status),remaining=lastRequest.remainingQty??Math.max(0,Number(lastRequest.requested_qty||0)-Number(lastRequest.received_qty||0));
 return `<section class="manager-replenishment-request ${closed?'closed':''}"><div><span>Demande de réappro</span><strong>${esc(lastRequest.id)}</strong><p>${esc(requestStatus[lastRequest.status]||lastRequest.status)} · ${qty(lastRequest.requested_qty)} ${esc(lastRequest.unit||c.item.unit||'')}</p></div><div class="manager-request-right"><b>${closed?'Clôturée':`${qty(remaining)} restant`}</b>${lastRequest.external_reference?`<small>ERP ${esc(lastRequest.external_reference)}</small>`:'<small>Aucun posting ERP simulé</small>'}</div></section>`
}

function resultHtml(c){
 const ap=assortmentPresentation(c.merchandising?.assortment),av=availabilityPresentation(c.availability?.state),taxonomy=taxPath(c.merchandising?.taxonomy),missing=sourceState(c),store=currentStore();
 const supplyMapped=!c.supplyStock?.mappingRequired&&!!c.supplyStock?.warehouseId,incoming=c.storeStock?.incomingStock,canRequest=['REPLENISH','PARTIAL'].includes(c.replenishment?.decision)&&c.replenishment?.ready;
 const recommendation=c.replenishment?.ready?`<div class="manager-scan-reco"><span>Recommandation StoreOps</span><strong>${esc(c.replenishment.presentation?.title||c.replenishment.decision)}</strong><p>${esc(c.replenishment.reason||'')}</p></div>${recommendationWhy(c)}`:'';
 const primary=canRequest&&!lastRequest?`<button class="btn brand manager-item-primary" data-create-replenishment>${esc(c.primaryAction?.label||`Demander ${qty(c.replenishment?.actionQty)}`)} →</button>`:`<button class="btn brand manager-item-primary ${c.primaryAction?.tone==='danger'?'danger-action':''}" data-manager-go="${esc(lastRequest?'inventory':c.primaryAction?.page||'managerMore')}">${esc(lastRequest?'Voir le suivi de la demande':c.primaryAction?.label||'Voir les actions')} →</button>`;
 return `<div class="manager-scan-result">
   <section class="manager-item-hero">
    <div class="manager-item-top"><div><span class="manager-eyebrow">${esc(c.item.productNumber||c.ean)} · ${esc(c.item.unit||'')}</span><h2>${esc(c.item.name)}</h2>${taxonomy?`<p>${esc(taxonomy)}</p>`:''}</div><span class="manager-state ${av.tone}">${esc(av.label)}</span></div>
    <div class="manager-item-price"><div><span>Prix attendu</span><strong>${money(c.pricing?.expectedUnitPrice)}</strong>${c.pricing?.basePrice!=null&&Number(c.pricing.basePrice)!==Number(c.pricing.expectedUnitPrice)?`<small>Prix fiche ${money(c.pricing.basePrice)}</small>`:''}</div>${c.pricing?.promoLabel?`<div class="manager-promo-pill"><span>Promo active</span><strong>${esc(c.pricing.promoLabel)}</strong></div>`:'<div class="manager-promo-empty">Aucune promo active détectée</div>'}</div>
   </section>
   <section class="manager-assortment-line ${ap.tone}"><div><strong>${esc(ap.label)}</strong><small>${esc(ap.detail)}</small></div></section>
   <section class="manager-stock-glance"><div><span>${esc(store?.name||'Magasin')}</span><strong>${qty(c.storeStock?.availableStock)}</strong><small>disponible${c.storeStock?.warehouseId?` · ${esc(c.storeStock.warehouseId)}`:''}</small></div><div><span>Entrepôt</span><strong>${supplyMapped?qty(c.supplyStock.availableStock):'—'}</strong><small>${supplyMapped?`disponible · ${esc(c.supplyStock.warehouseId)}`:'source à connecter'}</small></div><div><span>En arrivée</span><strong>${incoming==null?'—':qty(incoming)}</strong><small>confirmé / en commande</small></div></section>
   ${recommendation}${requestCard(c)}${primary}
   ${!c.replenishment?.ready&&c.merchandising?.assortment?.status==='ASSORTED'?`<div class="manager-reco-pending"><strong>Commande intelligente en préparation</strong><span>${missing.length?`Il manque encore : ${esc(missing.join(', '))}.`:'Les signaux de demande ne sont pas encore suffisants.'} Aucun volume n’est inventé.</span></div>`:''}
   <details class="manager-item-details"><summary>Voir les détails article <span>⌄</span></summary><div class="manager-item-details-body"><div><span>EAN</span><strong>${esc(c.ean)}</strong></div><div><span>Physique magasin</span><strong>${qty(c.storeStock?.physicalStock)}</strong></div><div><span>Réservé</span><strong>${qty(c.storeStock?.reservedStock)}</strong></div><div><span>Lignes stock</span><strong>${c.storeStock?.rowCount??c.storeStock?.stockRowCount??'—'}</strong></div><div><span>Assortiment</span><strong>${esc(ap.label)}</strong></div><div><span>Catégorie</span><strong>${esc(taxonomy||c.item.category||'—')}</strong></div></div></details>
   <section class="manager-item-actions"><span class="manager-eyebrow">Autres actions</span><div>${(c.actions||[]).map(a=>`<button data-manager-go="${esc(a.page)}"><strong>${esc(a.label)}</strong><span>›</span></button>`).join('')}</div></section>
  </div>`
}

export async function renderManagerScan(){
 const store=currentStore();
 $('#managerScanContent').innerHTML=`<div class="manager-scan-shell"><div class="manager-scan-head"><span class="manager-eyebrow">${esc(store?.name||'Votre magasin')}</span><h2>Que voulez-vous vérifier ?</h2><p>Scannez un article. StoreOps rassemble prix, promo, assortiment et stock pour vous dire quoi faire.</p></div><div class="manager-scan-search"><input id="managerScanEan" inputmode="numeric" autocomplete="off" placeholder="Scanner ou saisir un code-barres" aria-label="Code-barres"><button id="managerScanGo" class="btn brand">Rechercher</button></div><div id="managerScanResult">${lastContext?resultHtml(lastContext):'<div class="manager-scan-empty"><strong>Prêt à scanner</strong><span>La fiche article s’affichera ici sans vous envoyer dans plusieurs menus.</span></div>'}</div></div>`;
 $('#managerScanGo')?.addEventListener('click',lookup);$('#managerScanEan')?.addEventListener('keydown',e=>{if(e.key==='Enter')lookup()});$('#managerScanResult')?.addEventListener('click',e=>{const btn=e.target.closest('[data-create-replenishment]');if(btn)createRequest(btn)});setTimeout(()=>$('#managerScanEan')?.focus(),50)
}

async function createRequest(btn){
 if(!lastContext||btn?.disabled)return;btn.disabled=true;btn.textContent='Création de la demande…';
 try{
  if(app.showcase){lastRequest={id:'DEMO-RREQ-001',product_number:lastContext.item.productNumber,requested_qty:lastContext.replenishment.actionQty,received_qty:0,remainingQty:lastContext.replenishment.actionQty,status:'REQUESTED',unit:lastContext.item.unit,external_reference:null};toast('Aperçu : demande créée en attente Direction.');}
  else lastRequest=await api(`/api/stores/${app.storeId}/replenishment-requests`,{method:'POST',body:JSON.stringify({ean:lastContext.ean})});
  $('#managerScanResult').innerHTML=resultHtml(lastContext);toast(`Demande ${lastRequest.id} créée · ${qty(lastRequest.requested_qty)} ${lastRequest.unit||''}`)
 }catch(e){
  if(e.code==='REPLENISHMENT_REQUEST_EXISTS'&&e.details?.requestId){try{lastRequest=await api(`/api/replenishment-requests/${encodeURIComponent(e.details.requestId)}`);$('#managerScanResult').innerHTML=resultHtml(lastContext);toast('Une demande active existe déjà : suivi affiché.');return}catch{}}
  btn.disabled=false;btn.textContent=lastContext.primaryAction?.label||'Créer la demande';toast(e.message)
 }
}

async function lookup(){
 const input=$('#managerScanEan'),code=String(input?.value||'').trim();if(!code)return toast('Scannez ou saisissez un code-barres.');
 const host=$('#managerScanResult');host.innerHTML='<div class="manager-scan-loading"><i></i><strong>Analyse de l’article…</strong><span>Prix, assortiment et stock</span></div>';
 try{lastRequest=null;lastContext=await api(`/api/stores/${app.storeId}/item-assistant/${encodeURIComponent(code)}`);host.innerHTML=resultHtml(lastContext)}catch(e){lastContext=null;lastRequest=null;host.innerHTML=`<div class="manager-scan-error"><strong>Article non trouvé</strong><span>${esc(e.message||'Impossible de lire cet article.')}</span><button class="btn soft" id="managerScanRetry">Réessayer</button></div>`;$('#managerScanRetry')?.addEventListener('click',()=>{host.innerHTML='';input?.focus()})}
}

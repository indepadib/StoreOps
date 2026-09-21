import { api } from '../api.js';
import { app,canManage,isDirector } from '../state.js';
import { $,esc,status,fmtMoney,toast } from '../ui.js';

const LABEL={READY_TO_POST:'Prête à exporter',APPROVAL_REQUIRED:'Validation Direction',APPROVED:'Approuvée · exportable',POSTED:'Traitée',CANCELLED:'Annulée'};
const TYPE={READY_TO_POST:'warn',APPROVAL_REQUIRED:'danger',APPROVED:'warn',POSTED:'ok',CANCELLED:'neutral'};
let cfg=null,quickProduct=null,quickReason=null;
const UNIT_UI={G:'g',GR:'g',GRAMME:'g',GRAMMES:'g',KG:'kg',KGS:'kg',KILOGRAMME:'kg',KILOGRAMMES:'kg',L:'L',LT:'L',LITRE:'L',LITRES:'L',PC:'pièce',PCS:'pièce',PIECE:'pièce',PIECES:'pièce',EA:'pièce'};
function uiUnit(v){const k=String(v||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'');return UNIT_UI[k]||String(v||'').trim()||null}
function basisLabel(amount,unit,qty=1){if(amount==null)return null;const q=Number(qty||1);return `${fmtMoney(amount)}${unit?` / ${q!==1?`${q} `:''}${esc(uiUnit(unit)||unit)}`:''}`}
function preferLossUnit(product){const wanted=uiUnit(product?.costUnit||product?.unit||product?.retailUnit),select=$('#lossUnit');if(!wanted||!select)return;const option=[...select.options].find(o=>uiUnit(o.value)===wanted);if(option)select.value=option.value}


export async function renderLosses(){
  const [config,data]=await Promise.all([api('/api/loss/config'),api(`/api/stores/${app.storeId}/losses`)]);cfg=config;quickProduct=null;quickReason=null;
  const s=data.summary||{},items=data.items||[],attention=Number(s.pendingApproval||0)+Number(s.pendingEvidence||0);
  $('#lossesContent').innerHTML=`
    ${canManage()?quickPanel(config):'<div class="banner ban-info"><strong>Lecture seule.</strong><span>La saisie est réservée au Responsable magasin et à la Direction.</span></div>'}
    <div class="loss-overview">
      ${miniKpi('Aujourd’hui',s.records||0)}
      ${miniKpi('À traiter',attention,attention?'warn':'')}
      ${miniKpi('Valeur au coût',s.costUnvaluedRecords?`${fmtMoney(s.costValue||0)} · ${Number(s.costCoverage||0)}%`:`${fmtMoney(s.costValue||0)} · 100%`,s.costUnvaluedRecords?'warn':'')}
      ${miniKpi('Couverture coût',`${Number(s.costCoverage||0)}%`,s.costUnvaluedRecords?'warn':'')}
    </div>
    ${attention?'<div class="banner ban-warn loss-followup-banner"><strong>La saisie est faite, StoreOps garde le suivi.</strong><span>Les preuves et validations Direction encore nécessaires sont listées ci-dessous. L’export Excel reste disponible sans write-back D365.</span></div>':''}
    <details class="card loss-advanced" ${items.length?'open':''}>
      <summary><div><strong>Suivi & export Excel</strong><span>Preuves, validations Direction, historique et fichier de traitement.</span></div><b>⌄</b></summary>
      <div class="loss-advanced-body">
        ${excelExportPanel(items)}
        ${isDirector()?policyPanel(config.policy):''}
        <div class="loss-register">
          <div class="row"><div><strong>Registre démarque & pertes</strong><div class="small muted">Toutes les sorties du jour, avec leur statut réel.</div></div><span class="pill">${items.length} ligne(s)</span></div>
          <div class="loss-list">${items.length?items.map(lossCard).join(''):'<div class="empty">Aucune perte enregistrée aujourd’hui.</div>'}</div>
        </div>
      </div>
    </details>`;
  bind();
  setTimeout(async()=>{let prefill='';try{prefill=sessionStorage.getItem('storeops_express_prefill_ean')||'';sessionStorage.removeItem('storeops_express_prefill_ean')}catch{}const input=$('#lossEan');if(input&&prefill){input.value=prefill;await lookupProduct()}else input?.focus?.()},80);
}

function miniKpi(label,value,type=''){return`<div class="loss-mini-kpi ${type}"><span>${esc(label)}</span><strong>${value}</strong></div>`}
function quickPanel(config){return`<section class="card loss-express">
  <div class="loss-express-head"><div><span class="manager-eyebrow">DÉMARQUE EXPRESS</span><h2>Scanner, choisir le motif, enregistrer.</h2><p>La preuve et l’approbation sont déclenchées automatiquement selon la valeur et la politique réseau.</p></div><span class="pill">Terrain</span></div>
  <div class="loss-scan-row">
    <label><span>1 · Scanner l’article</span><input id="lossEan" inputmode="numeric" autocomplete="off" placeholder="Scanner ou saisir le code-barres"></label>
    <button class="btn soft" id="lossLookupBtn">Identifier</button>
  </div>
  <div id="lossProductPreview" class="loss-product-preview"><span>Le produit apparaîtra ici après le scan.</span></div>
  <div class="loss-step-label">2 · Pourquoi sort-il du stock ?</div>
  <div class="loss-reason-chips">${config.reasons.map(x=>`<button type="button" class="loss-reason-chip" data-loss-reason="${x.code}">${esc(x.label)}</button>`).join('')}</div>
  <div class="loss-qty-row">
    <div><span class="loss-step-label">3 · Quantité</span><div class="loss-stepper"><button type="button" id="lossQtyMinus">−</button><input id="lossQty" type="number" min="0.001" step="1" inputmode="decimal" value="1"><button type="button" id="lossQtyPlus">+</button></div></div>
    <label><span>Unité</span><select id="lossUnit">${config.units.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>
  </div>
  <details class="loss-comment"><summary>Ajouter un commentaire <span>+</span></summary><textarea id="lossNote" rows="2" placeholder="Ex. bouteille cassée en rayon, produit isolé..."></textarea></details>
  <button class="btn brand loss-primary-cta" id="createLossBtn">Enregistrer & article suivant</button>
  <div class="loss-rules"><span>Preuve auto ≥ ${fmtMoney(config.policy.evidence_threshold_dh)}</span><span>Direction auto ≥ ${fmtMoney(config.policy.approval_threshold_dh)}</span></div>
</section>`}

function renderProductPreview(product,error=''){
 const el=$('#lossProductPreview');if(!el)return;
 if(error){el.className='loss-product-preview error';el.innerHTML=`<strong>Article non identifié</strong><span>${esc(error)}</span>`;return}
 if(!product){el.className='loss-product-preview';el.innerHTML='<span>Le produit apparaîtra ici après le scan.</span>';return}
 el.className='loss-product-preview ready';
 const price=product.effectivePrice??product.price??product.basePrice;
 const priceLabel=price==null?'Prix non disponible':basisLabel(price,product.retailUnit,product.retailPriceQuantity||1);
 const cost=product.unitCost==null?null:Number(product.unitCost),costLabel=cost==null?`Coût ${product.costReason==='COST_MAPPING_UNMAPPED'?'à connecter':'non disponible'}`:`Coût ${basisLabel(cost,product.costUnit,product.costBasisQuantity||1)}`;
 el.innerHTML=`<div><strong>${esc(product.name||'Article')}</strong><span>EAN ${esc(product.ean||$('#lossEan')?.value||'—')}${product.productNumber?` · ${esc(product.productNumber)}`:''}</span></div><div><b>${priceLabel}</b><span>${costLabel} · ${product.stock==null?'Stock non disponible':`Stock ${Number(product.stock)} ${esc(uiUnit(product.costUnit||product.unit)||'')}`}</span></div>`;
 preferLossUnit(product);
}
async function lookupProduct(){
 const ean=$('#lossEan')?.value.trim();if(!ean){renderProductPreview(null);return null}
 const btn=$('#lossLookupBtn');try{if(btn){btn.disabled=true;btn.textContent='Recherche…'}quickProduct=await api(`/api/stores/${app.storeId}/products/${encodeURIComponent(ean)}`);renderProductPreview(quickProduct);return quickProduct}catch(e){quickProduct=null;renderProductPreview(null,e.message);toast(e.message);return null}finally{if(btn){btn.disabled=false;btn.textContent='Identifier'}}
}
function selectReason(code){
 quickReason=code;
 document.querySelectorAll('[data-loss-reason]').forEach(b=>b.classList.toggle('active',b.dataset.lossReason===code));
}
function adjustQty(delta){const input=$('#lossQty');if(!input)return;const current=Number(input.value||0),next=Math.max(.001,current+delta);input.value=Number.isInteger(next)?String(next):String(Math.round(next*1000)/1000)}
async function saveQuickLoss(){
 const btn=$('#createLossBtn');if(btn?.disabled)return;
 try{
  const ean=$('#lossEan')?.value.trim(),quantity=Number($('#lossQty')?.value),unit=$('#lossUnit')?.value||'pièce',note=$('#lossNote')?.value.trim()||'';
  if(!ean)throw new Error('Scanne ou saisis l’EAN.');
  if(!quickReason)throw new Error('Choisis le motif de la démarque.');
  if(!Number.isFinite(quantity)||quantity<=0)throw new Error('Quantité invalide.');
  btn.disabled=true;btn.textContent='Enregistrement…';
  const record=await api(`/api/stores/${app.storeId}/losses`,{method:'POST',body:JSON.stringify({ean,reasonCode:quickReason,quantity,unit,note})});
  if(record.status==='APPROVAL_REQUIRED')toast('Démarque enregistrée · validation Direction requise automatiquement.');
  else if(record.requires_evidence&&!record.evidence_satisfied)toast('Démarque enregistrée · preuve à joindre dans le suivi.');
  else toast('Démarque enregistrée. Scanne l’article suivant.');
  await renderLosses();
 }catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent='Enregistrer & article suivant'}}
}

function excelExportPanel(items=[]){
 if(!canManage())return'';
 return`<div class="loss-closing-card">
  <div class="row"><div><strong>Export Excel démarque</strong><div class="small muted">${items.length} ligne(s) du jour · coût et prix de vente séparés · aucun posting D365.</div></div>${status(items.length?'Prêt':'Vide',items.length?'ok':'neutral')}</div>
  <div class="banner ban-info" style="margin-top:10px"><strong>Valorisation par unité réelle</strong><span>Ex. 6 000 g vendus à 5,50 DH/kg = 6 kg × 5,50 = 33 DH. Le classeur affiche les unités et facteurs de conversion. Les valeurs non prouvées restent vides.</span></div>
  <div class="row" style="margin-top:12px"><button class="btn brand" id="exportLossExcelBtn" ${items.length?'':'disabled'}>Exporter la démarque en Excel</button><span class="small muted">Téléchargement uniquement · aucune écriture ERP.</span></div>
 </div>`
}
function policyPanel(p){return`<details class="loss-policy"><summary><strong>Politique réseau</strong><span>Direction</span></summary><div class="form-grid" style="margin-top:12px"><div class="field"><label>Preuve obligatoire à partir de</label><input id="lossEvidenceThreshold" type="number" min="0" step="1" value="${Number(p.evidence_threshold_dh)}"></div><div class="field"><label>Validation Direction à partir de</label><input id="lossApprovalThreshold" type="number" min="0" step="1" value="${Number(p.approval_threshold_dh)}"></div></div><button class="btn soft" id="saveLossPolicyBtn">Enregistrer la politique</button></details>`}
function lossCard(x){
 const proofOk=!!x.evidence_satisfied||x.incident?.status==='RESOLVED',proofSource=x.external_evidence?.source==='DLC'?' · DLC liée':'';
 const evidence=x.requires_evidence?`<span class="loss-flag">Preuve ${proofOk?'✓':'requise'}${proofOk?proofSource:''}</span>`:'';
 const source=x.source_type==='DLC_TREATMENT'?'<span class="loss-flag">Créée depuis DLC</span>':'';
 const approval=x.status==='APPROVAL_REQUIRED'?'<span class="loss-flag danger">Direction requise</span>':x.approved_by_name?`<span class="loss-flag">Approuvée · ${esc(x.approved_by_name)}</span>`:'';
 const posting=x.status==='POSTED'&&x.posted_method?`<span class="loss-flag">${x.posted_method==='FILE_IMPORT'?'Import fichier':'API'}${x.posted_reference?` · ${esc(x.posted_reference)}`:''}</span>`:'';
 const retailEq=x.retail_equivalent_qty!=null&&x.retail_price_unit?` · ${Number(x.retail_equivalent_qty)} ${esc(uiUnit(x.retail_price_unit)||x.retail_price_unit)} vente`:'';
 const costEq=x.cost_equivalent_qty!=null&&x.cost_unit?` · ${Number(x.cost_equivalent_qty)} ${esc(uiUnit(x.cost_unit)||x.cost_unit)} coût`:'';
 return`<article class="loss-row ${x.status==='POSTED'?'done':''}"><div class="loss-main"><div class="row"><div><strong>${esc(x.product_name)}</strong><div class="small muted">EAN ${esc(x.ean)} · ${esc(x.category||'Autre')}</div></div>${status(LABEL[x.status]||x.status,TYPE[x.status]||'neutral')}</div><div class="loss-meta"><span><b>${Number(x.quantity)} ${esc(x.unit)}</b>${retailEq}${costEq}</span><span>${esc(cfg?.reasons.find(r=>r.code===x.reason_code)?.label||x.reason_code)}</span><span>${x.total_cost_value==null?'Coût non valorisé':`${fmtMoney(x.total_cost_value)} au coût`}</span><span class="muted">${x.total_retail_value==null?'Prix vente non valorisé':`${fmtMoney(x.total_retail_value)} prix vente`}</span></div>${x.note?`<div class="small loss-note">${esc(x.note)}</div>`:''}<div class="loss-flags">${source}${evidence}${approval}${posting}</div></div><div class="loss-actions">${x.incident_id&&x.incident?.status!=='RESOLVED'?`<button class="btn soft" data-open-incident="${x.incident_id}">Traiter preuve</button>`:''}${isDirector()&&x.status==='APPROVAL_REQUIRED'?`<button class="btn soft" data-approve-loss="${x.id}">Approuver</button>`:''}</div></article>`;
}
function downloadFile(file){const blob=new Blob([file.content],{type:file.mimeType||'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.fileName||'demarque.xls';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function bind(){
 $('#lossLookupBtn')?.addEventListener('click',lookupProduct);
 $('#lossEan')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookupProduct()}});
 document.querySelectorAll('[data-loss-reason]').forEach(b=>b.addEventListener('click',()=>selectReason(b.dataset.lossReason)));
 $('#lossQtyMinus')?.addEventListener('click',()=>adjustQty(-1));$('#lossQtyPlus')?.addEventListener('click',()=>adjustQty(1));
 $('#lossQty')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveQuickLoss()}});
 $('#createLossBtn')?.addEventListener('click',saveQuickLoss);
 document.querySelectorAll('[data-approve-loss]').forEach(b=>b.onclick=async()=>{try{await api(`/api/losses/${b.dataset.approveLoss}/approve`,{method:'POST'});toast('Perte approuvée par la Direction.');renderLosses()}catch(e){toast(e.message)}});
 const excel=$('#exportLossExcelBtn');if(excel)excel.onclick=async()=>{try{excel.disabled=true;excel.textContent='Préparation Excel…';const result=await api(`/api/stores/${app.storeId}/losses/export-excel`,{method:'POST'});downloadFile(result.file);toast(result.revaluation?.revalued?`Export généré · ${result.revaluation.revalued} ancienne(s) ligne(s) revalorisée(s).`:'Export Excel démarque généré · aucune écriture D365.')}catch(e){toast(e.message)}finally{excel.disabled=false;excel.textContent='Exporter la démarque en Excel'}};
 const save=$('#saveLossPolicyBtn');if(save)save.onclick=async()=>{try{await api('/api/loss/policy',{method:'PUT',body:JSON.stringify({evidenceThreshold:Number($('#lossEvidenceThreshold').value),approvalThreshold:Number($('#lossApprovalThreshold').value)})});toast('Politique démarque mise à jour.');renderLosses()}catch(e){toast(e.message)}};
}

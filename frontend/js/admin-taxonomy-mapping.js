import {api} from './api.js';
import {isDirector} from './state.js';
import {esc,status,toast} from './ui.js';

const ID='taxonomyMappingStudio';
let current=null,busy=false;
const tone=v=>v==='LIVE'?'ok':v==='VALIDATED'?'info':v==='DRAFT'?'warn':'neutral';
const label=v=>({LIVE:'LIVE',VALIDATED:'Validé',DRAFT:'Brouillon',DISABLED:'Désactivé'})[v]||'Non configuré';
const host=()=>document.getElementById('integrationsStudioSection');
const sampleKey='storeops.taxonomy.sampleSku';
function savedSample(v){try{if(v!==undefined)localStorage.setItem(sampleKey,v);return localStorage.getItem(sampleKey)||''}catch{return v||''}}
function val(id){return document.getElementById(id)?.value?.trim()||''}
function seed(){
 const m=current?.mapping||{},f=m.fields||{};
 return{
  categoryEntity:m.categoryEntity||'ProcurementProductCategories',
  assignmentEntity:m.assignmentEntity||'ProductCategoryAssignments',
  hierarchyKey:m.hierarchyKey||'PROCUREMENT',
  fields:{
   categoryId:f.categoryId||'CategoryId',
   categoryName:f.categoryName||'CategoryName',
   parentCategoryId:f.parentCategoryId||'ParentCategoryId',
   categoryLevel:f.categoryLevel||'CategoryLevel',
   categoryPath:f.categoryPath||'CategoryPath',
   categoryHierarchy:f.categoryHierarchy||'CategoryHierarchyName',
   assignmentProduct:f.assignmentProduct||'ProductNumber',
   assignmentCategory:f.assignmentCategory||'CategoryId',
   assignmentHierarchy:f.assignmentHierarchy||'ProductCategoryHierarchyName'
  }
 }
}
function input(id,name,value,required=false){return `<label><span>${esc(name)}${required?' *':''}</span><input id="${id}" value="${esc(value||'')}"></label>`}
function smokeHtml(s){
 if(!s)return'';
 const cats=(s.sampleCategories||[]).map(x=>[x.categoryName,x.path].filter(Boolean).join(' · ')).filter(Boolean);
 return `<div class="banner ${s.status==='PASSED'?'ban-ok':'ban-danger'}"><strong>Smoke ${esc(s.status||'—')}</strong><span>${Number(s.assignmentRows||0)} affectation(s) article · ${Number(s.resolvedCategoryIds?.length||0)} catégorie(s) résolue(s) · ${Number(s.unresolvedCategoryIds?.length||0)} non résolue(s).</span></div>${cats.length?`<div class="taxonomy-sample-path"><strong>Catégories détectées</strong><span>${cats.map(esc).join(' → ')}</span></div>`:''}`
}
function payload(){
 return{categoryEntity:val('taxCategoryEntity'),assignmentEntity:val('taxAssignmentEntity'),hierarchyKey:val('taxHierarchyKey'),fields:{
  categoryId:val('taxCategoryId'),categoryName:val('taxCategoryName'),parentCategoryId:val('taxParentId'),categoryLevel:val('taxLevel'),categoryPath:val('taxPath'),categoryHierarchy:val('taxCategoryHierarchy'),
  assignmentProduct:val('taxAssignmentProduct'),assignmentCategory:val('taxAssignmentCategory'),assignmentHierarchy:val('taxAssignmentHierarchy')
 }}
}
async function load(){current=await api('/api/admin/integrations/d365-taxonomy-mapping')}
function render(){
 const h=host();if(!h)return;let section=document.getElementById(ID);if(!section){section=document.createElement('div');section.id=ID;section.className='taxonomy-map-studio';h.appendChild(section)}
 const s=seed(),f=s.fields,m=current?.mapping||null,can=!!current?.canManage;
 section.innerHTML=`<div class="row"><div><div class="label">TAXONOMIE D365</div><h4>Rayon → Catégorie → Famille</h4><p class="small muted">Mappe le référentiel catégories et les affectations article. Les valeurs ci-dessous sont des candidats à confirmer par smoke, pas des champs supposés valides.</p></div>${status(label(m?.state),tone(m?.state))}</div>
 <div class="taxonomy-map-grid">
  ${input('taxCategoryEntity','Entité catégories',s.categoryEntity,true)}
  ${input('taxAssignmentEntity','Entité affectations produit',s.assignmentEntity,true)}
  ${input('taxHierarchyKey','Clé hiérarchie StoreOps',s.hierarchyKey,true)}
  ${input('taxCategoryId','Category ID',f.categoryId,true)}
  ${input('taxCategoryName','Category name',f.categoryName,true)}
  ${input('taxParentId','Parent category',f.parentCategoryId)}
  ${input('taxLevel','Level',f.categoryLevel)}
  ${input('taxPath','Path',f.categoryPath)}
  ${input('taxCategoryHierarchy','Hierarchy catégories',f.categoryHierarchy)}
  ${input('taxAssignmentProduct','Product number sur assignment',f.assignmentProduct,true)}
  ${input('taxAssignmentCategory','Category ID sur assignment',f.assignmentCategory,true)}
  ${input('taxAssignmentHierarchy','Hierarchy sur assignment',f.assignmentHierarchy)}
  <label><span>Article témoin *</span><input id="taxSampleSku" value="${esc(savedSample())}" placeholder="Ex. HS-004873"></label>
 </div>
 <div class="taxonomy-map-actions">
  ${can?'<button class="btn ghost" id="taxSave">Enregistrer brouillon</button><button class="btn soft" id="taxSmoke">Tester sur un article</button>':''}
  ${can&&m?.state==='VALIDATED'?'<button class="btn brand" id="taxActivate">Activer taxonomie LIVE</button>':''}
  ${can&&m?.state==='LIVE'?'<button class="btn ghost" id="taxDisable">Désactiver</button>':''}
 </div>
 <div id="taxResult">${smokeHtml(m?.smoke)}</div>
 ${m?.state==='LIVE'?'<div class="banner ban-ok" style="margin-top:10px"><strong>Taxonomie connectée</strong><span>Les prochaines synchronisations catégories utiliseront ce mapping StoreOps validé.</span></div>':''}`;
 bind()
}
async function refresh(msg=''){await load();render();if(msg)toast(msg)}
async function save(){try{await api('/api/admin/integrations/d365-taxonomy-mapping/draft',{method:'POST',body:payload()});await refresh('Brouillon taxonomie enregistré.')}catch(e){toast(e.message)}}
async function smoke(){
 if(busy)return;const sku=val('taxSampleSku');if(!sku)return toast('Article témoin obligatoire.');savedSample(sku);busy=true;
 try{await api('/api/admin/integrations/d365-taxonomy-mapping/smoke',{method:'POST',body:{productNumber:sku,mapping:payload()}});await refresh('Smoke taxonomie terminé.')}catch(e){toast(e.message);await refresh()}
 finally{busy=false}
}
async function activate(){try{await api('/api/admin/integrations/d365-taxonomy-mapping/activate',{method:'POST'});await refresh('Taxonomie D365 activée.')}catch(e){toast(e.message)}}
async function disable(){try{await api('/api/admin/integrations/d365-taxonomy-mapping/disable',{method:'POST'});await refresh('Taxonomie D365 désactivée.')}catch(e){toast(e.message)}}
function bind(){
 document.getElementById('taxSave')?.addEventListener('click',save);
 document.getElementById('taxSmoke')?.addEventListener('click',smoke);
 document.getElementById('taxActivate')?.addEventListener('click',activate);
 document.getElementById('taxDisable')?.addEventListener('click',disable);
 document.getElementById('taxSampleSku')?.addEventListener('change',e=>savedSample(e.target.value.trim()))
}
async function mount(){if(!isDirector()||!host()||document.getElementById(ID))return;try{await load();render()}catch(e){console.warn('Taxonomy Mapping Studio',e)}}

const style=document.createElement('style');style.textContent=`.taxonomy-map-studio{margin-top:16px;padding:18px;border:1px solid var(--line);border-radius:20px;background:#fff}.taxonomy-map-studio h4{font-size:20px;margin:4px 0}.taxonomy-map-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.taxonomy-map-grid label{display:grid;gap:4px;font-size:9px;color:var(--muted)}.taxonomy-map-grid input{min-width:0;border:1px solid var(--line);border-radius:10px;padding:9px;font:inherit;font-size:11px}.taxonomy-map-actions{display:flex;gap:8px;flex-wrap:wrap}.taxonomy-sample-path{padding:11px;border:1px solid var(--line);border-radius:13px;background:#f7f4f5;margin-top:8px}.taxonomy-sample-path strong,.taxonomy-sample-path span{display:block}.taxonomy-sample-path span{font-size:10px;color:var(--muted);margin-top:4px}@media(max-width:950px){.taxonomy-map-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.taxonomy-map-grid{grid-template-columns:1fr}.taxonomy-map-actions .btn{width:100%}}`;
document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(mount)).observe(document.body,{childList:true,subtree:true});
queueMicrotask(mount);

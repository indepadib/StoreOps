import {api} from './api.js';
import {isDirector} from './state.js';
import {esc,status,toast} from './ui.js';

const ID='costMappingStudio';
let current=null;

function tone(v){return v==='LIVE'?'ok':v==='VALIDATED'?'info':v==='DRAFT'?'warn':'neutral'}
function label(v){return({LIVE:'LIVE',VALIDATED:'Validé',DRAFT:'Brouillon',DISABLED:'Désactivé'})[v]||'Non configuré'}
function host(){return document.getElementById('integrationsStudioSection')}
function v(id){return document.getElementById(id)?.value?.trim()||''}
function seed(){
 const saved=current?.mapping||{};
 return{entity:saved.entity||'',fields:{
  item:saved.fields?.item||'',cost:saved.fields?.cost||'',validFrom:saved.fields?.validFrom||'',validTo:saved.fields?.validTo||'',
  currency:saved.fields?.currency||'',warehouse:saved.fields?.warehouse||'',site:saved.fields?.site||'',unit:saved.fields?.unit||'',
  quantity:saved.fields?.quantity||'',recordId:saved.fields?.recordId||''
 }}
}
function input(id,labelText,value,req=false,placeholder=''){
 return `<label><span>${esc(labelText)}${req?' *':''}</span><input id="${id}" value="${esc(value||'')}" placeholder="${esc(placeholder)}"></label>`
}
function smokeHtml(s){
 if(!s)return '<div class="banner ban-info"><strong>Aucune hypothèse de coût</strong><span>Renseignez uniquement l’entité et les champs réellement observés dans D365, puis testez avec un SKU témoin.</span></div>';
 return `<div class="banner ${s.status==='PASSED'?'ban-ok':'ban-danger'}"><strong>Smoke ${esc(s.status||'—')}</strong><span>${Number(s.matchingRows||0)} ligne(s) exploitables pour l’article témoin. ${esc(s.note||'')}</span></div>`
}
function payload(){
 return{entity:v('costEntity'),fields:{item:v('costItem'),cost:v('costValue'),validFrom:v('costFrom'),validTo:v('costTo'),currency:v('costCurrency'),warehouse:v('costWarehouse'),site:v('costSite'),unit:v('costUnit'),quantity:v('costQuantity'),recordId:v('costRecord')}}
}
function render(){
 const h=host();if(!h)return;let root=document.getElementById(ID);if(!root){root=document.createElement('div');root.id=ID;root.className='integration-cost-mapping';h.appendChild(root)}
 const s=seed(),f=s.fields;
 root.innerHTML=`<div class="row"><div><div class="label">COÛT & VALORISATION D365</div><h4>Valoriser la démarque avec le vrai coût</h4><p class="small muted">Aucun CostPrice générique n’est utilisé. Le coût devient LIVE uniquement après un smoke sur la source réelle.</p></div>${status(label(current?.mapping?.state),tone(current?.mapping?.state))}</div>
 <div class="cost-map-grid">
  ${input('costEntity','Entité coût',s.entity,true,'Entité D365 réellement validée')}
  ${input('costItem','Champ article / SKU',f.item,true)}
  ${input('costValue','Champ coût',f.cost,true)}
  ${input('costFrom','Date début',f.validFrom)}
  ${input('costTo','Date fin',f.validTo)}
  ${input('costCurrency','Devise',f.currency)}
  ${input('costWarehouse','Warehouse',f.warehouse)}
  ${input('costSite','Site',f.site)}
  ${input('costUnit','Unité',f.unit)}
  ${input('costQuantity','Quantité de coût',f.quantity)}
  ${input('costRecord','Record ID',f.recordId)}
  ${input('costSampleSku','SKU témoin','',true,'Article connu dans D365')}
 </div>
 <div class="cost-map-actions">
  ${current?.canManage?'<button class="btn ghost" id="costSave">Enregistrer brouillon</button><button class="btn soft" id="costSmoke">Tester le coût</button>':''}
  ${current?.canManage&&current?.mapping?.state==='VALIDATED'?'<button class="btn brand" id="costActivate">Activer coût LIVE</button>':''}
  ${current?.canManage&&current?.mapping?.state==='LIVE'?'<button class="btn ghost" id="costDisable">Désactiver</button>':''}
 </div>
 <div id="costResult">${smokeHtml(current?.mapping?.smoke)}</div>`;
 bind()
}
async function refresh(message=''){current=await api('/api/admin/integrations/d365-cost-mapping');render();if(message)toast(message)}
async function save(){try{await api('/api/admin/integrations/d365-cost-mapping/draft',{method:'POST',body:payload()});await refresh('Brouillon coût enregistré.')}catch(e){toast(e.message)}}
async function smoke(){
 const sku=v('costSampleSku'),box=document.getElementById('costResult');if(!sku)return toast('Saisissez un SKU témoin.');
 if(box)box.innerHTML='<div class="small muted">Lecture du coût D365…</div>';
 try{const mapping=await api('/api/admin/integrations/d365-cost-mapping/smoke',{method:'POST',body:{productNumber:sku,mapping:payload()}});current={...(current||{}),mapping};render();toast(mapping.smoke?.status==='PASSED'?'Source de coût validée.':'Source de coût à corriger.')}
 catch(e){if(box)box.innerHTML=`<div class="banner ban-danger"><strong>Smoke impossible</strong><span>${esc(e.message)}</span></div>`;toast(e.message)}
}
async function activate(){try{await api('/api/admin/integrations/d365-cost-mapping/activate',{method:'POST',body:{}});await refresh('Coût D365 activé LIVE.')}catch(e){toast(e.message)}}
async function disable(){try{await api('/api/admin/integrations/d365-cost-mapping/disable',{method:'POST',body:{}});await refresh('Source coût désactivée.')}catch(e){toast(e.message)}}
function bind(){
 document.getElementById('costSave')?.addEventListener('click',save);
 document.getElementById('costSmoke')?.addEventListener('click',smoke);
 document.getElementById('costActivate')?.addEventListener('click',activate);
 document.getElementById('costDisable')?.addEventListener('click',disable)
}
async function mount(){
 if(!isDirector())return;const h=host();if(!h||document.getElementById(ID))return;
 try{current=await api('/api/admin/integrations/d365-cost-mapping');render()}catch(e){console.warn('Cost mapping studio',e)}
}
const style=document.createElement('style');style.textContent=`.integration-cost-mapping{margin-top:14px;padding:18px;border:1px solid var(--line);border-radius:20px;background:#fff}.integration-cost-mapping h4{font-size:20px;margin:4px 0}.cost-map-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.cost-map-grid label{display:grid;gap:4px;font-size:9px;color:var(--muted)}.cost-map-grid input{min-width:0;border:1px solid var(--line);border-radius:10px;padding:9px;background:#fff;font:inherit;font-size:11px}.cost-map-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}#costResult{margin-top:10px}@media(max-width:950px){.cost-map-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.cost-map-grid{grid-template-columns:1fr}.cost-map-actions .btn{width:100%}}`;
document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(mount)).observe(document.body,{childList:true,subtree:true});queueMicrotask(mount);

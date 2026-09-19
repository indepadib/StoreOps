import {api} from './api.js';
import {isDirector} from './state.js';
import {esc,status,toast} from './ui.js';

const ID='lossExportMappingStudio';
let data=null,draft=null,busy=false;

const DEFAULT_TEMPLATE={
 code:'D365_LOSS_IMPORT',name:'Dynamics 365 — Import démarque',target:'D365_FILE_IMPORT',version:'1',
 delimiter:';',extension:'csv',encoding:'utf-8',includeHeader:true,fileNamePattern:'demarque_{storeId}_{businessDate}.{extension}',
 columns:[
  {name:'Date',source:'business_date',required:true,type:'date',order:1},
  {name:'Warehouse',source:'store_id',required:true,type:'string',order:2},
  {name:'Item',source:'product_number',required:true,type:'string',order:3},
  {name:'Quantity',source:'quantity',required:true,type:'number',decimals:3,order:4},
  {name:'Unit',source:'unit',required:true,type:'string',order:5},
  {name:'Reason',source:'reason_code',required:true,type:'string',order:6}
 ]
};
const clone=x=>JSON.parse(JSON.stringify(x));
const tone=s=>s==='LIVE'?'ok':s==='VALIDATED'?'info':s==='DRAFT'?'warn':'neutral';
const label=s=>({LIVE:'LIVE',VALIDATED:'Structure validée',DRAFT:'Brouillon',DISABLED:'Désactivé'})[s]||'Non configuré';
const host=()=>document.getElementById('integrationsStudioSection');
function input(id,labelText,value,type='text'){return `<label><span>${esc(labelText)}</span><input id="${id}" type="${type}" value="${esc(value??'')}"></label>`}
function sourceOptions(value){return (data?.sourceFields||[]).map(x=>`<option value="${esc(x.key)}" ${x.key===value?'selected':''}>${esc(x.label)} · ${esc(x.key)}</option>`).join('')}
function typeOptions(value){return ['string','number','date','datetime','boolean'].map(x=>`<option value="${x}" ${x===value?'selected':''}>${x}</option>`).join('')}
async function load(){data=await api('/api/admin/loss-export-mapping');draft=clone(data?.mapping?.template||DEFAULT_TEMPLATE)}
function readTemplate(){
 const v=id=>document.getElementById(id)?.value??'';
 const rows=[...document.querySelectorAll('[data-loss-map-row]')].map((row,i)=>({
  name:row.querySelector('[data-col-name]')?.value.trim()||'',
  source:row.querySelector('[data-col-source]')?.value||'',
  required:!!row.querySelector('[data-col-required]')?.checked,
  type:row.querySelector('[data-col-type]')?.value||'string',
  decimals:row.querySelector('[data-col-decimals]')?.value===''?undefined:Number(row.querySelector('[data-col-decimals]')?.value),
  order:i+1
 }));
 return{code:v('lossMapCode').trim(),name:v('lossMapName').trim(),target:v('lossMapTarget').trim(),version:v('lossMapVersion').trim(),delimiter:v('lossMapDelimiter'),extension:v('lossMapExtension').trim(),encoding:'utf-8',includeHeader:!!document.getElementById('lossMapHeader')?.checked,fileNamePattern:v('lossMapFileName').trim(),columns:rows}
}
function previewHtml(p){
 if(!p)return'';
 return `<div class="banner ${p.status==='PASSED'?'ban-ok':'ban-danger'}"><strong>Preview ${esc(p.status||'—')}</strong><span>${esc(p.fileName||'')} · ${Number(p.rowCount||0)} ligne témoin · ${p.errors?.length||0} erreur(s).</span></div>${p.sampleContent?`<details class="loss-map-preview"><summary>Voir le fichier témoin</summary><pre>${esc(p.sampleContent)}</pre></details>`:''}`
}
function columnRow(c,i){
 return `<div class="loss-map-row" data-loss-map-row>
  <input data-col-name value="${esc(c.name||'')}" placeholder="Nom colonne ERP">
  <select data-col-source>${sourceOptions(c.source)}</select>
  <select data-col-type>${typeOptions(c.type||'string')}</select>
  <input data-col-decimals type="number" min="0" max="6" value="${c.decimals??''}" placeholder="Déc.">
  <label class="loss-map-required"><input data-col-required type="checkbox" ${c.required?'checked':''}> Oblig.</label>
  <button class="btn ghost" data-loss-remove="${i}" title="Supprimer">×</button>
 </div>`
}
function render(){
 const h=host();if(!h)return;
 let section=document.getElementById(ID);if(!section){section=document.createElement('div');section.id=ID;section.className='loss-map-studio';h.appendChild(section)}
 const m=data?.mapping||null,t=draft||clone(DEFAULT_TEMPLATE),can=!!data?.canManage;
 section.innerHTML=`<div class="row"><div><div class="label">CLOSING PACK / DÉMARQUE</div><h4>Mapping Studio ERP</h4><p class="small muted">Configure le canvas exact d’import sans toucher à Netlify. Le fichier ne devient confirmable qu’après preview réussi + référence d’import test réelle.</p></div>${status(label(m?.state),tone(m?.state))}</div>
 <div class="loss-map-meta">
  ${input('lossMapCode','Code template',t.code)}
  ${input('lossMapName','Nom',t.name)}
  ${input('lossMapTarget','Cible ERP',t.target)}
  ${input('lossMapVersion','Version',t.version)}
  ${input('lossMapDelimiter','Délimiteur',t.delimiter)}
  ${input('lossMapExtension','Extension',t.extension)}
  ${input('lossMapFileName','Nom fichier',t.fileNamePattern)}
  <label class="loss-map-header"><span>Entête</span><input id="lossMapHeader" type="checkbox" ${t.includeHeader!==false?'checked':''}> Inclure les noms de colonnes</label>
 </div>
 <div class="row loss-map-columns-head"><div><strong>Colonnes du fichier ERP</strong><div class="small muted">Chaque colonne est reliée à une donnée StoreOps connue.</div></div>${can?'<button class="btn ghost" id="lossMapAdd">+ Colonne</button>':''}</div>
 <div class="loss-map-table-head"><span>Colonne ERP</span><span>Source StoreOps</span><span>Type</span><span>Déc.</span><span>Requis</span><span></span></div>
 <div id="lossMapRows">${(t.columns||[]).map(columnRow).join('')}</div>
 <div class="loss-map-actions">
  ${can?'<button class="btn ghost" id="lossMapSave">Enregistrer brouillon</button><button class="btn soft" id="lossMapPreview">Tester le fichier témoin</button>':''}
  ${can&&m?.state==='VALIDATED'?'<input id="lossMapReference" placeholder="Référence import test Dynamics / batch"><button class="btn brand" id="lossMapActivate">Activer le template ERP</button>':''}
  ${can&&m?.state==='LIVE'?'<button class="btn ghost" id="lossMapDisable">Désactiver</button>':''}
 </div>
 <div id="lossMapResult">${previewHtml(m?.preview)}</div>
 ${m?.state==='LIVE'?`<div class="banner ban-ok" style="margin-top:10px"><strong>Closing Pack connecté</strong><span>Référence de validation : ${esc(m.validationReference||'—')}. Les prochains exports démarque utiliseront ce template.</span></div>`:''}`;
 bind()
}
async function refresh(msg=''){data=await api('/api/admin/loss-export-mapping');draft=clone(data?.mapping?.template||draft||DEFAULT_TEMPLATE);render();if(msg)toast(msg)}
async function save(){
 try{draft=readTemplate();await api('/api/admin/loss-export-mapping/draft',{method:'POST',body:draft});await refresh('Brouillon Closing Pack enregistré.')}catch(e){toast(e.message)}
}
async function preview(){
 if(busy)return;busy=true;draft=readTemplate();render();
 try{await api('/api/admin/loss-export-mapping/preview',{method:'POST',body:{template:draft}});await refresh('Structure du fichier validée.')}catch(e){toast(e.message);await refresh()}
 finally{busy=false}
}
async function activate(){
 const reference=document.getElementById('lossMapReference')?.value.trim()||'';if(!reference)return toast('Référence de l’import test Dynamics obligatoire.');
 try{await api('/api/admin/loss-export-mapping/activate',{method:'POST',body:{reference}});await refresh('Template ERP activé pour le Closing Pack.')}catch(e){toast(e.message)}
}
async function disable(){try{await api('/api/admin/loss-export-mapping/disable',{method:'POST'});await refresh('Template Closing Pack désactivé.')}catch(e){toast(e.message)}}
function bind(){
 document.getElementById('lossMapAdd')?.addEventListener('click',()=>{draft=readTemplate();draft.columns.push({name:'NouvelleColonne',source:data?.sourceFields?.[0]?.key||'business_date',required:false,type:'string',order:draft.columns.length+1});render()});
 document.querySelectorAll('[data-loss-remove]').forEach(b=>b.addEventListener('click',()=>{draft=readTemplate();draft.columns.splice(Number(b.dataset.lossRemove),1);render()}));
 document.getElementById('lossMapSave')?.addEventListener('click',save);
 document.getElementById('lossMapPreview')?.addEventListener('click',preview);
 document.getElementById('lossMapActivate')?.addEventListener('click',activate);
 document.getElementById('lossMapDisable')?.addEventListener('click',disable)
}
async function mount(){if(!isDirector()||!host()||document.getElementById(ID))return;try{await load();render()}catch(e){console.warn('Loss Export Mapping Studio',e)}}

const style=document.createElement('style');style.textContent=`.loss-map-studio{margin-top:16px;padding:18px;border:1px solid var(--line);border-radius:20px;background:#fff}.loss-map-studio h4{font-size:20px;margin:4px 0}.loss-map-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.loss-map-meta label{display:grid;gap:4px;font-size:9px;color:var(--muted)}.loss-map-meta input{border:1px solid var(--line);border-radius:10px;padding:9px;font:inherit}.loss-map-header{align-content:end}.loss-map-columns-head{margin:12px 0 8px}.loss-map-table-head,.loss-map-row{display:grid;grid-template-columns:1.1fr 1.6fr .7fr .45fr .65fr .35fr;gap:7px;align-items:center}.loss-map-table-head{font-size:9px;color:var(--muted);padding:0 5px 5px}.loss-map-row{padding:6px;border-top:1px solid var(--line)}.loss-map-row input,.loss-map-row select{min-width:0;border:1px solid var(--line);border-radius:9px;padding:8px;font:inherit;font-size:10px;background:#fff}.loss-map-required{font-size:9px;color:var(--muted);display:flex;gap:4px;align-items:center}.loss-map-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px}.loss-map-actions>input{min-width:260px;border:1px solid var(--line);border-radius:10px;padding:9px}.loss-map-preview pre{white-space:pre-wrap;overflow:auto;background:#f7f4f5;border-radius:12px;padding:10px;font-size:10px}.loss-map-preview{margin-top:8px}@media(max-width:950px){.loss-map-meta{grid-template-columns:1fr 1fr}.loss-map-table-head{display:none}.loss-map-row{grid-template-columns:1fr 1fr}.loss-map-row .btn{justify-self:end}}@media(max-width:560px){.loss-map-meta,.loss-map-row{grid-template-columns:1fr}.loss-map-actions .btn,.loss-map-actions>input{width:100%;min-width:0}}`;
document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(mount)).observe(document.body,{childList:true,subtree:true});
queueMicrotask(mount);

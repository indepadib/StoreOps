import {api} from './api.js';
import {app,isDirector} from './state.js';
import {esc,status,toast} from './ui.js';

const root=document.getElementById('adminStudioContent');
let mounting=false,stores=[],directory={status:'UNAVAILABLE',items:[]},selectedStoreId=null;

function sample(){return{
 stores:[{id:'val-fleuri',name:'Val Fleuri',code:'VF',settings:{storeId:'val-fleuri',storeWarehouseId:'FRP0001',supplyWarehouseId:'CENTRAL-01',secondarySupplyWarehouseIds:[],source:'STOREOPS_CONFIG',persisted:true}}],
 directory:{status:'READY',source:'D365/WarehousesOnHandV2',items:[{id:'FRP0001',name:'Val Fleuri'},{id:'CENTRAL-01',name:'Entrepôt central'}],partial:false}
}}
async function load(){
 if(app.showcase){const s=sample();stores=s.stores;directory=s.directory;selectedStoreId=selectedStoreId||stores[0]?.id||null;return}
 const [s,w]=await Promise.all([api('/api/admin/stores/settings'),api('/api/admin/warehouses')]);stores=s.items||[];directory=w||{status:'UNAVAILABLE',items:[]};selectedStoreId=stores.some(x=>x.id===selectedStoreId)?selectedStoreId:(app.storeId&&stores.some(x=>x.id===app.storeId)?app.storeId:stores[0]?.id||null)
}
const selected=()=>stores.find(x=>x.id===selectedStoreId)||null;
const warehouseOptions=()=>{const map=new Map((directory.items||[]).map(x=>[String(x.id),x]));for(const s of stores){for(const id of [s.settings?.storeWarehouseId,s.settings?.supplyWarehouseId,...(s.settings?.secondarySupplyWarehouseIds||[])])if(id&&!map.has(String(id)))map.set(String(id),{id:String(id),name:String(id)})}return [...map.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id)))};
function sourceLabel(v){return({STOREOPS_CONFIG:'Configuré dans StoreOps',ENV_CONFIG:'Configuration environnement',PILOT_FALLBACK:'Fallback pilote',UNMAPPED:'Non configuré'})[v]||v||'—'}
function render(){
 let section=document.getElementById('storeSettingsSection');if(!section){section=document.createElement('section');section.id='storeSettingsSection';section.className='card store-studio';root.appendChild(section)}
 const s=selected(),opts=warehouseOptions();
 section.innerHTML=`<div class="row"><div><div class="label">MAGASINS & APPROVISIONNEMENT</div><h3>Quel stock doit piloter chaque magasin ?</h3><p class="small muted">Choisis le warehouse du magasin et l’entrepôt principal qui le réapprovisionne. Le Scanner et les recommandations utilisent ensuite cette configuration.</p></div><div>${status(directory.status==='READY'?'Warehouses connectés':directory.status==='DEGRADED'?'Liste partielle':'Configuration manuelle',directory.status==='READY'?'ok':directory.status==='DEGRADED'?'warn':'neutral')}</div></div>
 ${!s?'<div class="empty">Aucun magasin actif.</div>':`<div class="store-settings-grid"><aside class="store-settings-list">${stores.map(x=>`<button data-store-settings="${esc(x.id)}" class="studio-template-card ${x.id===selectedStoreId?'selected':''}"><div class="row"><strong>${esc(x.name)}</strong>${x.settings?.supplyWarehouseId?status('Prêt','ok'):status('À configurer','warn')}</div><div class="small muted">Magasin ${esc(x.settings?.storeWarehouseId||'—')} · Source ${esc(x.settings?.supplyWarehouseId||'—')}</div></button>`).join('')}</aside><div class="store-settings-editor"><div class="row"><div><strong>${esc(s.name)}</strong><div class="small muted">${esc(sourceLabel(s.settings?.source))}</div></div><span class="pill">${esc(s.code||s.id)}</span></div>
 <datalist id="warehouseDirectoryList">${opts.map(x=>`<option value="${esc(x.id)}">${esc(x.name||x.id)}</option>`).join('')}</datalist>
 <div class="grid g2 store-settings-fields"><label><span>Warehouse du magasin</span><input id="storeWarehouseId" list="warehouseDirectoryList" value="${esc(s.settings?.storeWarehouseId||'')}" placeholder="Choisir ou saisir un code"><small>Stock physique et disponible du magasin.</small></label><label><span>Entrepôt source principal</span><input id="supplyWarehouseId" list="warehouseDirectoryList" value="${esc(s.settings?.supplyWarehouseId||'')}" placeholder="Choisir ou saisir un code"><small>Source utilisée pour la recommandation de réappro.</small></label></div>
 <details class="manager-item-details store-secondary"><summary>Sources secondaires optionnelles <span>⌄</span></summary><div class="store-secondary-body"><label><span>Warehouses secondaires</span><input id="secondarySupplyWarehouseIds" value="${esc((s.settings?.secondarySupplyWarehouseIds||[]).join(', '))}" placeholder="Ex. WH02, WH03"><small>Sépare les codes par des virgules. Ils ne sont pas utilisés comme source principale tant qu’aucune règle dédiée ne le demande.</small></label></div></details>
 <div class="studio-savebar"><span class="small muted">${directory.status==='READY'?`${opts.length} warehouse(s) détecté(s) depuis ${esc(directory.source||'le connecteur')}.`:'La saisie manuelle reste possible tant que le connecteur ne fournit pas de répertoire de warehouses.'}</span><button class="btn brand" id="saveStoreSettings">Enregistrer pour ${esc(s.name)}</button></div></div></div>`}`;
 bind(section)
}
function bind(section){
 section.querySelectorAll('[data-store-settings]').forEach(b=>b.onclick=()=>{selectedStoreId=b.dataset.storeSettings;render()});
 document.getElementById('saveStoreSettings')?.addEventListener('click',async()=>{
  if(app.showcase)return toast('Aperçu Showcase : écriture désactivée.');
  const storeWarehouseId=document.getElementById('storeWarehouseId')?.value?.trim()||null,supplyWarehouseId=document.getElementById('supplyWarehouseId')?.value?.trim()||null,secondarySupplyWarehouseIds=String(document.getElementById('secondarySupplyWarehouseIds')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
  try{const saved=await api(`/api/stores/${encodeURIComponent(selectedStoreId)}/settings`,{method:'PUT',body:{storeWarehouseId,supplyWarehouseId,secondarySupplyWarehouseIds}});const row=stores.find(x=>x.id===selectedStoreId);if(row)row.settings=saved;render();toast('Configuration stock du magasin enregistrée.')}catch(e){toast(e.message)}
 })
}
async function mount(){if(mounting||!isDirector()||!root?.querySelector('.studio-hero')||document.getElementById('storeSettingsSection'))return;mounting=true;try{await load();render()}catch(e){const section=document.createElement('section');section.id='storeSettingsSection';section.className='banner ban-danger';section.innerHTML=`<strong>Configuration magasins indisponible</strong><span>${esc(e.message)}</span>`;root.appendChild(section)}finally{mounting=false}}
if(root){new MutationObserver(()=>queueMicrotask(mount)).observe(root,{childList:true,subtree:false});queueMicrotask(mount)}

import {api} from './api.js';
import {app,isDirector} from './state.js';
import {esc,status,toast} from './ui.js';

const ID='goLiveValidationCenter';
let snapshot=null,busy=false,lastLog='';
const safe=p=>Promise.resolve(p).catch(error=>({error:error?.message||String(error)}));
const storeId=()=>app.storeId||'val-fleuri';
const tone=s=>s==='PASSED'||s==='READY'||s==='LIVE'?'ok':s==='FAILED'||s==='ERROR'?'danger':s==='VALIDATED'?'info':'warn';
const label=s=>({PASSED:'Validé',FAILED:'Échec',READY:'Prêt',LIVE:'LIVE',VALIDATED:'Validé',DRAFT:'À tester',DISABLED:'Désactivé',UNKNOWN:'Inconnu'})[s]||s||'À vérifier';
const saved=(k,v)=>{try{if(v!==undefined)localStorage.setItem(k,v);return localStorage.getItem(k)||''}catch{return v||''}};
const key=n=>`storeops.validation.${storeId()}.${n}`;
function host(){return document.getElementById('integrationsStudioSection')}
function canManage(){return !!(snapshot?.sales?.canManage||snapshot?.price?.canManage)}
function stateBox(title,state,detail,extra=''){return `<div class="glv-check"><div class="row"><strong>${esc(title)}</strong>${status(label(state),tone(state))}</div><small>${esc(detail||'')}</small>${extra}</div>`}
function stockState(x){
 if(!x||x.error)return{state:'ERROR',detail:x?.error||'Non testé'};
 const a=x.storeStock||{},s=x.supplyStock||{};
 const ok=!a.mappingRequired&&!a.unavailable&&a.availableStock!==null&&a.availableStock!==undefined&&!s.mappingRequired&&s.source!=='ERROR'&&s.availableStock!==null&&s.availableStock!==undefined;
 return{state:ok?'PASSED':'FAILED',detail:`Magasin ${a.warehouseId||'—'}: ${a.availableStock??'—'} · Source ${s.warehouseId||'—'}: ${s.availableStock??'—'}`}
}
function assortmentState(x){
 if(!x||x.error)return{state:'ERROR',detail:x?.error||'Non testé'};
 if(x.status==='DISABLED')return{state:'DISABLED',detail:'Lecture canal → assortiment non LIVE'};
 if(x.safeToPersist)return{state:'PASSED',detail:`${x.resolved?.length||0} assortiment(s) reconnus · canal ${x.retailChannelId||'—'}`};
 return{state:'FAILED',detail:`${x.resolved?.length||0} reconnu(s) · ${x.unresolved?.length||0} non rapproché(s)`}
}
function mappingState(x){
 if(x?.error)return{state:'ERROR',detail:x.error};
 const m=x?.mapping||null,s=m?.smoke||null;
 return{state:s?.status||m?.state||'UNKNOWN',detail:m?`${m.entity||'Entité'} · ${s?.checkedAt?'smoke '+new Date(s.checkedAt).toLocaleString('fr-FR'):'aucun smoke récent'}`:'Aucun mapping enregistré'}
}
async function load(){
 const sid=storeId();
 const [sales,price,settings,merch]=await Promise.all([
  safe(api('/api/admin/integrations/d365-sales-mapping')),
  safe(api('/api/admin/integrations/d365-price-history-mapping')),
  safe(api(`/api/stores/${encodeURIComponent(sid)}/settings`)),
  safe(api(`/api/merchandising/readiness?storeId=${encodeURIComponent(sid)}`))
 ]);
 snapshot={sales,price,settings,merch,stock:null,assortment:null};
}
function render(){
 const h=host();if(!h)return;
 let section=document.getElementById(ID);if(!section){section=document.createElement('div');section.id=ID;section.className='glv-center';h.prepend(section)}
 const sales=mappingState(snapshot?.sales),price=mappingState(snapshot?.price),stock=stockState(snapshot?.stock),assort=assortmentState(snapshot?.assortment),ean=saved(key('ean')),sku=saved(key('sku'));
 const effectiveStock=snapshot?.stock?stock:{state:'UNKNOWN',detail:`Magasin ${snapshot?.settings?.storeWarehouseId||'—'} · Source ${snapshot?.settings?.supplyWarehouseId||'—'}`};
 const effectiveAssort=snapshot?.assortment?assort:{state:snapshot?.merch?.storeChannelAssortments?.live?'UNKNOWN':'DISABLED',detail:snapshot?.merch?.storeChannelAssortments?.retailChannelId?`Canal ${snapshot.merch.storeChannelAssortments.retailChannelId}`:'Canal non configuré'};
 const checks=[sales.state,price.state,effectiveStock.state,effectiveAssort.state],passed=checks.filter(x=>x==='PASSED'||x==='LIVE'||x==='VALIDATED').length,failed=checks.filter(x=>x==='FAILED'||x==='ERROR').length;
 section.innerHTML=`<div class="row"><div><div class="label">VALIDATION DE MISE EN PRODUCTION</div><h4>Validation Center D365</h4><p class="small muted">Une seule vue pour prouver les flux réels avant activation. Aucun bouton ici n’active LIVE ni ne modifie l’assortiment magasin.</p></div>${status(`${passed}/4 validés`,failed?'warn':passed===4?'ok':'info')}</div>
 <div class="glv-grid">
  ${stateBox('Ventes & tickets',sales.state,sales.detail)}
  ${stateBox('Historique prix',price.state,price.detail)}
  ${stateBox('Stock magasin / source',effectiveStock.state,effectiveStock.detail)}
  ${stateBox('Assortiment canal',effectiveAssort.state,effectiveAssort.detail)}
 </div>
 <div class="glv-samples">
  <label><span>EAN témoin stock</span><input id="glvEan" value="${esc(ean)}" placeholder="Ex. 5449000206770"></label>
  <label><span>SKU témoin historique prix</span><input id="glvSku" value="${esc(sku)}" placeholder="Ex. HS-003584"></label>
 </div>
 <div class="glv-actions">
  <button class="btn brand" id="glvRunAll" ${busy?'disabled':''}>${busy?'Validation en cours…':'Tout vérifier'}</button>
  <button class="btn ghost" id="glvRefresh">Actualiser l’état</button>
 </div>
 <div id="glvLog">${lastLog}</div>`;
 bind()
}
function log(html){const el=document.getElementById('glvLog');if(el)el.innerHTML=html}
async function runAll(){
 if(busy)return;
 const sid=storeId(),ean=document.getElementById('glvEan')?.value.trim()||saved(key('ean')),sku=document.getElementById('glvSku')?.value.trim()||saved(key('sku'));
 saved(key('ean'),ean);saved(key('sku'),sku);busy=true;lastLog='';render();
 const results=[];
 const run=async(name,fn,apply)=>{
  try{
   const value=await fn();apply?.(value);
   if(value?.error)results.push({name,ok:false,error:value.error});
   else results.push({name,ok:true});
  }catch(e){results.push({name,ok:false,error:e?.message||String(e)})}
 };
 if(canManage()&&snapshot?.sales?.mapping){
  await run('Ventes',()=>api('/api/admin/integrations/d365-sales-mapping/smoke',{method:'POST',body:{storeId:sid}}),value=>{snapshot.sales={mapping:value,canManage:true}})
 }
 if(canManage()&&snapshot?.price?.mapping&&sku){
  await run('Historique prix',()=>api('/api/admin/integrations/d365-price-history-mapping/smoke',{method:'POST',body:{productNumber:sku}}),value=>{snapshot.price={mapping:value,canManage:true}})
 }
 await run('Assortiment',()=>safe(api(`/api/admin/stores/${encodeURIComponent(sid)}/assortments/dynamics-preview`)),value=>{snapshot.assortment=value});
 if(ean)await run('Stock',()=>safe(api(`/api/stores/${encodeURIComponent(sid)}/item-assistant/${encodeURIComponent(ean)}`)),value=>{snapshot.stock=value});
 const failed=results.filter(x=>!x.ok),done=results.map(x=>x.name).join(' · ')||'Aucun test exécuté';
 lastLog=failed.length
  ?`<div class="banner ban-warn"><strong>Validation terminée avec ${failed.length} point(s) à corriger</strong><span>${esc(done)}.</span><div class="small" style="margin-top:6px">${failed.map(x=>`${esc(x.name)} : ${esc(x.error)}`).join('<br>')}</div></div>`
  :`<div class="banner ban-ok"><strong>Validation terminée</strong><span>${esc(done)}. Les activations restent manuelles dans les studios dédiés.</span></div>`;
 busy=false;render();
 if(failed.length)toast(`Validation terminée · ${failed.length} point(s) à corriger.`);
}
function bind(){
 document.getElementById('glvEan')?.addEventListener('change',e=>saved(key('ean'),e.target.value.trim()));
 document.getElementById('glvSku')?.addEventListener('change',e=>saved(key('sku'),e.target.value.trim()));
 document.getElementById('glvRunAll')?.addEventListener('click',runAll);
 document.getElementById('glvRefresh')?.addEventListener('click',async()=>{await load();render();toast('État de validation actualisé.')})
}
async function mount(){
 if(!isDirector()||!host()||document.getElementById(ID))return;
 try{await load();render()}catch(e){console.warn('Validation Center D365',e)}
}
const style=document.createElement('style');style.textContent=`.glv-center{margin:0 0 16px;padding:18px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(135deg,#fff,#f9fbff)}.glv-center h4{font-size:20px;margin:4px 0}.glv-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.glv-check{padding:11px;border:1px solid var(--line);border-radius:14px;background:#fff}.glv-check small{display:block;color:var(--muted);font-size:10px;margin-top:6px;line-height:1.4}.glv-samples{display:grid;grid-template-columns:1fr 1fr;gap:8px}.glv-samples label{display:grid;gap:4px;font-size:9px;color:var(--muted)}.glv-samples input{border:1px solid var(--line);border-radius:10px;padding:9px;font:inherit}.glv-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}#glvLog{margin-top:10px}@media(max-width:900px){.glv-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.glv-grid,.glv-samples{grid-template-columns:1fr}.glv-actions .btn{width:100%}}`;
document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(mount)).observe(document.body,{childList:true,subtree:true});
queueMicrotask(mount);

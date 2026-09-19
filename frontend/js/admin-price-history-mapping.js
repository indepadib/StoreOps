import {api} from './api.js';
import {isDirector} from './state.js';
import {esc,status,toast} from './ui.js';

const ID='priceHistoryMappingStudio';
let current=null,diagnostic=null,busy=false;

function tone(v){return v==='LIVE'?'ok':v==='VALIDATED'?'info':v==='DRAFT'?'warn':'neutral'}
function label(v){return({LIVE:'LIVE',VALIDATED:'Validé',DRAFT:'Brouillon',DISABLED:'Désactivé'})[v]||'Non configuré'}
function host(){return document.getElementById('integrationsStudioSection')}
function v(id){return document.getElementById(id)?.value?.trim()||''}
function bestPriceProbe(){
 const rows=diagnostic?.domains?.price||[];
 return rows.find(x=>x.ok&&x.entity==='SalesPriceAgreements')||rows.find(x=>x.ok)||null
}
function seed(){
 const saved=current?.mapping||{},probe=bestPriceProbe(),f=probe?.inference?.fields||{};
 return{
  entity:saved.entity||probe?.entity||'SalesPriceAgreements',
  fields:{
   item:saved.fields?.item||f.product?.candidate||'ItemNumber',
   price:saved.fields?.price||f.price?.candidate||'Price',
   validFrom:saved.fields?.validFrom||f.validFrom?.candidate||'PriceApplicableFromDate',
   validTo:saved.fields?.validTo||f.validTo?.candidate||'PriceApplicableToDate',
   currency:saved.fields?.currency||f.currency?.candidate||'PriceCurrencyCode',
   priceGroup:saved.fields?.priceGroup||f.priceGroup?.candidate||'PriceCustomerGroupCode',
   customer:saved.fields?.customer||'CustomerAccountNumber',
   warehouse:saved.fields?.warehouse||'PriceWarehouseId',
   site:saved.fields?.site||'PriceSiteId',
   quantity:saved.fields?.quantity||'SalesPriceQuantity',
   unit:saved.fields?.unit||'QuantityUnitySymbol',
   recordId:saved.fields?.recordId||'RecordId'
  }
 }
}
function form(){
 const s=seed(),f=s.fields,input=(id,label,value,req=false)=>`<label><span>${esc(label)}${req?' *':''}</span><input id="${id}" value="${esc(value||'')}"></label>`;
 return `<div class="price-history-map-form">
  <div class="row"><div><strong>Source historique tarifaire</strong><div class="small muted">StoreOps peut détecter automatiquement les Trade Agreements. Un SKU témoin peut être saisi manuellement en secours.</div></div>${status(label(current?.mapping?.state),tone(current?.mapping?.state))}</div>
  <div class="price-history-map-grid">
   ${input('phEntity','Entité',s.entity,true)}
   ${input('phItem','Article / SKU',f.item,true)}
   ${input('phPrice','Prix',f.price,true)}
   ${input('phFrom','Date début',f.validFrom,true)}
   ${input('phTo','Date fin',f.validTo)}
   ${input('phCurrency','Devise',f.currency)}
   ${input('phGroup','Price group',f.priceGroup)}
   ${input('phCustomer','Compte client',f.customer)}
   ${input('phWarehouse','Warehouse',f.warehouse)}
   ${input('phSite','Site',f.site)}
   ${input('phQuantity','Quantité prix',f.quantity)}
   ${input('phUnit','Unité',f.unit)}
   ${input('phRecord','Record ID',f.recordId)}
   <label><span>Article témoin pour le smoke *</span><input id="phSampleSku" placeholder="Ex. HS-003584"></label>
  </div>
  <div class="price-history-map-actions">
   ${current?.canManage&&current?.mapping?.state!=='LIVE'?'<button class="btn brand" id="phAutoConnect">Connecter automatiquement les Trade Agreements</button>':''}
   <button class="btn ghost" id="phDiagnose">Préremplir depuis diagnostic</button>
   ${current?.canManage?'<button class="btn ghost" id="phSave">Enregistrer brouillon</button><button class="btn soft" id="phSmoke">Tester l’historique</button>':''}
   ${current?.canManage&&current?.mapping?.state==='VALIDATED'?'<button class="btn brand" id="phActivate">Activer historique LIVE</button>':''}
   ${current?.canManage&&current?.mapping?.state==='LIVE'?'<button class="btn ghost" id="phDisable">Désactiver</button>':''}
  </div>
  <div id="phResult">${smokeHtml(current?.mapping?.smoke)}</div>
 </div>`
}
function smokeHtml(s){
 if(!s)return'';
 return `<div class="banner ${s.status==='PASSED'?'ban-ok':'ban-danger'}"><strong>Smoke ${esc(s.status||'—')}</strong><span>${Number(s.matchingRows||0)} ligne(s) article · ${Number(s.distinctPrices||0)} prix distinct(s) · ${Number(s.distinctDates||0)} date(s) distincte(s). Aucun ancien prix n’est inventé.</span></div>`
}
function payload(){
 return{entity:v('phEntity'),fields:{item:v('phItem'),price:v('phPrice'),validFrom:v('phFrom'),validTo:v('phTo'),currency:v('phCurrency'),priceGroup:v('phGroup'),customer:v('phCustomer'),warehouse:v('phWarehouse'),site:v('phSite'),quantity:v('phQuantity'),unit:v('phUnit'),recordId:v('phRecord')}}
}
async function refresh(message=''){
 current=await api('/api/admin/integrations/d365-price-history-mapping');
 render();if(message)toast(message)
}
async function diagnose(){
 if(busy)return;busy=true;
 try{diagnostic=await api('/api/admin/integrations/d365-mapping/diagnose',{method:'POST',body:{storeId:'val-fleuri'}});render();toast(bestPriceProbe()?'Source prix candidate détectée.':'Aucune source prix exploitable détectée.')}
 catch(e){toast(e.message)}
 finally{busy=false}
}
async function save(){try{await api('/api/admin/integrations/d365-price-history-mapping/draft',{method:'POST',body:payload()});await refresh('Brouillon historique prix enregistré.')}catch(e){toast(e.message)}}
async function smoke(){
 const sku=v('phSampleSku'),box=document.getElementById('phResult');if(!sku)return toast('Saisissez un article témoin.');
 if(box)box.innerHTML='<div class="small muted">Lecture D365 de l’article témoin…</div>';
 try{const mapping=await api('/api/admin/integrations/d365-price-history-mapping/smoke',{method:'POST',body:{productNumber:sku,mapping:payload()}});current={...(current||{}),mapping};render();toast(mapping.smoke?.status==='PASSED'?'Historique prix validé.':'Source historique à corriger.')}
 catch(e){if(box)box.innerHTML=`<div class="banner ban-danger"><strong>Smoke impossible</strong><span>${esc(e.message)}</span></div>`;toast(e.message)}
}
async function autoConnect(){
 const box=document.getElementById('phResult'),sku=v('phSampleSku');if(box)box.innerHTML='<div class="small muted">Détection des Trade Agreements + smoke D365 en cours…</div>';
 try{const result=await api('/api/admin/integrations/d365-price-history-mapping/auto-connect',{method:'POST',body:{productNumber:sku||null}});current={...(current||{}),mapping:result?.mapping||null};render();const target=document.getElementById('phResult');if(target)target.innerHTML=`<div class="banner ${result?.activated?'ban-ok':'ban-danger'}"><strong>${result?.activated?'Trade Agreements connectés LIVE':'Connexion automatique incomplète'}</strong><span>${result?.activated?`Source ${esc(result?.mapping?.entity||'D365')} validée avec l’article ${esc(result?.sampleProductNumber||'témoin')}. Les tarifs datés peuvent maintenant alimenter l’historique prix.`:esc(result?.mapping?.smoke?.note||'Le smoke n’a pas validé la source détectée.')}</span></div>`;toast(result?.activated?'Trade Agreements D365 connectés.':'Trade Agreements à valider.')}
 catch(e){if(box)box.innerHTML=`<div class="banner ban-danger"><strong>Connexion automatique impossible</strong><span>${esc(e.message)}</span></div>`;toast(e.message)}
}
async function activate(){try{await api('/api/admin/integrations/d365-price-history-mapping/activate',{method:'POST',body:{}});await refresh('Historique tarifaire D365 activé.')}catch(e){toast(e.message)}}
async function disable(){try{await api('/api/admin/integrations/d365-price-history-mapping/disable',{method:'POST',body:{}});await refresh('Historique tarifaire désactivé.')}catch(e){toast(e.message)}}
function bind(){
 document.getElementById('phAutoConnect')?.addEventListener('click',autoConnect);
 document.getElementById('phDiagnose')?.addEventListener('click',diagnose);
 document.getElementById('phSave')?.addEventListener('click',save);
 document.getElementById('phSmoke')?.addEventListener('click',smoke);
 document.getElementById('phActivate')?.addEventListener('click',activate);
 document.getElementById('phDisable')?.addEventListener('click',disable)
}
function render(){
 const h=host();if(!h)return;let root=document.getElementById(ID);if(!root){root=document.createElement('div');root.id=ID;root.className='integration-price-history-mapping';h.appendChild(root)}
 root.innerHTML=`<div class="row"><div><div class="label">HISTORIQUE DE PRIX D365</div><h4>Valider les anciens tarifs avant de les montrer au magasin</h4><p class="small muted">Le Scanner garde toujours les prix réellement constatés en caisse séparés des tarifs paramétrés.</p></div>${status(label(current?.mapping?.state),tone(current?.mapping?.state))}</div>${form()}`;bind()
}
async function mount(){
 if(!isDirector())return;const h=host();if(!h||document.getElementById(ID))return;
 try{current=await api('/api/admin/integrations/d365-price-history-mapping');render()}catch(e){console.warn('Price history mapping studio',e)}
}

const style=document.createElement('style');style.textContent=`.integration-price-history-mapping{margin-top:14px;padding:18px;border:1px solid var(--line);border-radius:20px;background:#fff}.integration-price-history-mapping h4{font-size:20px;margin:4px 0}.price-history-map-form{margin-top:12px}.price-history-map-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.price-history-map-grid label{display:grid;gap:4px;font-size:9px;color:var(--muted)}.price-history-map-grid input{min-width:0;border:1px solid var(--line);border-radius:10px;padding:9px;background:#fff;font:inherit;font-size:11px}.price-history-map-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}#phResult{margin-top:10px}@media(max-width:950px){.price-history-map-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.price-history-map-grid{grid-template-columns:1fr}.price-history-map-actions .btn{width:100%}}`;
document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(mount)).observe(document.body,{childList:true,subtree:true});queueMicrotask(mount);

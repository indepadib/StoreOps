import { api } from './api.js';
import { isDirector } from './state.js';
import { esc,toast } from './ui.js';

const ID='storeopsAutoAssortment';
let busy=false;

function selectedStoreId(){
  return document.querySelector('#storeSettingsSection [data-store-settings].selected')?.dataset?.storeSettings||null;
}
function assortmentBlock(){
  return [...document.querySelectorAll('#storeSettingsSection .store-assortment-block')].find(x=>/Assortiments du magasin/i.test(x.textContent||''))||null;
}
function resultHost(block){
  let el=block.querySelector(`#${ID}Result`);
  if(!el){el=document.createElement('div');el.id=`${ID}Result`;el.style.marginTop='10px';block.appendChild(el)}
  return el;
}
function renderPreview(block,p){
  const host=resultHost(block),resolved=p.resolved||[],unresolved=p.unresolved||[];
  if(p.status==='DISABLED'){
    host.innerHTML=`<div class="banner ban-info"><strong>Détection automatique prête, mais non activée</strong><span>StoreOps est configuré pour tester <code>${esc(p.readiness?.entity||'RetailAssortmentLookupChannelGroupEntity')}</code> avec le canal ${esc(p.readiness?.retailChannelId||'—')}. Active la lecture assortiment uniquement après smoke D365.</span></div>`;return;
  }
  if(p.status==='EMPTY'){
    host.innerHTML='<div class="banner ban-warn"><strong>Aucun assortiment remonté par le canal</strong><span>Le mapping manuel actuel est conservé.</span></div>';return;
  }
  if(!p.safeToPersist){
    host.innerHTML=`<div class="banner ban-warn"><strong>Rapprochement incomplet — rien n’a été modifié</strong><span>${resolved.length} assortiment(s) reconnu(s) · ${unresolved.length} ID non rapproché(s)${unresolved.length?` : ${unresolved.slice(0,8).map(esc).join(', ')}`:''}.</span></div>`;return;
  }
  host.innerHTML=`<div class="banner ban-ok"><strong>${resolved.length} assortiment(s) détecté(s) pour le canal ${esc(p.retailChannelId||'')}</strong><span>${resolved.map(x=>esc(x.assortmentName||x.assortmentKey)).join(' · ')}</span><button class="btn brand" id="${ID}Apply" style="margin-top:9px">Appliquer ce mapping</button></div>`;
  host.querySelector(`#${ID}Apply`)?.addEventListener('click',()=>apply(block));
}
async function preview(block){
  if(busy)return;const storeId=selectedStoreId();if(!storeId)return toast('Sélectionne un magasin.');
  busy=true;const btn=block.querySelector(`#${ID}Button`);if(btn){btn.disabled=true;btn.textContent='Détection…'}
  try{renderPreview(block,await api(`/api/admin/stores/${encodeURIComponent(storeId)}/assortments/dynamics-preview`))}
  catch(e){resultHost(block).innerHTML=`<div class="banner ban-danger"><strong>Détection D365 impossible</strong><span>${esc(e.message)}</span></div>`}
  finally{busy=false;if(btn){btn.disabled=false;btn.textContent='Détecter depuis D365'}}
}
async function apply(block){
  if(busy)return;const storeId=selectedStoreId();if(!storeId)return;
  busy=true;const btn=block.querySelector(`#${ID}Apply`);if(btn){btn.disabled=true;btn.textContent='Application…'}
  try{
    const r=await api(`/api/admin/stores/${encodeURIComponent(storeId)}/assortments/sync-channel`,{method:'POST'});
    toast(`${r.rowCount||0} assortiment(s) magasin synchronisé(s).`);
    const selected=document.querySelector(`#storeSettingsSection [data-store-settings="${CSS.escape(storeId)}"]`);selected?.click();
  }catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent='Appliquer ce mapping'}}finally{busy=false}
}
function mount(){
  if(!isDirector())return;const block=assortmentBlock();if(!block||block.querySelector(`#${ID}Button`))return;
  const row=block.querySelector('.row');if(!row)return;
  const actions=row.querySelector('button')?.parentElement===row?row:null;
  const btn=document.createElement('button');btn.id=`${ID}Button`;btn.className='btn soft';btn.textContent='Détecter depuis D365';btn.type='button';btn.addEventListener('click',()=>preview(block));
  if(actions)actions.appendChild(btn);else row.appendChild(btn);
}

new MutationObserver(()=>queueMicrotask(mount)).observe(document.body,{childList:true,subtree:true});
queueMicrotask(mount);

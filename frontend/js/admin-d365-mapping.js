import {api} from './api.js';
import {isDirector,app} from './state.js';
import {esc,status,toast} from './ui.js';

const ID='d365MappingStudio';
let busy=false,last=null,readiness=null;

function tone(c){return c==='HIGH'?'ok':c==='MEDIUM'?'info':c==='LOW'?'warn':'neutral'}
function conf(c){return({HIGH:'Fort',MEDIUM:'Moyen',LOW:'Faible',NONE:'Non trouvé'})[c]||c}
function fieldCard(label,x){return `<div class="integration-map-field"><span>${esc(label)}</span><strong>${esc(x?.candidate||'Non identifié')}</strong>${status(conf(x?.confidence||'NONE'),tone(x?.confidence||'NONE'))}</div>`}
function selectedStore(){return app.storeId||'val-fleuri'}
function findHost(){return document.getElementById('integrationsStudioSection')}
function stateTone(v){return v==='LIVE'?'ok':v==='VALIDATED'?'info':v==='DRAFT'?'warn':v==='DISABLED'?'neutral':'neutral'}
function stateLabel(v){return({LIVE:'LIVE',VALIDATED:'Validé',DRAFT:'Brouillon',DISABLED:'Désactivé'})[v]||'Non configuré'}

async function loadReadiness(){try{return await api(`/api/admin/integrations/d365-mapping/readiness?storeId=${encodeURIComponent(selectedStore())}`)}catch{return null}}
function mappingSeed(d=last){
 const saved=readiness?.savedSalesMapping||null,rec=d?.recommendation||null;
 return{
  entity:rec?.salesEntity||saved?.entity||readiness?.sales?.entity||'RetailTransactionSalesTransBIEntities',
  fields:{
   channel:rec?.fields?.channel||saved?.fields?.channel||readiness?.sales?.configuredFields?.store||'',
   businessDate:rec?.fields?.businessDate||saved?.fields?.businessDate||readiness?.sales?.configuredFields?.date||'',
   transaction:rec?.fields?.transaction||saved?.fields?.transaction||readiness?.sales?.configuredFields?.transaction||'',
   product:rec?.fields?.product||saved?.fields?.product||readiness?.sales?.configuredFields?.product||'',
   net:rec?.fields?.net||saved?.fields?.net||readiness?.sales?.configuredFields?.net||'',
   quantity:rec?.fields?.quantity||saved?.fields?.quantity||readiness?.sales?.configuredFields?.quantity||'',
   cost:rec?.fields?.cost||saved?.fields?.cost||readiness?.sales?.configuredFields?.cost||'',
   time:rec?.fields?.time||saved?.fields?.time||readiness?.sales?.configuredFields?.time||'',
   productName:rec?.fields?.productName||saved?.fields?.productName||readiness?.sales?.configuredFields?.name||'',
   department:rec?.fields?.department||saved?.fields?.department||readiness?.sales?.configuredFields?.department||'',
   category:rec?.fields?.category||saved?.fields?.category||readiness?.sales?.configuredFields?.category||''
  },
  dateFilterMode:saved?.dateFilterMode||rec?.dateFilterMode||'datetime',
  salesSign:saved?.salesSign??rec?.salesSign??-1,
  quantitySign:saved?.quantitySign??rec?.quantitySign??1,
  costSign:saved?.costSign??rec?.costSign??-1
 }
}
function mappingForm(seed){
 const f=seed.fields||{};
 const input=(id,label,value,required=false)=>`<label><span>${esc(label)}${required?' *':''}</span><input id="${id}" value="${esc(value||'')}"></label>`;
 return `<div class="integration-sales-editor">
  <div class="row"><div><strong>Mapping ventes StoreOps</strong><div class="small muted">Les champs obligatoires servent au CA et aux tickets. Le coût reste facultatif.</div></div>${status(stateLabel(readiness?.savedSalesMapping?.state),stateTone(readiness?.savedSalesMapping?.state))}</div>
  <div class="integration-sales-fields">
   ${input('salesMapEntity','Entité',seed.entity,true)}
   ${input('salesMapChannel','Canal / magasin',f.channel,true)}
   ${input('salesMapDate','Business date',f.businessDate,true)}
   ${input('salesMapTransaction','Transaction / ticket',f.transaction,true)}
   ${input('salesMapProduct','Article',f.product)}
   ${input('salesMapNet','CA TTC / montant',f.net,true)}
   ${input('salesMapQuantity','Quantité',f.quantity)}
   ${input('salesMapCost','Coût',f.cost)}
   ${input('salesMapTime','Heure',f.time)}
   ${input('salesMapName','Libellé article',f.productName)}
   ${input('salesMapDepartment','Rayon',f.department)}
   ${input('salesMapCategory','Catégorie / famille',f.category)}
   <label><span>Filtre date</span><select id="salesMapDateMode"><option value="datetime" ${seed.dateFilterMode==='datetime'?'selected':''}>Date + heure</option><option value="date" ${seed.dateFilterMode==='date'?'selected':''}>Date simple</option></select></label>
   <label><span>Signe CA</span><select id="salesMapSalesSign"><option value="-1" ${Number(seed.salesSign)===-1?'selected':''}>-1</option><option value="1" ${Number(seed.salesSign)===1?'selected':''}>+1</option></select></label>
   <label><span>Signe quantité</span><select id="salesMapQtySign"><option value="1" ${Number(seed.quantitySign)===1?'selected':''}>+1</option><option value="-1" ${Number(seed.quantitySign)===-1?'selected':''}>-1</option></select></label>
   <label><span>Signe coût</span><select id="salesMapCostSign"><option value="-1" ${Number(seed.costSign)===-1?'selected':''}>-1</option><option value="1" ${Number(seed.costSign)===1?'selected':''}>+1</option></select></label>
  </div>
  <div class="integration-sales-actions">
   ${readiness?.canManage?'<button class="btn brand" id="salesMapAuto">Détecter & activer les ventes</button><button class="btn ghost" id="salesMapSave">Enregistrer brouillon</button><button class="btn soft" id="salesMapSmoke">Tester sur Val Fleuri</button>':''}
   ${readiness?.canManage&&readiness?.savedSalesMapping?.state==='VALIDATED'?'<button class="btn brand" id="salesMapActivate">Activer ventes LIVE</button>':''}
   ${readiness?.canManage&&readiness?.savedSalesMapping?.state==='LIVE'?'<button class="btn ghost" id="salesMapDisable">Désactiver</button>':''}
  </div>
  <div id="salesMapSmokeResult"></div>
 </div>`
}
function renderReadiness(r){
 readiness=r;
 const host=findHost();if(!host||host.querySelector(`#${ID}`))return;
 const section=document.createElement('div');section.id=ID;section.className='integration-d365-mapping';
 section.innerHTML=`<div class="row"><div><div class="label">DONNÉES D365 À FINALISER</div><h4>Ventes, coût & historique prix</h4><p class="small muted">StoreOps peut maintenant conserver un mapping ventes validé sans modifier Netlify. Aucun write ERP n’est activé.</p></div>${status(r?.mode==='live'?'D365 connecté':'Probe désactivé',r?.mode==='live'?'ok':'neutral')}</div><div class="integration-d365-summary"><div><span>Magasin</span><strong>${esc(r?.storeId||'—')}</strong></div><div><span>Retail Channel</span><strong>${esc(r?.retailChannelId||'—')}</strong></div><div><span>Mapping ventes</span><strong>${esc(stateLabel(r?.savedSalesMapping?.state))}</strong></div><div><span>Marge</span><strong>${r?.savedSalesMapping?.fields?.cost?'Coût mappé':'Coût non identifié'}</strong></div></div><button class="btn brand" id="${ID}Run">Analyser les entités D365</button><div id="${ID}Result" style="margin-top:12px">${r?.savedSalesMapping?mappingForm(mappingSeed(null)):''}</div>`;
 host.appendChild(section);bindLifecycle();section.querySelector(`#${ID}Run`)?.addEventListener('click',run)
}
function renderResult(d){
 const root=document.getElementById(`${ID}Result`);if(!root)return;
 if(d.status==='DISABLED'){root.innerHTML=`<div class="banner ban-info"><strong>Diagnostic externe désactivé</strong><span>${esc(d.message||'D365_MODE non LIVE.')}</span></div>${mappingForm(mappingSeed(d))}`;bindLifecycle();return}
 const best=d.domains?.sales?.find(x=>x.entity===d.recommendation?.salesEntity)||d.domains?.sales?.find(x=>x.ok)||null,fields=best?.inference?.fields||{};
 root.innerHTML=`<div class="banner ${d.recommendation?.marginReady?'ban-ok':'ban-warn'}"><strong>${d.recommendation?.salesEntity?`Entité ventes détectée : ${esc(d.recommendation.salesEntity)}`:'Aucune entité ventes exploitable détectée'}</strong><span>${d.recommendation?.marginReady?'Un champ coût candidat existe : il devra être validé par smoke avant affichage de la marge.':'Aucun coût fiable détecté : CA/tickets peuvent être validés indépendamment, la marge restera masquée.'}</span></div>${best?`<div class="integration-map-grid">${fieldCard('Canal / magasin',fields.channel)}${fieldCard('Business date',fields.businessDate)}${fieldCard('Ticket',fields.transaction)}${fieldCard('Article',fields.product)}${fieldCard('CA TTC / montant',fields.net)}${fieldCard('Quantité',fields.quantity)}${fieldCard('Coût',fields.cost)}${fieldCard('Heure',fields.time)}</div><details class="integration-mapping-raw"><summary>Voir les champs réellement retournés</summary><div class="small muted">${best.inference.keys.map(esc).join(' · ')||'Aucun champ'}</div></details>`:''}${mappingForm(mappingSeed(d))}<div class="integration-probe-list">${(d.domains?.price||[]).map(p=>`<div><strong>${esc(p.entity)}</strong>${status(p.ok?`${p.rowCount} ligne(s)`:'Indisponible',p.ok?'ok':'neutral')}<small>${p.error?esc(p.error):`Prix candidat : ${esc(p.inference?.fields?.price?.candidate||'non identifié')} · Début : ${esc(p.inference?.fields?.validFrom?.candidate||'—')} · Fin : ${esc(p.inference?.fields?.validTo?.candidate||'—')}`}</small></div>`).join('')}</div>`;
 bindLifecycle()
}
function formPayload(){
 const v=id=>document.getElementById(id)?.value?.trim()||'';
 return{
  entity:v('salesMapEntity'),
  fields:{channel:v('salesMapChannel'),businessDate:v('salesMapDate'),transaction:v('salesMapTransaction'),product:v('salesMapProduct'),net:v('salesMapNet'),quantity:v('salesMapQuantity'),cost:v('salesMapCost'),time:v('salesMapTime'),productName:v('salesMapName'),department:v('salesMapDepartment'),category:v('salesMapCategory')},
  dateFilterMode:v('salesMapDateMode')||'datetime',salesSign:Number(v('salesMapSalesSign')||-1),quantitySign:Number(v('salesMapQtySign')||1),costSign:Number(v('salesMapCostSign')||-1)
 }
}
async function refreshMappingUi(mapping,message=''){
 readiness={...(readiness||{}),savedSalesMapping:mapping};
 if(last)renderResult(last);else{const root=document.getElementById(`${ID}Result`);if(root){root.innerHTML=mappingForm(mappingSeed(null));bindLifecycle()}}
 if(message)toast(message)
}
async function saveDraft(){
 try{const mapping=await api('/api/admin/integrations/d365-sales-mapping/draft',{method:'POST',body:formPayload()});await refreshMappingUi(mapping,'Brouillon ventes enregistré.')}catch(e){toast(e.message)}
}
async function smoke(){
 const target=document.getElementById('salesMapSmokeResult');if(target)target.innerHTML='<div class="small muted">Smoke D365 en cours…</div>';
 try{
  const mapping=await api('/api/admin/integrations/d365-sales-mapping/smoke',{method:'POST',body:{storeId:selectedStore(),mapping:formPayload()}});
  readiness={...(readiness||{}),savedSalesMapping:mapping};const s=mapping.smoke||{};
  if(last)renderResult(last);else await refreshMappingUi(mapping);
  const box=document.getElementById('salesMapSmokeResult');if(box)box.innerHTML=`<div class="banner ${s.status==='PASSED'?'ban-ok':'ban-danger'}"><strong>Smoke ${esc(s.status||'—')}</strong><span>${Number(s.rowCount||0)} ligne(s) · ${Number(s.uniqueTickets||0)} ticket(s) · canal ${esc(s.retailChannelId||'—')} · coût ${s.marginCandidate?'candidat présent':'non validé'}.</span></div>`;
  toast(s.status==='PASSED'?'Mapping ventes validé.':'Le mapping ventes doit être corrigé.')
 }catch(e){if(target)target.innerHTML=`<div class="banner ban-danger"><strong>Smoke impossible</strong><span>${esc(e.message)}</span></div>`;toast(e.message)}
}
async function activate(){try{const mapping=await api('/api/admin/integrations/d365-sales-mapping/activate',{method:'POST',body:{}});await refreshMappingUi(mapping,'Ventes D365 activées.')}catch(e){toast(e.message)}}
async function autoconfigure(){
 const target=document.getElementById('salesMapSmokeResult');if(target)target.innerHTML='<div class="small muted">Détection D365 + smoke Val Fleuri en cours…</div>';
 try{
  const result=await api('/api/admin/integrations/d365-sales-mapping/autoconfigure',{method:'POST',body:{storeId:selectedStore()}});
  readiness={...(readiness||{}),savedSalesMapping:result.mapping};
  if(last)renderResult(last);else await refreshMappingUi(result.mapping);
  const s=result.smoke||{},box=document.getElementById('salesMapSmokeResult');
  if(box)box.innerHTML=`<div class="banner ban-ok"><strong>Ventes D365 LIVE</strong><span>${Number(s.rowCount||0)} ligne(s) testées · ${Number(s.uniqueTickets||0)} ticket(s) · Retail Channel ${esc(s.retailChannelId||'—')} validé.</span></div>`;
  toast('Ventes D365 détectées, testées et activées.')
 }catch(e){if(target)target.innerHTML=`<div class="banner ban-danger"><strong>Activation automatique refusée</strong><span>${esc(e.message)}</span></div>`;toast(e.message)}
}
async function disable(){try{const mapping=await api('/api/admin/integrations/d365-sales-mapping/disable',{method:'POST',body:{}});await refreshMappingUi(mapping,'Mapping ventes désactivé.')}catch(e){toast(e.message)}}
function bindLifecycle(){
 document.getElementById('salesMapAuto')?.addEventListener('click',autoconfigure);
 document.getElementById('salesMapSave')?.addEventListener('click',saveDraft);
 document.getElementById('salesMapSmoke')?.addEventListener('click',smoke);
 document.getElementById('salesMapActivate')?.addEventListener('click',activate);
 document.getElementById('salesMapDisable')?.addEventListener('click',disable)
}
async function run(){
 if(busy)return;busy=true;const b=document.getElementById(`${ID}Run`);if(b){b.disabled=true;b.textContent='Analyse…'}
 try{last=await api('/api/admin/integrations/d365-mapping/diagnose',{method:'POST',body:{storeId:selectedStore()}});renderResult(last)}catch(e){const r=document.getElementById(`${ID}Result`);if(r)r.innerHTML=`<div class="banner ban-danger"><strong>Diagnostic impossible</strong><span>${esc(e.message)}</span></div>`;toast(e.message)}finally{busy=false;if(b){b.disabled=false;b.textContent='Analyser les entités D365'}}
}
async function mount(){
 if(!isDirector())return;const host=findHost();if(!host||host.querySelector(`#${ID}`))return;
 const r=await loadReadiness();renderReadiness(r)
}

const style=document.createElement('style');style.textContent=`.integration-d365-mapping{margin-top:16px;padding:18px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(135deg,#fff,#fbf8f9)}.integration-d365-mapping h4{font-size:20px;margin:4px 0}.integration-d365-summary,.integration-map-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.integration-d365-summary>div,.integration-map-field{padding:10px;border-radius:13px;background:#f7f4f5}.integration-d365-summary span,.integration-map-field>span{display:block;font-size:9px;color:var(--muted)}.integration-d365-summary strong,.integration-map-field strong{display:block;font-size:11px;margin:3px 0}.integration-probe-list{display:grid;gap:7px;margin-top:10px}.integration-probe-list>div{padding:10px;border:1px solid var(--line);border-radius:12px}.integration-probe-list strong,.integration-probe-list small{display:block}.integration-probe-list small{font-size:10px;color:var(--muted);margin-top:4px}.integration-mapping-raw{margin-top:10px}.integration-sales-editor{margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:16px;background:#fff}.integration-sales-fields{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.integration-sales-fields label{display:grid;gap:4px;font-size:9px;color:var(--muted)}.integration-sales-fields input,.integration-sales-fields select{min-width:0;border:1px solid var(--line);border-radius:10px;padding:9px;background:#fff;font:inherit;font-size:11px}.integration-sales-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}@media(max-width:950px){.integration-d365-summary,.integration-map-grid,.integration-sales-fields{grid-template-columns:1fr 1fr}}@media(max-width:560px){.integration-sales-fields{grid-template-columns:1fr}.integration-sales-actions .btn{width:100%}}`;
document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(mount)).observe(document.body,{childList:true,subtree:true});queueMicrotask(mount);

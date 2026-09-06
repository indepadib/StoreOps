import { api } from './api.js';
import { app } from './state.js';
import { toast,esc } from './ui.js';

const TARGET_DAYS=5,PROMO_TARGET_DAYS=7,LOW_COVERAGE_DAYS=2.5,CACHE_MS=15000;
const BATCH_KEY='storeops_replenishment_batch_v1';
let cache={key:'',at:0,data:null},rendering=false,timer=null;
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const safe=(p,f)=>Promise.resolve(p).catch(()=>f);
const day=()=>new Date().toISOString().slice(0,10);

const SHOWCASE_SIGNALS=[
  {id:'vf-neg-lait',type:'NEGATIVE',product:'Lait frais entier 1L',productNumber:'LAIT1L',ean:'6111040001111',availableQty:-3,dailySales:9,centralStock:0,inboundQty:0,supplier:'Centrale Danone'},
  {id:'vf-oos-yaourt',type:'OUT',product:'Yaourt nature 4x110g',productNumber:'YAOURT4',ean:'3274080005003',availableQty:0,dailySales:5,centralStock:40,inboundQty:0,supplier:'Fournisseur PLS'},
  {id:'vf-low-nutella',type:'LOW',product:'Nutella 750g',productNumber:'NUT750',ean:'3017620422003',availableQty:17,dailySales:8,centralStock:0,inboundQty:0,supplier:'Ferrero'},
  {id:'vf-covered-water',type:'LOW',product:'Sidi Ali 1,5L',productNumber:'EAU15',ean:'6111000000011',availableQty:2,dailySales:6,centralStock:100,inboundQty:24,inboundEta:'demain',supplier:'Sidi Ali'}
];

function batch(){try{return JSON.parse(localStorage.getItem(BATCH_KEY)||'[]')}catch{return[]}}
function saveBatch(rows){localStorage.setItem(BATCH_KEY,JSON.stringify(rows))}
function csvCell(v){const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
function downloadCsv(filename,columns,rows){const text='\uFEFF'+[columns.join(';'),...rows.map(r=>columns.map(c=>csvCell(r[c])).join(';'))].join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500)}
function promoEans(commercial){return new Set((commercial?.items||[]).filter(x=>x.promo_label||['PROMO_START','PROMO_END'].includes(x.action_type)).map(x=>String(x.ean||'')).filter(Boolean))}
function coverage(available,dailySales){return dailySales>0?Math.max(0,available)/dailySales:null}

function recommend(x,promo=false){
  const available=n(x.availableQty??x.qty),daily=n(x.dailySales),days=coverage(available,daily),target=promo?PROMO_TARGET_DAYS:TARGET_DAYS;
  if(x.type==='NEGATIVE'||available<0)return {...x,availableQty:available,coverageDays:days,priority:'P0',recommendation:'INVENTORY',recommendedQty:0,reason:'Stock négatif : fiabiliser le stock par inventaire ciblé avant toute commande.'};
  if(n(x.inboundQty)>0)return {...x,availableQty:available,coverageDays:days,priority:'P3',recommendation:'COVERED',recommendedQty:0,reason:`Entrant déjà prévu : ${n(x.inboundQty)} u. ${x.inboundEta||'en approche'}. Ne pas commander en doublon.`};
  const qty=Math.max(1,Math.ceil(daily*target-Math.max(0,available))),urgent=available<=0||(promo&&days!=null&&days<1.5);
  if(n(x.centralStock)>0)return {...x,availableQty:available,coverageDays:days,priority:urgent?'P0':'P1',recommendation:'TO',recommendedQty:Math.min(qty,Math.floor(n(x.centralStock))),reason:`Dépôt disponible : ${n(x.centralStock)} u. → privilégier un transfert avant un PO.`};
  return {...x,availableQty:available,coverageDays:days,priority:urgent?'P0':'P1',recommendation:'PO',recommendedQty:qty,reason:`Pas de stock dépôt disponible → PO recommandé pour viser ${target} jours de couverture.`};
}

async function loadRecommendations(force=false){
  if(!app.storeId)return {rows:[],immediate:0,actionable:0};
  const key=`${app.storeId}:${app.showcase?'S':'L'}`;if(!force&&cache.key===key&&Date.now()-cache.at<CACHE_MS)return cache.data;
  const [signals,commercial]=await Promise.all([safe(api(`/api/stores/${app.storeId}/stock-signals`),{items:[],source:'UNAVAILABLE'}),safe(api(`/api/stores/${app.storeId}/commercial`),{items:[]})]);
  const raw=app.showcase&&app.storeId==='val-fleuri'?SHOWCASE_SIGNALS:[...(signals.items||[])],promos=promoEans(commercial);
  const rows=raw.map(x=>recommend(x,promos.has(String(x.ean||'')))).filter(x=>x.type!=='LOW'||x.recommendation==='COVERED'||x.coverageDays==null||x.coverageDays<=LOW_COVERAGE_DAYS);
  rows.sort((a,b)=>({P0:0,P1:1,P2:2,P3:3}[a.priority]??9)-({P0:0,P1:1,P2:2,P3:3}[b.priority]??9));
  const data={rows,immediate:rows.filter(x=>x.priority==='P0').length,actionable:rows.filter(x=>['INVENTORY','TO','PO'].includes(x.recommendation)).length};cache={key,at:Date.now(),data};return data;
}

const priorityLabel=p=>({P0:'Immédiat',P1:'Prioritaire',P2:'Aujourd’hui',P3:'Déjà couvert'}[p]||p);
function actionLabel(r){if(r.recommendation==='INVENTORY')return'Compter maintenant';if(r.recommendation==='TO')return`Préparer TO · ${r.recommendedQty} u.`;if(r.recommendation==='PO')return`Préparer PO · ${r.recommendedQty} u.`;return'Aucune commande à passer'}
function card(r,compact=false){const cov=r.coverageDays==null?'—':`${r.coverageDays.toFixed(1)} j`;return `<article class="repl-card ${r.priority==='P0'?'repl-p0':''}"><div class="repl-chips"><span>${esc(priorityLabel(r.priority))}</span><span>${r.type==='NEGATIVE'?'Stock négatif':r.type==='OUT'?'Rupture':'Proche rupture'}</span></div><strong>${esc(r.product||r.product_name||r.ean||'Article')}</strong><small>Stock ${n(r.availableQty)} u.${r.dailySales?` · ventes moy. ${n(r.dailySales)} u./j · couverture ${cov}`:''}</small>${compact?'':`<p>${esc(r.reason)}</p>`}<button class="repl-action" data-repl-action="${esc(r.recommendation)}" data-repl-ean="${esc(r.ean||'')}" data-repl-product="${esc(r.product||'Article')}" data-repl-product-number="${esc(r.productNumber||'')}" data-repl-qty="${r.recommendedQty||0}" ${r.recommendation==='COVERED'?'disabled':''}>${esc(actionLabel(r))}</button></article>`}

function styles(){if(document.querySelector('#replStyles'))return;const s=document.createElement('style');s.id='replStyles';s.textContent=`.repl-panel{margin:14px 0;padding:16px;border:1px solid var(--line);border-radius:20px;background:#fff}.repl-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.repl-head h3{margin:3px 0 4px;font-size:22px}.repl-head p{margin:0;color:var(--muted);font-size:12px}.repl-list{display:grid;gap:10px}.repl-card{border:1px solid var(--line);border-radius:16px;padding:13px;background:#fff}.repl-card.repl-p0{border-color:#ee9ab4;background:#fff7fa}.repl-card strong{display:block;font-size:16px}.repl-card small{display:block;color:var(--muted);margin-top:4px}.repl-card p{font-size:12px;line-height:1.4;margin:8px 0}.repl-chips{display:flex;gap:6px;margin-bottom:7px}.repl-chips span{font-size:10px;font-weight:850;text-transform:uppercase;border-radius:999px;background:#f3eef0;padding:5px 8px}.repl-action{width:100%;min-height:42px;margin-top:9px;border:0;border-radius:12px;background:#ea0050;color:#fff;font-weight:850}.repl-action:disabled{background:#eee7ea;color:#776d72}.repl-export{margin:14px 0;padding:14px;border-radius:18px;background:#2a2226;color:#fff}.repl-export .row{display:flex;justify-content:space-between;gap:10px;align-items:center}.repl-export button{border:0;border-radius:11px;padding:10px 12px;font-weight:850}.repl-note{font-size:11px;opacity:.72;margin-top:6px}.repl-mini{margin:10px 0}.repl-mini .repl-card p{display:none}@media(max-width:520px){.repl-head{display:block}.repl-card{padding:12px}}`;document.head.appendChild(s)}

async function movementRows(){
  const [inv,loss]=await Promise.all([safe(api(`/api/stores/${app.storeId}/inventory?status=ALL`),{items:[]}),safe(api(`/api/stores/${app.storeId}/losses`),{items:[]})]),rows=[];
  for(const s of inv.items||[])if(s.status==='READY_TO_POST')for(const l of s.lines||[]){const q=n(l.final_variance);if(q)rows.push({LEGAL_ENTITY:'5001',WAREHOUSE:app.storeId==='val-fleuri'?'FRP0001':'',TRANSACTION_TYPE:'INVENTORY_ADJUSTMENT',ITEM_NUMBER:l.product_number||'',EAN:l.ean||'',QUANTITY:q,UNIT:l.unit||'',REASON_CODE:l.reason_code||'INVENTORY',REFERENCE:s.id,SOURCE_TYPE:'INVENTORY',SOURCE_ID:l.id,DATE:day(),NOTE:l.note||''})}
  for(const l of loss.items||[])if(['READY_TO_POST','APPROVED'].includes(l.status))rows.push({LEGAL_ENTITY:'5001',WAREHOUSE:app.storeId==='val-fleuri'?'FRP0001':'',TRANSACTION_TYPE:'LOSS',ITEM_NUMBER:l.product_number||'',EAN:l.ean||'',QUANTITY:-Math.abs(n(l.quantity)),UNIT:l.unit||'',REASON_CODE:l.reason_code||'LOSS',REFERENCE:l.id,SOURCE_TYPE:l.source_type||'LOSS',SOURCE_ID:l.source_id||l.id,DATE:l.business_date||day(),NOTE:l.note||''});
  return rows;
}
const MOVEMENT_COLUMNS=['LEGAL_ENTITY','WAREHOUSE','TRANSACTION_TYPE','ITEM_NUMBER','EAN','QUANTITY','UNIT','REASON_CODE','REFERENCE','SOURCE_TYPE','SOURCE_ID','DATE','NOTE'];
const REPL_COLUMNS=['ACTION','DESTINATION_STORE','DESTINATION_WAREHOUSE','SOURCE_WAREHOUSE','ITEM_NUMBER','EAN','QUANTITY','REQUESTED_DATE','RATIONALE','CREATED_AT'];

async function inject(force=false){
  if(!app.storeId)return;styles();const data=await loadRecommendations(force),inv=document.querySelector('#inventoryContent'),controls=document.querySelector('#managerControlsContent'),today=document.querySelector('#todayContent');
  if(inv&&!inv.querySelector('[data-repl-panel]')){const el=document.createElement('section');el.className='repl-panel';el.dataset.replPanel='1';el.innerHTML=`<div class="repl-head"><div><span class="manager-eyebrow">Assistant réapprovisionnement</span><h3>Ruptures & risque de rupture</h3><p>Compter → vérifier les entrants → transférer depuis le dépôt → seulement ensuite proposer un PO.</p></div><span class="pill">${data.actionable} action(s)</span></div><div class="repl-list">${data.rows.map(r=>card(r)).join('')||'<div class="empty compact">Aucun risque détecté.</div>'}</div><div class="repl-note">Showcase : ventes, stock dépôt et entrants sont simulés. En LIVE, une recommandation PO/TO ne sera émise qu’après mapping de ces données Dynamics.</div>`;inv.prepend(el)}
  const urgent=data.rows.filter(r=>['P0','P1'].includes(r.priority)).slice(0,4);
  if(controls&&urgent.length&&!controls.querySelector('[data-repl-controls]')){const el=document.createElement('section');el.className='manager-inbox-section repl-mini';el.dataset.replControls='1';el.innerHTML=`<div class="manager-inbox-section-head"><h3>Réapprovisionnement</h3><span>${urgent.length}</span></div><div class="repl-list">${urgent.map(r=>card(r,true)).join('')}</div>`;controls.querySelector('.manager-inbox-stats')?.insertAdjacentElement('afterend',el)}
  if(today&&data.immediate&&!today.querySelector('[data-repl-today]')){const el=document.createElement('div');el.className='manager-alert-strip';el.dataset.replToday='1';el.innerHTML=`<div><strong>${data.immediate} action(s) réappro immédiate(s)</strong><small>Stock négatif ou rupture critique.</small></div><button data-manager-go="managerControls">Voir</button>`;today.querySelector('.manager-inbox-stats')?.insertAdjacentElement('afterend',el)}
  await injectExports(inv,document.querySelector('#lossesContent'));
}

async function injectExports(...hosts){const rows=await movementRows(),repl=batch();for(const host of hosts.filter(Boolean)){if(host.querySelector('[data-d365-export]'))continue;const el=document.createElement('section');el.className='repl-export';el.dataset.d365Export='1';el.innerHTML=`<div class="row"><div><strong>Assistant Dynamics</strong><div class="small">${rows.length} mouvement(s) inventaire/démarque prêt(s) · ${repl.length} demande(s) réappro préparée(s)</div></div><button data-export-movements ${rows.length?'':'disabled'}>Exporter mouvements</button></div>${repl.length?`<div class="row" style="margin-top:8px"><div class="small">Lot TO / PO prêt</div><div><button data-export-repl>Exporter réappro</button> <button data-clear-repl>Vider</button></div></div>`:''}<div class="repl-note">Format pilote StoreOps : le mapping exact Data Management F&O doit être validé avant import direct en production.</div>`;host.prepend(el)}}

async function createTargetedInventory(btn){const s=await api(`/api/stores/${app.storeId}/inventory`,{method:'POST',body:JSON.stringify({type:'TARGETED',zone:'Anomalie stock',comment:`Généré depuis StoreOps · ${btn.dataset.replProduct}`})});if(s?.id&&btn.dataset.replEan)await api(`/api/inventory/${s.id}/lines`,{method:'POST',body:JSON.stringify({ean:btn.dataset.replEan})});toast('Inventaire ciblé créé. L’article est prêt à être compté.');cache.at=0;schedule(true)}
function prepareOrder(btn){const action=btn.dataset.replAction,row={action,storeId:app.storeId,destinationWarehouse:app.storeId==='val-fleuri'?'FRP0001':'',sourceWarehouse:action==='TO'?'DEPOT-CENTRAL':'SUPPLIER',product:btn.dataset.replProduct,productNumber:btn.dataset.replProductNumber||'',ean:btn.dataset.replEan||'',quantity:n(btn.dataset.replQty),requestedDate:day(),rationale:action==='TO'?'Stock dépôt disponible · transfert recommandé':'Pas de stock dépôt disponible · PO fournisseur recommandé',createdAt:new Date().toISOString()},rows=batch(),key=`${action}:${app.storeId}:${row.productNumber||row.ean}`;saveBatch([...rows.filter(x=>x.key!==key),{...row,key}]);toast(`${action==='TO'?'Transfert':'PO'} ajouté au lot Dynamics.`);schedule(true)}
async function exportMovements(){const rows=await movementRows();if(!rows.length)return toast('Aucun mouvement prêt à exporter.');downloadCsv(`StoreOps_Mouvements_Dynamics_${app.storeId}_${day()}.csv`,MOVEMENT_COLUMNS,rows);toast('Fichier Dynamics pilote généré.')}
function exportRepl(){const rows=batch();if(!rows.length)return toast('Aucune demande réappro préparée.');downloadCsv(`StoreOps_Reappro_Dynamics_${app.storeId}_${day()}.csv`,REPL_COLUMNS,rows.map(x=>({ACTION:x.action,DESTINATION_STORE:x.storeId,DESTINATION_WAREHOUSE:x.destinationWarehouse,SOURCE_WAREHOUSE:x.sourceWarehouse,ITEM_NUMBER:x.productNumber,EAN:x.ean,QUANTITY:x.quantity,REQUESTED_DATE:x.requestedDate,RATIONALE:x.rationale,CREATED_AT:x.createdAt})));toast('Lot réappro exporté.')}
function clearRepl(){saveBatch([]);toast('Lot réappro vidé.');schedule(true)}

function bind(){if(document.body.dataset.replBound==='1')return;document.body.dataset.replBound='1';document.addEventListener('click',async e=>{const b=e.target.closest('[data-repl-action]');if(b){e.preventDefault();try{if(b.dataset.replAction==='INVENTORY')await createTargetedInventory(b);else if(['TO','PO'].includes(b.dataset.replAction))prepareOrder(b)}catch(err){toast(err.message)}return}if(e.target.closest('[data-export-movements]')){e.preventDefault();return exportMovements()}if(e.target.closest('[data-export-repl]')){e.preventDefault();return exportRepl()}if(e.target.closest('[data-clear-repl]')){e.preventDefault();return clearRepl()}})}
function schedule(force=false){clearTimeout(timer);timer=setTimeout(async()=>{if(rendering)return;rendering=true;try{await inject(force)}catch(e){console.warn('StoreOps replenishment assistant',e)}finally{rendering=false}},80)}

bind();new MutationObserver(()=>schedule(false)).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('storeops:booted',()=>schedule(true));schedule(true);

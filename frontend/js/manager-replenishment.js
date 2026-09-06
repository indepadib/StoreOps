import { api } from './api.js';
import { app } from './state.js';
import { toast,esc } from './ui.js';

const CACHE_MS=15000;
const TARGET_DAYS=5;
const PROMO_TARGET_DAYS=7;
const LOW_COVERAGE_DAYS=2.5;
const REPL_BATCH_KEY='storeops_replenishment_batch_v1';
let cache={key:'',at:0,data:null};
let rendering=false;

const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const ceil=v=>Math.max(0,Math.ceil(num(v)));
const isoDay=()=>new Date().toISOString().slice(0,10);
const safe=(p,fallback)=>Promise.resolve(p).catch(()=>fallback);

const SHOWCASE_FACTS={
  '5449000000996':{dailySales:12,centralStock:220,inboundQty:0,supplier:'Coca-Cola',leadTimeDays:2},
  '6111000000011':{dailySales:18,centralStock:360,inboundQty:0,supplier:'Sidi Ali',leadTimeDays:2},
  '6111035000013':{dailySales:9,centralStock:0,inboundQty:0,supplier:'Centrale Danone',leadTimeDays:2},
  '3017620422003':{dailySales:8,centralStock:120,inboundQty:0,supplier:'Ferrero',leadTimeDays:3,availableQty:17,product:'Nutella 750g',productNumber:'NUT750',type:'LOW'},
  '3274080005003':{dailySales:5,centralStock:40,inboundQty:24,inboundEta:'demain',supplier:'Fournisseur PLS',leadTimeDays:2,availableQty:6,product:'Yaourt nature 4x110g',productNumber:'YAOURT4',type:'LOW'}
};

function batch(){try{return JSON.parse(localStorage.getItem(REPL_BATCH_KEY)||'[]')}catch{return[]}}
function saveBatch(rows){localStorage.setItem(REPL_BATCH_KEY,JSON.stringify(rows))}
function addBatch(row){const rows=batch(),key=`${row.action}:${row.storeId}:${row.productNumber||row.ean}`;const next=[...rows.filter(x=>x.key!==key),{...row,key,createdAt:new Date().toISOString()}];saveBatch(next);toast(`${row.action==='TO'?'Transfert':'PO'} ajouté au lot Dynamics.`);schedule(true)}
function clearBatch(){saveBatch([]);schedule(true)}

function csvCell(v){const s=String(v??'');return /[;"\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s}
function downloadCsv(filename,columns,rows){const body=[columns.join(';'),...rows.map(r=>columns.map(c=>csvCell(r[c])).join(';'))].join('\r\n');const blob=new Blob(['\uFEFF'+body],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500)}

function promoEans(commercial){return new Set((commercial?.items||[]).filter(x=>['PROMO_START','PROMO_END'].includes(x.action_type)||x.promo_label).map(x=>String(x.ean||'')).filter(Boolean))}
function daysCoverage(available,daily){return daily>0?available/daily:null}

function recommendation(x,{promo=false}={}){
  const available=num(x.availableQty??x.qty),daily=num(x.dailySales),coverage=daysCoverage(Math.max(0,available),daily),targetDays=promo?PROMO_TARGET_DAYS:TARGET_DAYS;
  if(x.type==='NEGATIVE'||available<0)return {...x,availableQty:available,coverageDays:coverage,priority:'P0',recommendation:'INVENTORY',recommendationLabel:'Inventaire ciblé maintenant',recommendedQty:null,reason:'Un stock négatif doit être fiabilisé avant toute commande.'};
  if(num(x.inboundQty)>0){return {...x,availableQty:available,coverageDays:coverage,priority:'P3',recommendation:'COVERED',recommendationLabel:`Déjà couvert · ${x.inboundQty} u. ${x.inboundEta||'en approche'}`,recommendedQty:0,reason:'Une entrée est déjà prévue : éviter une commande en doublon.'};}
  const gap=ceil(daily*targetDays-Math.max(0,available));
  const urgent=available<=0||(promo&&coverage!=null&&coverage<1.5);
  if(num(x.centralStock)>0)return {...x,availableQty:available,coverageDays:coverage,priority:urgent?'P0':'P1',recommendation:'TO',recommendationLabel:'Transfert dépôt recommandé',recommendedQty:Math.max(1,Math.min(gap||ceil(daily*targetDays),Math.floor(num(x.centralStock)))),reason:`Stock dépôt disponible ${num(x.centralStock)} u. · privilégier un transfert avant un PO.`};
  return {...x,availableQty:available,coverageDays:coverage,priority:urgent?'P0':'P1',recommendation:'PO',recommendationLabel:'PO fournisseur recommandé',recommendedQty:Math.max(1,gap||ceil(daily*targetDays)),reason:`Pas de stock dépôt disponible · couverture cible ${targetDays} jours.`};
}

async function loadRecommendations(force=false){
  const key=`${app.storeId}:${app.showcase?'showcase':'live'}`;if(!force&&cache.key===key&&Date.now()-cache.at<CACHE_MS)return cache.data;
  const [signals,commercial]=await Promise.all([safe(api(`/api/stores/${app.storeId}/stock-signals`),{items:[],source:'UNAVAILABLE'}),safe(api(`/api/stores/${app.storeId}/commercial`),{items:[]})]);
  const promos=promoEans(commercial),raw=(signals.items||[]).map(x=>({...x,...(app.showcase?SHOWCASE_FACTS[String(x.ean||'')]:{})}));
  if(app.showcase&&app.storeId==='val-fleuri'){
    for(const [ean,fact] of Object.entries(SHOWCASE_FACTS))if(fact.type==='LOW'&&!raw.some(x=>String(x.ean||'')===ean))raw.push({id:`low-${ean}`,ean,...fact,qty:fact.availableQty});
  }
  const rows=raw.map(x=>recommendation(x,{promo:promos.has(String(x.ean||''))})).filter(x=>x.type!=='LOW'||x.coverageDays==null||x.coverageDays<=LOW_COVERAGE_DAYS||x.recommendation==='COVERED');
  rows.sort((a,b)=>({P0:0,P1:1,P2:2,P3:3}[a.priority]??9)-({P0:0,P1:1,P2:2,P3:3}[b.priority]??9));
  const data={source:signals.source||'StoreOps',rows,immediate:rows.filter(x=>x.priority==='P0').length,actionable:rows.filter(x=>['INVENTORY','TO','PO'].includes(x.recommendation)).length};cache={key,at:Date.now(),data};return data;
}

function prioLabel(p){return {P0:'Immédiat',P1:'Prioritaire',P2:'Aujourd’hui',P3:'Couvert'}[p]||p}
function actionLabel(r){return r.recommendation==='INVENTORY'?'Compter maintenant':r.recommendation==='TO'?`Préparer TO · ${r.recommendedQty} u.`:r.recommendation==='PO'?`Préparer PO · ${r.recommendedQty} u.`:'Aucune commande'}
function card(r,{compact=false}={}){const coverage=r.coverageDays==null?'—':`${r.coverageDays.toFixed(1)} j`;return `<article class="repl-card ${r.priority==='P0'?'repl-p0':''}"><div class="repl-chips"><span>${esc(prioLabel(r.priority))}</span><span>${r.type==='NEGATIVE'?'Stock négatif':r.type==='OUT'?'Rupture':'Proche rupture'}</span></div><strong>${esc(r.product||r.product_name||r.ean||'Article')}</strong><small>Stock ${num(r.availableQty)} u.${r.dailySales?` · ventes moy. ${num(r.dailySales)} u./j · couverture ${coverage}`:''}</small>${compact?'':`<p>${esc(r.reason||'')}</p>`}<button class="repl-action" data-repl-action="${esc(r.recommendation)}" data-repl-ean="${esc(r.ean||'')}" data-repl-product="${esc(r.product||r.product_name||'Article')}" data-repl-product-number="${esc(r.productNumber||'')}" data-repl-qty="${r.recommendedQty||''}" ${r.recommendation==='COVERED'?'disabled':''}>${esc(actionLabel(r))}</button></article>`}

function ensureStyles(){if(document.querySelector('#replStyles'))return;const s=document.createElement('style');s.id='replStyles';s.textContent=`.repl-panel{margin:14px 0;padding:16px;border:1px solid var(--line);border-radius:20px;background:#fff}.repl-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.repl-head h3{margin:3px 0 4px;font-size:22px}.repl-head p{margin:0;color:var(--muted);font-size:12px}.repl-list{display:grid;gap:10px}.repl-card{border:1px solid var(--line);border-radius:16px;padding:13px;background:#fff}.repl-card.repl-p0{border-color:#ee9ab4;background:#fff7fa}.repl-card strong{display:block;font-size:16px}.repl-card small{display:block;color:var(--muted);margin-top:4px}.repl-card p{font-size:12px;line-height:1.4;margin:8px 0}.repl-chips{display:flex;gap:6px;margin-bottom:7px}.repl-chips span{font-size:10px;font-weight:850;text-transform:uppercase;border-radius:999px;background:#f3eef0;padding:5px 8px}.repl-action{width:100%;min-height:42px;margin-top:9px;border:0;border-radius:12px;background:#ea0050;color:#fff;font-weight:850}.repl-action:disabled{background:#eee7ea;color:#776d72}.repl-export{margin:14px 0;padding:14px;border-radius:18px;background:#2a2226;color:#fff}.repl-export .row{display:flex;justify-content:space-between;gap:10px;align-items:center}.repl-export button{border:0;border-radius:11px;padding:10px 12px;font-weight:850}.repl-note{font-size:11px;opacity:.7;margin-top:6px}.repl-mini{margin:10px 0}.repl-mini .repl-list{grid-template-columns:1fr}.repl-mini .repl-card p{display:none}@media(max-width:520px){.repl-head{display:block}.repl-head .pill{margin-top:8px}.repl-card{padding:12px}}`;document.head.appendChild(s)}

async function injectRecommendations(force=false){if(!app.storeId)return;const data=await loadRecommendations(force);const inv=document.querySelector('#inventoryContent'),controls=document.querySelector('#managerControlsContent'),today=document.querySelector('#todayContent');
  if(inv&&!inv.querySelector('[data-repl-panel]')){const el=document.createElement('section');el.className='repl-panel';el.dataset.replPanel='1';el.innerHTML=`<div class="repl-head"><div><span class="manager-eyebrow">Assistant réapprovisionnement</span><h3>Ruptures & risque de rupture</h3><p>StoreOps recommande d’abord l’action la plus sûre : compter, attendre un entrant, transférer, puis seulement commander fournisseur.</p></div><span class="pill">${data.actionable} action(s)</span></div><div class="repl-list">${data.rows.map(r=>card(r)).join('')||'<div class="empty compact">Aucun risque détecté.</div>'}</div><div class="repl-note">Showcase : ventes, stock dépôt et entrants sont simulés. En LIVE, StoreOps n’émettra une recommandation PO/TO que lorsque ces données auront été mappées dans Dynamics.</div>`;inv.prepend(el)}
  const urgent=data.rows.filter(r=>r.priority==='P0'||r.priority==='P1').slice(0,4);
  if(controls&&urgent.length&&!controls.querySelector('[data-repl-controls]')){const el=document.createElement('section');el.className='manager-inbox-section repl-mini';el.dataset.replControls='1';el.innerHTML=`<div class="manager-inbox-section-head"><h3>Réapprovisionnement</h3><span>${urgent.length}</span></div><div class="repl-list">${urgent.map(r=>card(r,{compact:true})).join('')}</div>`;const anchor=controls.querySelector('.manager-inbox-stats');anchor?.insertAdjacentElement('afterend',el)}
  if(today&&data.immediate&&!today.querySelector('[data-repl-today]')){const el=document.createElement('div');el.className='manager-alert-strip';el.dataset.replToday='1';el.innerHTML=`<div><strong>${data.immediate} action(s) réappro immédiate(s)</strong><small>Stock négatif, rupture promo ou risque critique.</small></div><button data-manager-go="managerControls">Voir</button>`;const anchor=today.querySelector('.manager-inbox-stats');anchor?.insertAdjacentElement('afterend',el)}
}

async function movementRows(){const [inv,loss]=await Promise.all([safe(api(`/api/stores/${app.storeId}/inventory?status=ALL`),{items:[]}),safe(api(`/api/stores/${app.storeId}/losses`),{items:[]})]);const rows=[];
  for(const s of inv.items||[])if(s.status==='READY_TO_POST')for(const l of s.lines||[]){const q=num(l.final_variance);if(!q)continue;rows.push({LEGAL_ENTITY:'5001',WAREHOUSE:app.storeId==='val-fleuri'?'FRP0001':'',TRANSACTION_TYPE:'INVENTORY_ADJUSTMENT',ITEM_NUMBER:l.product_number||'',EAN:l.ean||'',QUANTITY:q,UNIT:l.unit||'',REASON_CODE:l.reason_code||'INVENTORY',REFERENCE:s.id,SOURCE_TYPE:'INVENTORY',SOURCE_ID:l.id,DATE:isoDay(),NOTE:l.note||''})}
  for(const l of loss.items||[])if(['READY_TO_POST','APPROVED'].includes(l.status))rows.push({LEGAL_ENTITY:'5001',WAREHOUSE:app.storeId==='val-fleuri'?'FRP0001':'',TRANSACTION_TYPE:'LOSS',ITEM_NUMBER:l.product_number||'',EAN:l.ean||'',QUANTITY:-Math.abs(num(l.quantity)),UNIT:l.unit||'',REASON_CODE:l.reason_code||'LOSS',REFERENCE:l.id,SOURCE_TYPE:l.source_type||'LOSS',SOURCE_ID:l.source_id||l.id,DATE:l.business_date||isoDay(),NOTE:l.note||''});return rows}

const MOVEMENT_COLUMNS=['LEGAL_ENTITY','WAREHOUSE','TRANSACTION_TYPE','ITEM_NUMBER','EAN','QUANTITY','UNIT','REASON_CODE','REFERENCE','SOURCE_TYPE','SOURCE_ID','DATE','NOTE'];
const REPL_COLUMNS=['ACTION','DESTINATION_STORE','DESTINATION_WAREHOUSE','SOURCE_WAREHOUSE','ITEM_NUMBER','EAN','QUANTITY','REQUESTED_DATE','RATIONALE','CREATED_AT'];

async function injectExport(){if(!app.storeId)return;const rows=await movementRows(),repl=batch();for(const host of [document.querySelector('#inventoryContent'),document.querySelector('#lossesContent')].filter(Boolean)){if(host.querySelector('[data-d365-export]'))continue;const el=document.createElement('section');el.className='repl-export';el.dataset.d365Export='1';el.innerHTML=`<div class="row"><div><strong>Assistant Dynamics</strong><div class="small">${rows.length} mouvement(s) inventaire/démarque prêt(s) · ${repl.length} demande(s) réappro préparée(s)</div></div><button data-export-movements ${rows.length?'':'disabled'}>Exporter</button></div><div class="repl-note">Format pilote StoreOps. Le mapping exact Data Management F&O doit être validé avant import direct en production.</div>`;host.prepend(el)}}

async function createTargetedInventory(btn){const ean=btn.dataset.replEan,product=btn.dataset.replProduct;const s=await api(`/api/stores/${app.storeId}/inventory`,{method:'POST',body:JSON.stringify({type:'TARGETED',zone:'Anomalie stock',comment:`Généré depuis StoreOps · ${product}`})});if(s?.id&&ean)await api(`/api/inventory/${s.id}/lines`,{method:'POST',body:JSON.stringify({ean})});toast('Inventaire ciblé créé et article ajouté.');cache.at=0;schedule(true)}
function prepareOrder(btn){const action=btn.dataset.replAction,qty=num(btn.dataset.replQty);addBatch({action,storeId:app.storeId,destinationWarehouse:app.storeId==='val-fleuri'?'FRP0001':'',sourceWarehouse:action==='TO'?'DEPOT-CENTRAL':'SUPPLIER',product:btn.dataset.replProduct,productNumber:btn.dataset.replProductNumber||'',ean:btn.dataset.replEan||'',quantity:qty,requestedDate:isoDay(),rationale:action==='TO'?'Stock dépôt disponible · transfert recommandé':'Pas de stock dépôt disponible · commande fournisseur recommandée'})}
function exportRepl(){const rows=batch();if(!rows.length)return toast('Aucune demande réappro préparée.');downloadCsv(`StoreOps_Reappro_Dynamics_${app.storeId}_${isoDay()}.csv`,REPL_COLUMNS,rows.map(x=>({ACTION:x.action,DESTINATION_STORE:x.storeId,DESTINATION_WAREHOUSE:x.destinationWarehouse,SOURCE_WAREHOUSE:x.sourceWarehouse,ITEM_NUMBER:x.productNumber,EAN:x.ean,QUANTITY:x.quantity,REQUESTED_DATE:x.requestedDate,RATIONALE:x.rationale,CREATED_AT:x.createdAt})));toast('Lot réappro exporté.');}
async function exportMovements(){const rows=await movementRows();if(!rows.length)return toast('Aucun mouvement prêt à exporter.');downloadCsv(`StoreOps_Mouvements_Dynamics_${app.storeId}_${isoDay()}.csv`,MOVEMENT_COLUMNS,rows);toast('Fichier Dynamics pilote généré.');}

function bindGlobal(){if(document.body.dataset.replBound==='1')return;document.body.dataset.replBound='1';document.addEventListener('click',async e=>{const b=e.target.closest('[data-repl-action]');if(b){e.preventDefault();try{if(b.dataset.replAction==='INVENTORY')await createTargetedInventory(b);else if(['TO','PO'].includes(b.dataset.replAction))prepareOrder(b)}catch(err){toast(err.message)}return}if(e.target.closest('[data-export-movements]')){e.preventDefault();return exportMovements()}if(e.target.closest('[data-export-repl]')){e.preventDefault();return exportRepl()}if(e.target.closest('[data-clear-repl]')){e.preventDefault();clearBatch()}})}

async function injectBatchToolbar(){const host=document.querySelector('#inventoryContent');if(!host||host.querySelector('[data-repl-batch]'))return;const rows=batch();if(!rows.length)return;const el=document.createElement('div');el.className='repl-export';el.dataset.replBatch='1';el.innerHTML=`<div class="row"><div><strong>Lot réappro prêt</strong><div class="small">${rows.length} demande(s) TO / PO préparée(s)</div></div><div><button data-export-repl>Exporter</button> <button data-clear-repl>Vider</button></div></div>`;host.prepend(el)}

async function renderEnhancement(force=false){if(rendering)return;rendering=true;try{ensureStyles();await injectRecommendations(force);await injectExport();await injectBatchToolbar()}catch(e){console.warn('StoreOps replenishment assistant',e)}finally{rendering=false}}
let timer=null;function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>renderEnhancement(force),80)}

bindGlobal();const obs=new MutationObserver(()=>schedule(false));obs.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('storeops:booted',()=>schedule(true));schedule(true);

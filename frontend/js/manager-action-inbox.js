import { api } from './api.js';
import { app } from './state.js';
import { summarizeReceipts,summarizeQualityToday } from './today-signals.js';
import { maintenanceSummary } from './maintenance-model.js';
import { priorityFromContext,sortManagerActions,priorityLabel } from './manager-priority-rules.js';

const safe=(p,fallback)=>Promise.resolve(p).catch(()=>fallback);
const n=v=>Number(v||0);
const money=v=>v==null?'':`${Number(v).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2})} DH`;
const dateOnly=v=>String(v||'').slice(0,10);
const today=()=>new Date().toISOString().slice(0,10);

function commercialTitle(row){
  if(row.action_type==='PRICE_CHANGE')return `Changer le prix · ${row.product_name}`;
  if(row.action_type==='PROMO_START')return `Installer la promo · ${row.product_name}`;
  if(row.action_type==='PROMO_END')return `Retirer la promo · ${row.product_name}`;
  if(row.action_type==='NEW_ITEM')return `Valider le nouvel article · ${row.product_name}`;
  return `Valider l’article · ${row.product_name}`;
}
function commercialDetail(row){
  if(row.action_type==='PRICE_CHANGE')return `${money(row.old_price)} → ${money(row.expected_price)} · vérifier prix rayon et étiquette`;
  if(row.action_type==='PROMO_START')return `${row.promo_label||'Promotion à installer'} · prix attendu ${money(row.expected_price)}`;
  if(row.action_type==='PROMO_END')return `${row.promo_label||'Promotion terminée'} · retour attendu ${money(row.expected_price)}`;
  return `EAN ${row.ean||'—'} · contrôle rayon à valider`;
}

function showcaseStockSignals(){
  if(!app.showcase||app.storeId!=='val-fleuri')return {source:'SHOWCASE',warehouse:null,items:[],summary:{total:0,negative:0,outOfStock:0}};
  const items=[
    {id:'stock-neg-coca',type:'NEGATIVE',priority:'P0',product:'Coca-Cola 1,5L',ean:'5449000000996',qty:-3,warehouse:'FRP0001',detail:'Stock disponible -3 · vérifier rayon + réserve puis lancer un inventaire ciblé'},
    {id:'stock-oos-eau',type:'OUT',priority:'P1',product:'Sidi Ali 1,5L',ean:'6111000000011',qty:0,warehouse:'FRP0001',detail:'Rupture détectée · stock disponible 0 · contrôler réserve / facing'},
    {id:'stock-oos-lait',type:'OUT',priority:'P1',product:'Lait UHT entier 1L',ean:'6111035000013',qty:0,warehouse:'FRP0001',detail:'Rupture détectée · stock disponible 0 · contrôler disponibilité physique'}
  ];
  return {source:'SHOWCASE',warehouse:'FRP0001',items,summary:{total:3,negative:1,outOfStock:2}};
}

async function loadStockSignals(){
  const live=await safe(api(`/api/stores/${app.storeId}/stock-signals`),null);
  if(live?.items)return live;
  return showcaseStockSignals();
}

function action({id,category,severity='HIGH',title,detail,page,blocking=false,meta='',count=1,type='',promo=false,overdue=false,mismatch=false,priority=null,source=''}){
  const resolvedPriority=priority||priorityFromContext({category,type,severity,blocking,promo,overdue,mismatch});
  return {id,category,severity,title,detail,page,blocking:!!blocking,meta,count,type,promo,overdue,mismatch,priority:resolvedPriority,source};
}

export async function loadManagerInbox(){
  const [dashboard,commercial,receiptRows,inventoryData,lossData,incidentData,staffData,coldData,cashOpenData,qualityRows,stockData]=await Promise.all([
    api(`/api/stores/${app.storeId}/dashboard`),
    safe(api(`/api/stores/${app.storeId}/commercial`),{summary:{},items:[]}),
    safe(api(`/api/stores/${app.storeId}/receipts`),[]),
    safe(api(`/api/stores/${app.storeId}/inventory?status=ALL`),{summary:{},items:[]}),
    safe(api(`/api/stores/${app.storeId}/losses`),{summary:{},items:[]}),
    safe(api(`/api/stores/${app.storeId}/incidents?status=OPEN`),{items:[]}),
    safe(api(`/api/stores/${app.storeId}/staffing`),{summary:{}}),
    safe(api(`/api/stores/${app.storeId}/cold-chain`),{summary:{}}),
    safe(api(`/api/stores/${app.storeId}/cash-opening`),{summary:{}}),
    safe(api(`/api/stores/${app.storeId}/quality`),[]),
    loadStockSignals()
  ]);

  const stockSignals=stockData.items||[];
  const staff=staffData.summary||{},cold=coldData.summary||{},cashOpen=cashOpenData.summary||{},loss=lossData.summary||{};
  const receipts=summarizeReceipts(receiptRows),quality=summarizeQualityToday(qualityRows),alerts=(incidentData.items||[]).filter(x=>x.status==='OPEN');
  const maintenance=maintenanceSummary(alerts);
  const items=[];
  const commercialRows=commercial.items||[];
  const promoEans=new Set(commercialRows.filter(x=>x.action_type==='PROMO_START'||x.promo_label).map(x=>String(x.ean||'')).filter(Boolean));

  if(n(dashboard.handover?.blocking)>0)items.push(action({id:'handover-blocking',category:'OPENING',severity:'CRITICAL',title:'Passation bloquante',detail:`${dashboard.handover.blocking} sujet(s) doivent être traités avant l’ouverture`,page:'handover',blocking:true,priority:'P0'}));
  if(n(staff.blocking)>0)items.push(action({id:'staffing-opening',category:'OPENING',severity:'CRITICAL',title:'Équipe d’ouverture à compléter',detail:`${staff.pending||0} personne(s) restent à pointer / confirmer`,page:'staffing',blocking:true,priority:'P0'}));
  if(n(cold.blocking)>0)items.push(action({id:'cold-opening',category:'OPENING',severity:'CRITICAL',title:'Chaîne du froid à valider',detail:`${cold.blocking} zone(s) restent non validées`,page:'coldChain',blocking:true,priority:'P0'}));
  if(n(cashOpen.blocking)>0)items.push(action({id:'cash-opening',category:'OPENING',severity:'CRITICAL',title:'Caisses à préparer',detail:`${cashOpen.blocking} caisse(s) ne sont pas encore prêtes`,page:'cashOpening',blocking:true,priority:'P0'}));

  for(const row of commercialRows){
    if(row.status==='VERIFIED')continue;
    const mismatch=row.status==='MISMATCH';
    items.push(action({id:`commercial-${row.id}`,category:'COMMERCIAL',severity:mismatch?'CRITICAL':row.priority||'HIGH',title:commercialTitle(row),detail:commercialDetail(row),page:'commercial',blocking:!!row.blocking_opening,meta:mismatch?'Écart détecté':'À valider',mismatch,promo:row.action_type==='PROMO_START',priority:mismatch?'P0':null}));
  }

  for(const receipt of receiptRows||[]){
    if(receipt.status==='POSTED')continue;
    const overdue=!!dateOnly(receipt.eta)&&dateOnly(receipt.eta)<today();
    for(const line of receipt.lines||[]){
      if(line.quality_control_id)continue;
      items.push(action({id:`receipt-${receipt.id}-${line.id}`,category:'RECEIPT',severity:'HIGH',title:`Réception · ${line.product_name||line.description||line.item_name||line.ean||'Article à contrôler'}`,detail:`${receipt.po_number||receipt.purchase_order||receipt.id||'Réception'} · quantité / qualité à valider${overdue?' · en retard':''}`,page:'receipts',blocking:false,overdue,meta:overdue?'En retard':'Article à valider'}));
    }
  }

  for(const sig of stockSignals){
    const negative=sig.type==='NEGATIVE'||n(sig.qty)<0;
    const promo=promoEans.has(String(sig.ean||''));
    const title=negative?`Stock négatif · ${sig.product||sig.product_name||sig.productNumber||sig.ean||'Article'}`:`${promo?'Rupture promo':'Rupture'} · ${sig.product||sig.product_name||sig.productNumber||sig.ean||'Article'}`;
    const detail=`${sig.detail||`${negative?'Stock négatif':'Stock disponible 0'} · contrôle rayon/réserve requis`}${sig.warehouse?` · ${sig.warehouse}`:''}`;
    items.push(action({id:`stock-${sig.id||sig.ean||sig.productNumber||sig.product}`,category:'STOCK',severity:negative||promo?'CRITICAL':'HIGH',title,detail,page:'inventory',blocking:false,type:negative?'NEGATIVE':'OUT',promo,priority:negative||promo?'P0':'P1',meta:negative?'Anomalie stock':promo?'Article en promo':'Rupture',source:stockData.source||''}));
  }

  for(const inv of inventoryData.items||[]){
    if(inv.status==='READY_TO_POST')items.push(action({id:`inv-post-${inv.id}`,category:'INVENTORY',severity:'HIGH',title:'Inventaire à valider / poster',detail:`${inv.zone||'Périmètre'} · ${inv.metrics?.varianceLines||0} ligne(s) en écart`,page:'inventory',meta:'Validation Responsable',priority:'P2'}));
    else if(n(inv.metrics?.recounts)>0)items.push(action({id:`inv-recount-${inv.id}`,category:'INVENTORY',severity:'HIGH',title:'Recomptage stock requis',detail:`${inv.metrics.recounts} article(s) doivent être recomptés`,page:'inventory',priority:'P1'}));
  }

  const dlcCritical=n(dashboard.dlc?.expired)+n(dashboard.dlc?.critical);
  if(dlcCritical>0)items.push(action({id:'dlc-critical',category:'DLC',severity:'CRITICAL',title:'DLC / DDM prioritaires',detail:`${dlcCritical} lot(s) périmés ou critiques à traiter`,page:'dlc',blocking:true,count:dlcCritical,priority:'P0'}));
  else if(n(dashboard.dlcAtRisk)>0)items.push(action({id:'dlc-risk',category:'DLC',severity:'HIGH',title:'DLC / DDM à contrôler',detail:`${dashboard.dlcAtRisk} lot(s) à risque`,page:'dlc',count:dashboard.dlcAtRisk,priority:'P1'}));

  if(n(quality.nonConform)>0)items.push(action({id:'quality-nc',category:'QUALITY',severity:n(quality.temperatureNok)>0?'CRITICAL':'HIGH',title:'Non-conformités qualité',detail:`${quality.nonConform} contrôle(s) non conformes${quality.temperatureNok?` · ${quality.temperatureNok} température(s) NOK`:''}`,page:'quality',blocking:n(quality.temperatureNok)>0,priority:n(quality.temperatureNok)>0?'P0':'P1'}));
  if(n(loss.blocking)>0)items.push(action({id:'loss-blocking',category:'LOSS',severity:'HIGH',title:'Démarque à finaliser',detail:`${loss.blocking} sortie(s) restent à justifier / valider`,page:'losses',blocking:true,priority:'P1'}));

  if((dashboard.day?.opening_status||'NOT_STARTED')!=='OPENED'&&!items.some(x=>x.category==='OPENING'||x.blocking)){
    items.push(action({id:'opening-flow',category:'OPENING',severity:'NORMAL',title:'Continuer le parcours d’ouverture',detail:`${dashboard.opening?.done||0}/${dashboard.opening?.total||0} étapes validées`,page:'opening',priority:'P2'}));
  }

  const sorted=sortManagerActions(items);
  const critical=sorted.filter(x=>x.severity==='CRITICAL').length,blocking=sorted.filter(x=>x.blocking).length;
  const p0=sorted.filter(x=>x.priority==='P0').length,p1=sorted.filter(x=>x.priority==='P1').length;
  const alertCritical=alerts.filter(x=>x.criticality==='CRITICAL').length;
  return {dashboard,commercial,receiptRows,inventoryData,lossData,incidentData,staff,cold,cashOpen,receipts,quality,maintenance,stockSignals,stockData,items:sorted,alerts,summary:{total:sorted.length,critical,blocking,p0,p1,alerts:alerts.length,alertCritical}};
}

export function actionKind(item){return item.priority==='P0'||item.severity==='CRITICAL'?'danger':item.priority==='P1'||item.severity==='HIGH'?'warn':'neutral'}
export function categoryLabel(category){return {OPENING:'Ouverture',COMMERCIAL:'Prix / promo',STOCK:'Stock',RECEIPT:'Réception',INVENTORY:'Inventaire',DLC:'DLC / DDM',QUALITY:'Qualité',LOSS:'Démarque',OTHER:'Autre'}[category]||category}
export { priorityLabel };

export function syncManagerNav(inbox){
  ensureInboxStyles();
  const nav=document.querySelector('#managerNav');if(!nav)return;
  const byPage=p=>nav.querySelector(`[data-page="${p}"]`);
  const todayBtn=byPage('today'),validate=byPage('managerControls'),alerts=byPage('incidents'),journey=byPage('managerJourney'),more=byPage('managerMore');
  if(todayBtn)todayBtn.textContent='Aujourd’hui';
  if(validate)validate.innerHTML=`À valider${inbox?.summary?.total?`<b>${inbox.summary.total}</b>`:''}`;
  if(alerts)alerts.innerHTML=`Alertes${inbox?.summary?.alerts?`<b class="alert">${inbox.summary.alerts}</b>`:''}`;
  if(journey)journey.textContent='Journée';
  if(more)more.textContent='Plus';
  [todayBtn,validate,alerts,journey,more].filter(Boolean).forEach(x=>nav.appendChild(x));
}

export function ensureInboxStyles(){
  if(document.querySelector('#managerInboxStyles'))return;
  const s=document.createElement('style');s.id='managerInboxStyles';s.textContent=`
  #managerNav button{position:relative}#managerNav button b{position:absolute;top:5px;right:7px;min-width:18px;height:18px;border-radius:999px;background:#231b1f;color:#fff;font-size:10px;display:grid;place-items:center;padding:0 4px}#managerNav button b.alert{background:#df2356}
  .manager-inbox-head{margin:8px 0 14px}.manager-inbox-head h2{font-size:34px;line-height:1.02;margin:5px 0 8px}.manager-inbox-head p{margin:0;color:var(--muted)}
  .manager-inbox-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.manager-inbox-stat{border:1px solid var(--line);border-radius:16px;padding:12px;background:#fff}.manager-inbox-stat strong{display:block;font-size:23px}.manager-inbox-stat span{font-size:11px;color:var(--muted);font-weight:750}.manager-inbox-stat.danger{border-color:#f1a5ba;background:#fff7fa}
  .manager-action-list{display:grid;gap:10px}.manager-action-card{width:100%;text-align:left;border:1px solid var(--line);background:#fff;border-radius:18px;padding:14px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.manager-action-card.critical{border-color:#ec8fab;background:#fff8fa}.manager-action-card .chips{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:7px}.manager-action-card .chip{font-size:10px;font-weight:850;letter-spacing:.03em;text-transform:uppercase;background:#f5f0f2;border-radius:999px;padding:5px 8px}.manager-action-card .chip.danger{background:#ffe2ea;color:#a40033}.manager-action-card .chip.warn{background:#fff0d7;color:#7a4700}.manager-action-card .chip.priority-p0{background:#241b20;color:#fff}.manager-action-card .chip.priority-p1{background:#ffe7bd;color:#754400}.manager-action-card strong{display:block;font-size:16px;line-height:1.2}.manager-action-card small{display:block;color:var(--muted);font-size:12px;line-height:1.35;margin-top:4px}.manager-action-card .arrow{font-size:25px;color:#df2356}.manager-inbox-section{margin-top:18px}.manager-inbox-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-bottom:9px}.manager-inbox-section-head h3{margin:0;font-size:20px}.manager-inbox-section-head span{color:var(--muted);font-size:12px}.manager-alert-strip{border-radius:18px;background:#2b2227;color:#fff;padding:14px;margin:16px 0;display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px}.manager-alert-strip strong{font-size:17px}.manager-alert-strip small{display:block;opacity:.72;margin-top:3px}.manager-alert-strip button{border:0;background:#fff;color:#241b20;border-radius:12px;padding:10px 12px;font-weight:800}.manager-journey-compact{margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:18px;background:#fff}.manager-journey-compact .row{align-items:center}.manager-journey-compact strong{font-size:16px}.manager-group-title{font-size:12px;text-transform:uppercase;letter-spacing:.08em;font-weight:850;color:var(--muted);margin:18px 2px 8px}
  @media(max-width:520px){.manager-inbox-head h2{font-size:30px}.manager-inbox-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.manager-inbox-stat{padding:10px 8px}.manager-inbox-stat strong{font-size:21px}.manager-inbox-stat span{font-size:10px}.manager-action-card{padding:13px}}
  `;document.head.appendChild(s);
}

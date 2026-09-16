import { db,todayISO } from '../db.mjs';
import { getManagerHomeFast } from './manager-home-fast.mjs';
import { listCommercialControls } from './commercial.mjs';
import { listInventorySessions } from './inventory.mjs';
import { listIncidents } from './incidents.mjs';
import { getStockSignals } from './stock-signals.mjs';
import { getBusinessPulse } from './business-pulse.mjs';

const n=v=>Number(v||0);
const money=v=>v==null?'':`${Number(v).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2})} DH`;
const priorityRank={P0:0,P1:1,P2:2,P3:3};
const batchInflight=new Map();
const action=({id,category,severity='HIGH',title,detail,page,blocking=false,meta='',priority='P2',source=''})=>({id,category,severity,title,detail,page,blocking:!!blocking,meta,priority,source});
function commercialTitle(row){if(row.action_type==='PRICE_CHANGE')return `Changer le prix · ${row.product_name}`;if(row.action_type==='PROMO_START')return `Installer la promo · ${row.product_name}`;if(row.action_type==='PROMO_END')return `Retirer la promo · ${row.product_name}`;if(row.action_type==='NEW_ITEM')return `Valider le nouvel article · ${row.product_name}`;return `Valider l’article · ${row.product_name}`}
function commercialDetail(row){if(row.action_type==='PRICE_CHANGE')return `${money(row.old_price)} → ${money(row.expected_price)} · vérifier prix rayon et étiquette`;if(row.action_type==='PROMO_START')return `${row.promo_label||'Promotion à installer'} · prix attendu ${money(row.expected_price)}`;if(row.action_type==='PROMO_END')return `${row.promo_label||'Promotion terminée'} · retour attendu ${money(row.expected_price)}`;return `EAN ${row.ean||'—'} · contrôle rayon à valider`}
function receiptRows(storeId){const rows=db.prepare(`SELECT * FROM receipts WHERE store_id=? ORDER BY eta,po_number`).all(storeId);const lines=db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? ORDER BY product_name`);return rows.map(r=>({...r,lines:lines.all(r.id)}))}
function qualityRows(storeId,businessDate){return db.prepare(`SELECT * FROM quality_controls WHERE store_id=? AND date(created_at)=? ORDER BY created_at DESC`).all(storeId,businessDate)}
function summarizeReceipts(rows,businessDate){let activeReceipts=0,pendingLines=0,overdue=0;for(const r of rows){if(r.status==='POSTED')continue;activeReceipts++;if(String(r.eta||'').slice(0,10)<businessDate)overdue++;pendingLines+=(r.lines||[]).filter(x=>!x.quality_control_id).length}return{activeReceipts,pendingLines,overdue}}
function summarizeQuality(rows){const nonConform=rows.filter(x=>x.decision!=='ACCEPT').length,temperatureNok=rows.filter(x=>x.temperature_status==='NOK').length;return{controls:rows.length,nonConform,temperatureNok,rejected:rows.reduce((s,x)=>s+n(x.rejected_qty),0)}}
function maintenanceSummary(alerts){const rows=alerts.filter(x=>String(x.category||'').toUpperCase()==='MAINTENANCE'||String(x.source_type||'').toUpperCase().includes('MAINT'));return{openCount:rows.length,critical:rows.filter(x=>x.criticality==='CRITICAL').length,blocking:rows.filter(x=>x.blocking_level&&x.blocking_level!=='NONE').length,overdue:rows.filter(x=>x.is_overdue).length}}

async function computeManagerInboxBatch(storeId,businessDate){
 const fast=getManagerHomeFast(storeId,businessDate),dashboard=fast.dashboard,staff=fast.staff,cold=fast.cold,cashOpen=fast.cashOpen,loss=fast.loss;
 const [stockData,businessPulse]=await Promise.all([getStockSignals(storeId,{businessDate}),getBusinessPulse(storeId,businessDate)]);
 const commercialRows=listCommercialControls(storeId,businessDate),commercial={summary:dashboard.commercial||{},items:commercialRows};
 const receiptsRaw=receiptRows(storeId),receipts=summarizeReceipts(receiptsRaw,businessDate);
 const inventoryData={summary:dashboard.inventory||{},items:listInventorySessions(storeId,'ALL')};
 const alerts=listIncidents(storeId,'OPEN'),incidentData={items:alerts};
 const qRows=qualityRows(storeId,businessDate),quality=summarizeQuality(qRows),maintenance=maintenanceSummary(alerts);
 const stockSignals=stockData.items||[],items=[];
 const promoEans=new Set(commercialRows.filter(x=>x.action_type==='PROMO_START'||x.promo_label).map(x=>String(x.ean||'')).filter(Boolean));

 if(n(dashboard.handover?.blocking)>0)items.push(action({id:'handover-blocking',category:'OPENING',severity:'CRITICAL',title:'Passation bloquante',detail:`${dashboard.handover.blocking} sujet(s) doivent être traités avant l’ouverture`,page:'handover',blocking:true,priority:'P0'}));
 if(n(staff.blocking)>0)items.push(action({id:'staffing-opening',category:'OPENING',severity:'CRITICAL',title:'Équipe d’ouverture à compléter',detail:`${staff.pending||0} personne(s) restent à pointer / confirmer`,page:'staffing',blocking:true,priority:'P0'}));
 if(n(cold.blocking)>0)items.push(action({id:'cold-opening',category:'OPENING',severity:'CRITICAL',title:'Chaîne du froid à valider',detail:`${cold.blocking} zone(s) restent non validées`,page:'coldChain',blocking:true,priority:'P0'}));
 if(n(cashOpen.blocking)>0)items.push(action({id:'cash-opening',category:'OPENING',severity:'CRITICAL',title:'Caisses à préparer',detail:`${cashOpen.blocking} caisse(s) ne sont pas encore prêtes`,page:'cashOpening',blocking:true,priority:'P0'}));

 for(const row of commercialRows){if(row.status==='VERIFIED')continue;const mismatch=row.status==='MISMATCH';items.push(action({id:`commercial-${row.id}`,category:'COMMERCIAL',severity:mismatch?'CRITICAL':row.priority||'HIGH',title:commercialTitle(row),detail:commercialDetail(row),page:'commercial',blocking:!!row.blocking_opening,meta:mismatch?'Écart détecté':'À valider',priority:mismatch?'P0':row.priority==='CRITICAL'?'P0':'P1'}))}
 for(const receipt of receiptsRaw){if(receipt.status==='POSTED')continue;const overdue=String(receipt.eta||'').slice(0,10)<businessDate;for(const line of receipt.lines||[]){if(line.quality_control_id)continue;items.push(action({id:`receipt-${receipt.id}-${line.id}`,category:'RECEIPT',severity:'HIGH',title:`Réception · ${line.product_name||line.ean||'Article à contrôler'}`,detail:`${receipt.po_number||receipt.id} · quantité / qualité à valider${overdue?' · en retard':''}`,page:'receipts',meta:overdue?'En retard':'Article à valider',priority:overdue?'P0':'P1'}))}}
 for(const sig of stockSignals){const negative=sig.type==='NEGATIVE'||n(sig.qty)<0,promo=promoEans.has(String(sig.ean||''));items.push(action({id:`stock-${sig.id||sig.ean||sig.productNumber||sig.product}`,category:'STOCK',severity:negative||promo?'CRITICAL':'HIGH',title:negative?`Stock négatif · ${sig.product||sig.productNumber||sig.ean||'Article'}`:`${promo?'Rupture promo':'Rupture'} · ${sig.product||sig.productNumber||sig.ean||'Article'}`,detail:`${sig.detail||`${negative?'Stock négatif':'Stock disponible 0'} · contrôle rayon/réserve requis`}${sig.warehouse?` · ${sig.warehouse}`:''}`,page:'inventory',meta:negative?'Anomalie stock':promo?'Article en promo':'Rupture',priority:negative||promo?'P0':'P1',source:stockData.source||''}))}
 for(const inv of inventoryData.items||[]){if(inv.status==='READY_TO_POST')items.push(action({id:`inv-post-${inv.id}`,category:'INVENTORY',severity:'HIGH',title:'Inventaire à valider / poster',detail:`${inv.zone||'Périmètre'} · ${inv.metrics?.varianceLines||0} ligne(s) en écart`,page:'inventory',meta:'Validation Responsable',priority:'P2'}));else if(n(inv.metrics?.recounts)>0)items.push(action({id:`inv-recount-${inv.id}`,category:'INVENTORY',severity:'HIGH',title:'Recomptage stock requis',detail:`${inv.metrics.recounts} article(s) doivent être recomptés`,page:'inventory',priority:'P1'}))}
 const dlcCritical=n(dashboard.dlc?.expired)+n(dashboard.dlc?.critical);if(dlcCritical>0)items.push(action({id:'dlc-critical',category:'DLC',severity:'CRITICAL',title:'DLC / DDM prioritaires',detail:`${dlcCritical} lot(s) périmés ou critiques à traiter`,page:'dlc',blocking:true,priority:'P0'}));else if(n(dashboard.dlcAtRisk)>0)items.push(action({id:'dlc-risk',category:'DLC',severity:'HIGH',title:'DLC / DDM à contrôler',detail:`${dashboard.dlcAtRisk} lot(s) à risque`,page:'dlc',priority:'P1'}));
 if(n(quality.nonConform)>0)items.push(action({id:'quality-nc',category:'QUALITY',severity:n(quality.temperatureNok)>0?'CRITICAL':'HIGH',title:'Non-conformités qualité',detail:`${quality.nonConform} contrôle(s) non conformes${quality.temperatureNok?` · ${quality.temperatureNok} température(s) NOK`:''}`,page:'quality',blocking:n(quality.temperatureNok)>0,priority:n(quality.temperatureNok)>0?'P0':'P1'}));
 if(n(loss.blocking)>0)items.push(action({id:'loss-blocking',category:'LOSS',severity:'HIGH',title:'Démarque à finaliser',detail:`${loss.blocking} sortie(s) restent à justifier / valider`,page:'losses',blocking:true,priority:'P1'}));
 if((dashboard.day?.opening_status||'NOT_STARTED')!=='OPENED'&&!items.some(x=>x.category==='OPENING'||x.blocking))items.push(action({id:'opening-flow',category:'OPENING',severity:'NORMAL',title:'Continuer le parcours d’ouverture',detail:`${dashboard.opening?.done||0}/${dashboard.opening?.total||0} étapes validées`,page:'opening',priority:'P2'}));

 const sorted=items.sort((a,b)=>(priorityRank[a.priority]??9)-(priorityRank[b.priority]??9)||String(a.title).localeCompare(String(b.title))),critical=sorted.filter(x=>x.severity==='CRITICAL').length,blocking=sorted.filter(x=>x.blocking).length,p0=sorted.filter(x=>x.priority==='P0').length,p1=sorted.filter(x=>x.priority==='P1').length,alertCritical=alerts.filter(x=>x.criticality==='CRITICAL').length;
 const externalCalls=(stockData.source?.startsWith('D365/')?1:0)+(businessPulse?.integration?.mode==='LIVE'?2:0);
 return{status:'READY',source:'STOREOPS_BATCH',generatedAt:new Date().toISOString(),dashboard,commercial,receiptRows:receiptsRaw,inventoryData,lossData:{summary:loss,items:[]},incidentData,staff,cold,cashOpen,receipts,quality,maintenance,stockSignals,stockData,businessPulse,items:sorted,alerts,summary:{total:sorted.length,critical,blocking,p0,p1,alerts:alerts.length,alertCritical},diagnostics:{httpFanout:0,externalCalls,commercialReadOnly:true,pulseBundled:true,singleFlight:true}}
}

export async function getManagerInboxBatch(storeId,businessDate=todayISO()){
 const key=`${storeId}:${businessDate}`;
 if(batchInflight.has(key))return batchInflight.get(key);
 const promise=computeManagerInboxBatch(storeId,businessDate);
 batchInflight.set(key,promise);
 try{return await promise}finally{if(batchInflight.get(key)===promise)batchInflight.delete(key)}
}

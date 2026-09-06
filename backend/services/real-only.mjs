import { db } from '../db.mjs';
import { config } from '../config.mjs';

const FAKE_RECEIPTS=['rcpt_vf_10482','rcpt_tr_20411'];

function table(name){return !!db.prepare(`SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?`).get(name)}
function ids(sql,...params){try{return db.prepare(sql).all(...params).map(r=>String(r.id)).filter(Boolean)}catch{return[]}}
function placeholders(rows){return rows.map(()=>'?').join(',')}
function delWhere(tableName,where,params=[]){if(!table(tableName))return 0;try{return Number(db.prepare(`DELETE FROM ${tableName} WHERE ${where}`).run(...params).changes||0)}catch{return 0}}
function deleteIncidentsBySource(sourceType,sourceIds){
  if(!sourceIds.length||!table('incidents'))return 0;
  return delWhere('incidents',`source_type=? AND source_id IN (${placeholders(sourceIds)})`,[sourceType,...sourceIds]);
}
function deleteAuditsFor(entityIds){
  if(!entityIds.length||!table('audit_log'))return 0;
  return delWhere('audit_log',`entity_id IN (${placeholders(entityIds)})`,entityIds);
}

export function enforceRealOnlyData(){
  if(!config.realOnly)return{enabled:false,removed:0,details:{}};
  const detail={};let removed=0;

  // Historical StoreOps demo PO rows. These were seed fixtures, never One Retail POs.
  if(table('receipts')){
    const receiptIds=ids(`SELECT id FROM receipts WHERE id IN (${placeholders(FAKE_RECEIPTS)}) OR po_number IN ('PO-10482','PO-20411')`,...FAKE_RECEIPTS);
    if(receiptIds.length){
      detail.receiptLines=delWhere('receipt_lines',`receipt_id IN (${placeholders(receiptIds)})`,receiptIds);
      detail.receipts=delWhere('receipts',`id IN (${placeholders(receiptIds)})`,receiptIds);
    }
  }

  // Simulated price/promotion controls from the old showcase engine.
  if(table('commercial_controls')){
    const commercialIds=ids(`SELECT id FROM commercial_controls WHERE source_key LIKE 'PROMO-NUT750-%' OR source_key LIKE 'PRICE-LAIT1L-%' OR source_key LIKE 'PROMOEND-YAOURT4-%' OR product_number IN ('NUT750','LAIT1L','YAOURT4')`);
    if(commercialIds.length){
      detail.commercialIncidents=deleteIncidentsBySource('COMMERCIAL_CONTROL',commercialIds);
      detail.commercialAudits=deleteAuditsFor(commercialIds);
      detail.commercialControls=delWhere('commercial_controls',`id IN (${placeholders(commercialIds)})`,commercialIds);
    }
  }

  // Price checks made against the legacy fake catalog are test data, not operational evidence.
  if(table('price_checks')){
    const priceIds=ids(`SELECT id FROM price_checks WHERE product_number IN ('NUT750','LAIT1L','YAOURT4')`);
    if(priceIds.length){
      detail.priceIncidents=deleteIncidentsBySource('PRICE_CHECK',priceIds);
      detail.priceAudits=deleteAuditsFor(priceIds);
      detail.priceChecks=delWhere('price_checks',`id IN (${placeholders(priceIds)})`,priceIds);
    }
  }

  // Inventories created from fake theoretical stock are removed as complete test sessions.
  if(table('inventory_lines')&&table('inventory_sessions')){
    const sessionIds=[...new Set(db.prepare(`SELECT session_id id FROM inventory_lines WHERE product_number IN ('NUT750','LAIT1L','YAOURT4')`).all().map(r=>String(r.id)))];
    if(sessionIds.length){
      const lineIds=ids(`SELECT id FROM inventory_lines WHERE session_id IN (${placeholders(sessionIds)})`,...sessionIds);
      detail.inventoryIncidents=deleteIncidentsBySource('INVENTORY_LINE',lineIds);
      detail.inventoryAudits=deleteAuditsFor([...lineIds,...sessionIds]);
      detail.inventoryLines=delWhere('inventory_lines',`session_id IN (${placeholders(sessionIds)})`,sessionIds);
      detail.inventorySessions=delWhere('inventory_sessions',`id IN (${placeholders(sessionIds)})`,sessionIds);
    }
  }

  // Démarque records generated from the former fake catalog are also test records.
  if(table('loss_records')){
    const lossRows=db.prepare(`SELECT id,incident_id FROM loss_records WHERE product_number IN ('NUT750','LAIT1L','YAOURT4')`).all();
    const lossIds=lossRows.map(r=>String(r.id));
    const incidentIds=lossRows.map(r=>r.incident_id&&String(r.incident_id)).filter(Boolean);
    if(lossIds.length){
      detail.lossAudits=deleteAuditsFor(lossIds);
      // loss_records has a FK to incidents: remove the record first, then its generated incident.
      detail.lossRecords=delWhere('loss_records',`id IN (${placeholders(lossIds)})`,lossIds);
    }
    if(incidentIds.length)detail.lossIncidents=delWhere('incidents',`id IN (${placeholders(incidentIds)})`,incidentIds);
  }

  // Old staffing snapshots contained placeholder people (Poste caisse 1/2, Poste surface).
  if(table('staffing_days')){
    const dayIds=ids(`SELECT id FROM staffing_days WHERE source_key LIKE 'STOREOPS-STAFFING-%'`);
    if(dayIds.length){
      detail.staffingLines=delWhere('staffing_lines',`staffing_day_id IN (${placeholders(dayIds)})`,dayIds);
      detail.staffingAudits=deleteAuditsFor(dayIds);
      detail.staffingDays=delWhere('staffing_days',`id IN (${placeholders(dayIds)})`,dayIds);
    }
  }

  // Simulated closing snapshots contained invented sales/cash/card values.
  if(table('cash_closings')){
    const closingIds=ids(`SELECT id FROM cash_closings WHERE source_key LIKE 'CASH-CLOSING-%'`);
    if(closingIds.length){
      const lineIds=ids(`SELECT id FROM cash_closing_lines WHERE closing_id IN (${placeholders(closingIds)})`,...closingIds);
      detail.cashIncidents=deleteIncidentsBySource('CASH_SHIFT',lineIds);
      detail.cashAudits=deleteAuditsFor([...lineIds,...closingIds]);
      detail.cashLines=delWhere('cash_closing_lines',`closing_id IN (${placeholders(closingIds)})`,closingIds);
      detail.cashClosings=delWhere('cash_closings',`id IN (${placeholders(closingIds)})`,closingIds);
    }
  }

  // Val Fleuri's two tills/floats are confirmed pilot master data. Other stores used generic fallback tills.
  if(table('cash_openings')){
    const openingIds=ids(`SELECT id FROM cash_openings WHERE source_key LIKE 'STOREOPS-CASH-OPENING-%' AND store_id<>'val-fleuri'`);
    if(openingIds.length){
      detail.cashOpeningLines=delWhere('cash_opening_lines',`opening_id IN (${placeholders(openingIds)})`,openingIds);
      detail.cashOpeningAudits=deleteAuditsFor(openingIds);
      detail.cashOpenings=delWhere('cash_openings',`id IN (${placeholders(openingIds)})`,openingIds);
    }
  }

  for(const value of Object.values(detail))removed+=Number(value||0);
  return{enabled:true,removed,details:detail};
}

let scheduled=false;
export function scheduleRealOnlyCleanup(){
  if(!config.realOnly||scheduled)return;
  scheduled=true;
  // Run after the complete StoreOps service graph has created its tables.
  setTimeout(()=>{
    try{const result=enforceRealOnlyData();if(result.removed)console.info('StoreOps real-only cleanup',result)}
    catch(error){console.error('StoreOps real-only cleanup failed',error)}
  },0);
}

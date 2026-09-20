import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v218-business-core.db';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {createLossRecord,lossSummary}=await import('../services/loss.mjs');
const {genericLossExportTemplate}=await import('../services/loss-export.mjs');
const {createIncident,addAction,resolveIncident}=await import('../services/incidents.mjs');

const user=db.prepare("SELECT * FROM users WHERE id='u-admin'").get()||db.prepare("SELECT * FROM users WHERE role='ops_director' LIMIT 1").get();
assert(user,'test admin missing');
assert(db.prepare("SELECT id FROM stores WHERE id='val-fleuri'").get(),'Val Fleuri missing');

const valued=createLossRecord({storeId:'val-fleuri',businessDate:'2026-09-20',user,product:{ean:'6111000000001',productNumber:'HS-TEST-COST',name:'Article coût',price:99,costPrice:12.5,valuationPrice:12.5,valuationSource:'D365/ReleasedProductsV2.CostPrice'},reasonCode:'BREAKAGE',quantity:2,unit:'pièce'});
assert.equal(valued.unit_cost_value,12.5);
assert.equal(valued.total_cost_value,25);
assert.equal(valued.unit_retail_value,null);
assert.equal(valued.total_retail_value,null);
assert.equal(valued.status,'READY_TO_POST');
assert.equal(lossSummary('val-fleuri','2026-09-20').costValue,25);

const unknown=createLossRecord({storeId:'val-fleuri',businessDate:'2026-09-20',user,product:{ean:'6111000000002',productNumber:'HS-TEST-UNKNOWN',name:'Article sans coût',price:499},reasonCode:'DAMAGED',quantity:1,unit:'pièce'});
assert.equal(unknown.total_cost_value,null);
assert.equal(unknown.status,'APPROVAL_REQUIRED','unknown cost must stay conservative instead of using sale price');

const tpl=genericLossExportTemplate();
const byName=Object.fromEntries(tpl.columns.map(x=>[x.name,x]));
assert.equal(byName.Code_HS?.source,'product_number');
assert.equal(byName.Code_HS?.required,true);
assert.equal(byName['Quantité']?.required,true);
assert.equal(byName['Unité']?.required,true);
assert(!tpl.columns.some(x=>x.source==='total_retail_value'),'minimum loss canvas must not export selling valuation');

const incident=createIncident({storeId:'val-fleuri',user,title:'Incident test validation',description:'Test',category:'OTHER',criticality:'LOW',blockingLevel:'NONE',requiresEvidence:false});
assert.throws(()=>addAction({incidentId:incident.id,user,title:'   '}),e=>e.status===422&&e.code==='INCIDENT_ACTION_TITLE_REQUIRED');
assert.throws(()=>resolveIncident({incidentId:incident.id,user,resolutionNote:'  '}),e=>e.status===422&&e.code==='INCIDENT_RESOLUTION_NOTE_REQUIRED');

const lossSource=read('backend/services/loss.mjs');
assert.match(lossSource,/unit_cost_value/);
assert.match(lossSource,/total_cost_value/);
assert.doesNotMatch(lossSource,/const price=product\?\.price/);
const costSource=read('backend/services/dynamics.mjs');
assert.match(costSource,/getProductCostByProductNumber/);
assert.match(costSource,/CostPrice/);
const priceHistory=read('backend/services/price-history.mjs');
assert.doesNotMatch(priceHistory,/ensureD365PriceHistoryAutoConnected/,'price history GET must stay read-only');
const priceHistoryApi=read('backend/services/price-history-api.mjs');
assert.match(priceHistoryApi,/price-history\/auto-connect/);
assert.match(priceHistoryApi,/ensureD365PriceHistoryAutoConnected/);
const salesAuto=read('backend/services/d365-sales-autoconnect.mjs');
assert.match(salesAuto,/RetailTransactionSalesTransBIEntities/);
assert.match(salesAuto,/netAmountInclTax/);
const home=read('frontend/js/pages/manager-home.js');
assert.match(home,/const pulsePromise=/);
const more=read('frontend/js/pages/manager-hubs.js');
assert.match(more,/Inventaire express/);
const scanner=read('frontend/js/pages/manager-scan.js');
assert.match(scanner,/price-history\/auto-connect/);
assert.match(scanner,/method:'POST'/);
const incidentsUi=read('frontend/js/pages/incidents.js');
assert.match(incidentsUi,/id="addIncidentAction" disabled/);
assert.match(incidentsUi,/id="resolveIncident" disabled/);

console.log('V2.18 business core contract OK');

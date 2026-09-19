import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-v215-truthful-integrations-${process.pid}.db`;
process.env.STOREOPS_REAL_ONLY='true';
process.env.D365_MODE='live';
process.env.D365_RECEIVING_READ_MODE='live';
process.env.D365_SALES_READ_MODE='simulated';

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {receivingIntegrationConfig}=await import('../services/dynamics-receiving.mjs');
const {inferD365PriceHistoryMappingRows}=await import('../services/d365-mapping-diagnostics.mjs');
const {integrationSnapshot}=await import('../services/integration-registry.mjs');

db.prepare('DELETE FROM d365_receiving_sync_state').run();

const pending=receivingIntegrationConfig('val-fleuri').stores['val-fleuri'];
assert.equal(pending.warehouseId,'FRP0001');
assert.equal(pending.state,'LIVE_PENDING');
assert.equal(pending.reason,'NEVER_SYNCED');

db.prepare(`INSERT INTO d365_receiving_sync_state(store_id,warehouse_id,last_attempt_at,last_success_at,last_po_count,last_authoritative,updated_at)
VALUES('val-fleuri','FRP0001',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,1,CURRENT_TIMESTAMP)`).run();
const zeroPo=receivingIntegrationConfig('val-fleuri').stores['val-fleuri'];
assert.equal(zeroPo.state,'LIVE','an authoritative successful sync with zero PO is a valid LIVE connection');
assert.equal(zeroPo.lastPoCount,0);

db.prepare(`UPDATE d365_receiving_sync_state SET last_error_at=CURRENT_TIMESTAMP,last_error_code='D365_RECEIVING_SYNC_TIMEOUT',last_error_message='Timeout contrôlé',last_authoritative=0 WHERE store_id='val-fleuri'`).run();
const degraded=receivingIntegrationConfig('val-fleuri').stores['val-fleuri'];
assert.equal(degraded.state,'DEGRADED');
assert.match(degraded.lastErrorMessage,/Timeout/);

db.prepare(`UPDATE d365_receiving_sync_state SET last_error_at=NULL,last_error_code=NULL,last_error_message=NULL,last_success_at=datetime('now','-2 days'),last_authoritative=1 WHERE store_id='val-fleuri'`).run();
const stale=receivingIntegrationConfig('val-fleuri').stores['val-fleuri'];
assert.equal(stale.state,'DEGRADED');
assert.equal(stale.reason,'STALE_SYNC');

const inferred=inferD365PriceHistoryMappingRows([{
 ItemNumber:'HS-003584',
 Price:17.9,
 PriceApplicableFromDate:'2026-09-01T00:00:00Z',
 PriceApplicableToDate:'2026-09-30T00:00:00Z',
 PriceCurrencyCode:'MAD',
 PriceCustomerGroupCode:'Franprix',
 CustomerAccountNumber:'',
 PriceWarehouseId:'FRP0001',
 PriceSiteId:'HS',
 SalesPriceQuantity:1,
 QuantityUnitySymbol:'PC',
 RecordId:'123'
}]);
assert.deepEqual(inferred.missing,[]);
assert.equal(inferred.fields.item,'ItemNumber');
assert.equal(inferred.fields.price,'Price');
assert.equal(inferred.fields.validFrom,'PriceApplicableFromDate');
assert.equal(inferred.fields.priceGroup,'PriceCustomerGroupCode');
assert.equal(inferred.sampleProductNumber,'HS-003584');

const integration=integrationSnapshot();
const d365=integration.connectors.find(x=>x.key==='d365-one-retail');
assert(d365,'D365 connector missing');
assert.notEqual(d365.capabilities['supply.purchase-order.read'].state,'LIVE','PO capability must not be globally LIVE while store health is not fully confirmed');

const receipts=readFileSync(new URL('../../frontend/js/pages/receipts.js',import.meta.url),'utf8');
const managerHome=readFileSync(new URL('../../frontend/js/pages/manager-home.js',import.meta.url),'utf8');
const integrationApi=readFileSync(new URL('../services/integration-registry-api.mjs',import.meta.url),'utf8');
const diagnostics=readFileSync(new URL('../services/d365-mapping-diagnostics.mjs',import.meta.url),'utf8');
const priceUi=readFileSync(new URL('../../frontend/js/admin-price-history-mapping.js',import.meta.url),'utf8');

assert.doesNotMatch(receipts,/Connecteur PO Dynamics actif/,'UI must not claim PO connector active from a flag alone');
assert.match(receipts,/PO Dynamics synchronisés/);
assert.match(receipts,/Connexion PO Dynamics à valider/);
assert.match(receipts,/PO Dynamics à vérifier/);
assert.match(managerHome,/Ventes Dynamics à finaliser/);
assert.match(managerHome,/Connexion ventes Dynamics à vérifier/);
assert.match(integrationApi,/d365-price-history-mapping\/auto-connect/);
assert.match(integrationApi,/smokeD365PriceHistoryMapping/);
assert.match(integrationApi,/activateD365PriceHistoryMapping/);
assert.match(diagnostics,/discoverD365PriceHistoryMapping/);
assert.match(priceUi,/Connecter automatiquement les Trade Agreements/);

console.log('V2.15 truthful integrations contract passed');

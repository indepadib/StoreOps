import assert from 'node:assert/strict';
import '../services/pilot-profile.mjs';
import { db } from '../db.mjs';
import { RETAIL_CAPABILITIES } from '../services/connector-contract.mjs';
import { integrationSnapshot,createCustomConnector,listCustomConnectors } from '../services/integration-registry.mjs';

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
assert(admin,'Admin StoreOps must exist');

let snap=integrationSnapshot();
assert.equal(snap.summary.capabilities,RETAIL_CAPABILITIES.length);
assert(snap.connectors.some(x=>x.key==='storeops-native'));
assert(snap.connectors.some(x=>x.key==='identity-primary'));
assert(snap.connectors.some(x=>x.key==='d365-one-retail'));
assert.equal(snap.connectors.find(x=>x.key==='d365-one-retail').capabilities['inventory.adjustment.write'].state,'UNMAPPED','ERP writes must never be declared LIVE from configuration alone');

const custom=createCustomConnector({actor:admin,name:'SAP Retail Test',family:'SAP',plannedCapabilities:['catalog.product.read','inventory.stock.read','supply.transfer.write'],note:'Adapter à connecter'});
assert.equal(custom.family,'SAP');
assert.deepEqual(custom.plannedCapabilities.sort(),['catalog.product.read','inventory.stock.read','supply.transfer.write'].sort());
assert(listCustomConnectors().some(x=>x.key===custom.key));

snap=integrationSnapshot();
const runtime=snap.connectors.find(x=>x.key===custom.key);
assert(runtime,'Custom connector must appear in readiness snapshot');
assert.equal(runtime.capabilities['catalog.product.read'].state,'LIVE_PENDING');
assert.equal(runtime.capabilities['inventory.stock.read'].state,'LIVE_PENDING');
assert.equal(runtime.capabilities['supply.transfer.write'].state,'LIVE_PENDING');
assert.notEqual(runtime.capabilities['supply.transfer.write'].state,'LIVE','An admin-declared connector must not become LIVE without a real adapter');

console.log('V1.80 multi-connector capability registry contract OK');

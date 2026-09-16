import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v190-real-only.db';
process.env.STOREOPS_REAL_ONLY='true';
process.env.D365_MODE='simulated';
process.env.D365_PRODUCT_READ_MODE='live';
process.env.D365_STOCK_READ_MODE='live';
process.env.D365_PRICE_READ_MODE='live';
process.env.D365_PROMOTION_READ_MODE='live';
process.env.D365_RECEIVING_READ_MODE='simulated';
process.env.D365_ASSORTMENT_READ_MODE='simulated';
process.env.D365_TAXONOMY_READ_MODE='simulated';
process.env.D365_SALES_READ_MODE='simulated';
process.env.AUTH_MODE='entra';
process.env.ENTRA_TENANT_ID='48231bf2-6022-46e4-955c-bb33872c24b2';
process.env.ENTRA_CLIENT_ID='0ee60e21-1b07-4e7e-b1b6-afbd3efafbda';

const {config}=await import('../config.mjs');
const {integrationSnapshot}=await import('../services/integration-registry.mjs');
const {receivingIntegrationConfig,listExpectedPurchaseOrders}=await import('../services/dynamics-receiving.mjs');
const {getStaffingSnapshot}=await import('../services/dynamics-staffing.mjs');
const {getCashOpeningSnapshot}=await import('../services/dynamics-cash-opening.mjs');

assert.equal(config.realOnly,true);
assert.equal(config.dynamics.mode,'live','real-only must prevent accidental global simulated mode');

const integrations=integrationSnapshot();
assert.equal(integrations.realOnly,true);
for(const connector of integrations.connectors){
 for(const capability of Object.values(connector.capabilities||{}))assert.notEqual(capability.state,'SIMULATED','production readiness must never expose SIMULATED');
}
assert.equal(integrations.connectors.find(x=>x.key==='identity-primary')?.capabilities?.['identity.sso']?.state,'LIVE');

assert.equal(receivingIntegrationConfig().mode,'UNAVAILABLE');
const receiving=await listExpectedPurchaseOrders('val-fleuri');
assert.equal(receiving.mode,'UNAVAILABLE');
assert.equal(receiving.items.length,0);

await assert.rejects(()=>getStaffingSnapshot('trefle','2026-09-16'),e=>e?.code==='STAFFING_REAL_SOURCE_NOT_CONFIGURED');
await assert.rejects(()=>getCashOpeningSnapshot('trefle','2026-09-16'),e=>e?.code==='CASH_OPENING_REAL_MASTER_NOT_CONFIGURED');
const vfCash=await getCashOpeningSnapshot('val-fleuri','2026-09-16');
assert.equal(vfCash.source,'STOREOPS_REAL_MASTER');
assert.equal(vfCash.lines.length,2);
assert(vfCash.lines.every(x=>x.expectedFloat===1000));

console.log('V1.90 real-only production contract: OK');

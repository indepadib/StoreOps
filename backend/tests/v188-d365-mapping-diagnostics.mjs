import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v188-d365-mapping.db';
process.env.D365_MODE='simulated';
process.env.AUTH_MODE='demo';

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {d365MappingDiagnosticReadiness,diagnoseD365Mappings}=await import('../services/d365-mapping-diagnostics.mjs');
const {handleIntegrationRegistryApi}=await import('../services/integration-registry-api.mjs');

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
assert(admin&&manager,'pilot users required');

const ready=d365MappingDiagnosticReadiness('val-fleuri');
assert.equal(ready.mode,'simulated');
assert.equal(ready.retailChannelId,'10001');
assert(ready.candidates.sales.includes('RetailTransactionSalesTransBIEntities'));
assert(ready.candidates.priceHistory.includes('RetailTransactionSalesTransBIEntities'));

const diagnostic=await diagnoseD365Mappings('val-fleuri');
assert.equal(diagnostic.status,'DISABLED');
assert.deepEqual(diagnostic.domains.sales,[]);
assert.deepEqual(diagnostic.domains.price,[]);
assert.match(diagnostic.message,/aucun probe externe/i);

let r=await handleIntegrationRegistryApi({req:{method:'GET'},url:new URL('http://local/api/admin/integrations/d365-mapping/readiness?storeId=val-fleuri'),user:admin});
assert.equal(r.status,200);
assert.equal(r.data.retailChannelId,'10001');

r=await handleIntegrationRegistryApi({req:{method:'POST',[Symbol.asyncIterator]:async function*(){yield Buffer.from(JSON.stringify({storeId:'val-fleuri'}))}},url:new URL('http://local/api/admin/integrations/d365-mapping/diagnose'),user:admin});
assert.equal(r.status,200);
assert.equal(r.data.status,'DISABLED');

await assert.rejects(async()=>handleIntegrationRegistryApi({req:{method:'GET'},url:new URL('http://local/api/admin/integrations/d365-mapping/readiness?storeId=val-fleuri'),user:manager}),e=>e.status===403);

console.log('V1.88 non-destructive D365 mapping diagnostics contract: OK');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v188-runtime-routing.db';
process.env.AUTH_MODE='demo';
process.env.D365_MODE='simulated';

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {handleBusinessPulseApi}=await import('../services/business-pulse-api.mjs');

const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
assert(manager,'Val Fleuri manager fixture missing');

const boot=await handleBusinessPulseApi({
 req:{method:'GET'},
 url:new URL('http://storeops.local/api/bootstrap'),
 user:manager
});
assert.equal(boot?.status,200,'active API router must serve /api/bootstrap');
assert.equal(boot.data.user.id,'u-vf');
assert.equal(boot.data.stores.length,1);
assert.equal(boot.data.stores[0].id,'val-fleuri');
assert.equal(boot.data.diagnostics.httpFanout,0);

const unrelated=await handleBusinessPulseApi({
 req:{method:'GET'},
 url:new URL('http://storeops.local/api/not-this-handler'),
 user:manager
});
assert.equal(unrelated,null,'router must not swallow unrelated endpoints');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const router=readFileSync(path.join(root,'backend/services/business-pulse-api.mjs'),'utf8');
const auth=readFileSync(path.join(root,'frontend/js/auth-entry.js'),'utf8');
const apiClient=readFileSync(path.join(root,'frontend/js/api.js'),'utf8');
const managerHome=readFileSync(path.join(root,'frontend/js/pages/manager-home.js'),'utf8');

assert.match(router,/handleRuntimeBootstrapApi/,'active router must delegate grouped bootstrap');
assert.match(router,/manager-home-fast/,'manager home fast path must stay routed');
assert.match(router,/manager-inbox-batch/,'manager inbox bundle must stay routed');
assert.match(auth,/apiCall\('\/api\/bootstrap'\)/,'auth bootstrap must use the grouped endpoint');
assert.match(apiClient,/STOREOPS_BOOTSTRAP/,'API client must reuse bootstrap payload');
assert.match(managerHome,/manager-home-fast/,'Today must request the fast local shell first');
assert.match(managerHome,/manager-inbox-batch/,'Today must enrich from one manager bundle rather than legacy fan-out');

console.log('V1.88 grouped bootstrap routing + manager fast path contract OK');

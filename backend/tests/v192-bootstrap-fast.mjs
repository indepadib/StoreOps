import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.STOREOPS_DB='/tmp/storeops-v192-bootstrap-fast.db';
process.env.AUTH_MODE='demo';

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {runtimeBootstrap}=await import('../services/runtime-bootstrap-api.mjs');

const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
assert(manager,'Val Fleuri manager fixture missing');
const managerBoot=runtimeBootstrap(manager);
assert.equal(managerBoot.user.id,'u-vf');
assert.equal(managerBoot.stores.length,1);
assert.equal(managerBoot.stores[0].id,'val-fleuri');
assert.equal(managerBoot.developmentAccess,false);
assert.equal(managerBoot.diagnostics.httpFanout,0);

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
assert(admin,'Admin fixture missing');
const adminBoot=runtimeBootstrap(admin);
assert(adminBoot.stores.length>=1);
assert.equal(adminBoot.developmentAccess,true);
assert(adminBoot.availableDemoUsers.length>=2);

const devId='u-dev-v192';
if(!db.prepare(`SELECT id FROM users WHERE id=?`).get(devId))db.prepare(`INSERT INTO users(id,name,role,active,permissions_profile) VALUES(?,?,?,?,?)`).run(devId,'Développement Test','employee',1,'development');
const dev=db.prepare(`SELECT * FROM users WHERE id=?`).get(devId),devBoot=runtimeBootstrap(dev);
assert.equal(devBoot.developmentAccess,true);
assert.equal(devBoot.stores.length,0,'Development-only users must not need a fake store scope');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const auth=readFileSync(path.join(root,'frontend/js/auth-entry.js'),'utf8');
const api=readFileSync(path.join(root,'frontend/js/api.js'),'utf8');
const boot=readFileSync(path.join(root,'frontend/js/boot-classic.js'),'utf8');
const hubs=readFileSync(path.join(root,'frontend/js/pages/manager-hubs.js'),'utf8');
assert.match(auth,/apiCall\('\/api\/bootstrap'\)/,'auth entry must preload one bootstrap payload');
assert.match(auth,/developmentOnly\|\|storeSelect\?\.options\?\.length>0/,'development-only startup must not wait for a store');
assert.match(api,/function bootResponse/,'API client must reuse bootstrap payload');
assert.match(api,/STOREOPS_BOOT_HEALTH_CONSUMED/,'app health call must reuse authentication healthcheck once');
assert.match(boot,/storeops-legacy-runtime-cleaned-'\+BUILD/,'legacy browser cleanup must be scoped to the current build');
assert.doesNotMatch(boot,/storeops-legacy-runtime-cleaned-v1/,'a fixed cleanup key must never return because it can strand stale bundles');
assert.match(hubs,/manager-inbox-batch/,'manager hubs must use the bundled manager inbox fast path');
assert.match(hubs,/inboxFlight/,'manager hubs must deduplicate simultaneous inbox requests');
assert.match(hubs,/const d=inbox\.dashboard\|\|\{\}/,'manager journey must reuse the dashboard already bundled in the inbox payload');
assert.doesNotMatch(hubs,/Promise\.all\(\[api\(`\/api\/stores\/\$\{app\.storeId\}\/dashboard`\),loadManagerInbox\(\)\]\)/,'manager journey must not request dashboard separately from the manager bundle');
console.log('V1.92 single-call bootstrap + manager bundle fast-start contract OK');

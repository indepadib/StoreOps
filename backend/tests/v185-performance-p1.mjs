import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v185-performance.db';
process.env.AUTH_MODE='demo';
process.env.D365_MODE='simulated';

await import('../services/pilot-profile.mjs');
const {managerTodaySnapshot}=await import('../services/manager-today.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

const snapshot=managerTodaySnapshot('val-fleuri','2026-09-17');
assert(snapshot.dashboard?.day,'manager today must return the canonical store day');
assert(snapshot.commercial?.summary,'manager today must return commercial local state');
assert(Array.isArray(snapshot.receiptRows),'manager today must return receipts');
assert(Array.isArray(snapshot.inventoryData?.items),'manager today must return inventory sessions');
assert(snapshot.lossData?.summary,'manager today must return loss summary');
assert(Array.isArray(snapshot.incidentData?.items),'manager today must return incidents');
assert(snapshot.staffData?.summary,'manager today must return staffing summary');
assert(snapshot.coldData?.summary,'manager today must return cold chain summary');
assert(snapshot.cashOpenData?.summary,'manager today must return cash opening summary');
assert(Array.isArray(snapshot.qualityRows),'manager today must return quality rows');
assert.equal(snapshot.meta?.mode,'LOCAL_FAST');
assert.equal(snapshot.meta?.requestCountCollapsed,10);
assert.equal(snapshot.stockData?.deferred,true,'expensive stock must not block the local first paint');

const service=read('backend/services/manager-today.mjs');
const localBlock=service.match(/export function managerTodaySnapshot[\s\S]*?async function refreshCommercial/)?.[0]||'';
assert(localBlock,'local manager today function missing');
assert.doesNotMatch(localBlock,/getCommercialChanges\(/,'local first paint must not hit Dynamics commercial');
assert.doesNotMatch(localBlock,/getStockSignals\(/,'local first paint must not scan Dynamics stock');
assert.match(service,/Promise\.allSettled\(\[commercialPromise,stockPromise,pulsePromise\]\)/,'external signals must run concurrently in one backend invocation');

const inbox=read('frontend/js/manager-action-inbox.js');
assert.match(inbox,/\/manager-today`\)/,'manager inbox must use the aggregated local endpoint');
assert.match(inbox,/\/manager-today\/signals`\)/,'manager inbox must use the aggregated external enrichment endpoint');
assert.match(inbox,/LEGACY_FALLBACK/,'legacy fan-out must remain only as a compatibility fallback');

const home=read('frontend/js/pages/manager-home.js');
assert.match(home,/paintManagerHome\(inbox,undefined\)/,'manager home must paint before external signals finish');
assert.match(home,/refreshManagerInboxSignals\(inbox\)\.then/,'manager home must enrich progressively after first paint');
assert.doesNotMatch(home,/Promise\.all\(\[loadManagerInbox\(\),api\(/,'Business Pulse must not block first paint');

const api=read('frontend/js/api.js');
assert.match(api,/window\.STOREOPS_BOOT_HEALTH/,'app bootstrap must reuse the initial backend health result');
const boot=read('frontend/js/boot-classic.js');
assert.match(boot,/storeops-legacy-cleanup-1850/,'legacy browser cleanup must be version-gated');
const pwa=read('frontend/js/pwa.js');
assert.doesNotMatch(pwa,/getRegistrations\(\)/,'PWA helper must not unregister service workers again on every load');

console.log('V1.85 performance P1 manager aggregation contract: OK');

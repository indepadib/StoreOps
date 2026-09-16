import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v195-performance.db';
process.env.D365_MODE='simulated';
process.env.D365_STOCK_READ_MODE='simulated';
process.env.D365_SALES_READ_MODE='disabled';
process.env.STOREOPS_MANAGER_HOME_CACHE_MS='2500';
process.env.STOREOPS_MANAGER_INBOX_CACHE_MS='3500';

await import('../services/pilot-profile.mjs');
const {getManagerHomeFast}=await import('../services/manager-home-fast.mjs');
const {getManagerInboxBatch}=await import('../services/manager-inbox-batch.mjs');

const day='2026-09-16';
const home1=getManagerHomeFast('val-fleuri',day,{force:true});
assert.equal(home1.status,'READY');
assert.equal(home1.diagnostics.cache,'MISS');
const home2=getManagerHomeFast('val-fleuri',day);
assert.equal(home2.diagnostics.cache,'HIT','guided Today local snapshot should be reused briefly');
assert.equal(home2.diagnostics.externalCalls,0);

const batch1=await getManagerInboxBatch('val-fleuri',day,{force:true});
assert.equal(batch1.status,'READY');
assert.equal(batch1.diagnostics.cache,'MISS');
assert.equal(batch1.diagnostics.pulseBundled,true,'V1.90.2 bundled Pulse contract must be preserved');
assert(batch1.businessPulse,'manager batch must still carry Business Pulse');
const batch2=await getManagerInboxBatch('val-fleuri',day);
assert.equal(batch2.diagnostics.cache,'HIT','repeat enrichment should reuse the short batch snapshot');
assert(batch2.businessPulse,'cached enrichment must preserve Business Pulse');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const fastSource=read('backend/services/manager-home-fast.mjs');
const batchSource=read('backend/services/manager-inbox-batch.mjs');
const apiSource=read('backend/services/manager-fast-api.mjs');
const todaySource=read('frontend/js/pages/manager-home.js');

assert.match(fastSource,/HOME_CACHE_MS/);
assert.match(fastSource,/cache:'HIT'/);
assert.match(batchSource,/BATCH_CACHE_MS/);
assert.match(batchSource,/getBusinessPulse/,'Business Pulse must remain bundled after V1.94');
assert.match(batchSource,/\[stockData,businessPulse\]=await Promise\.all/,'stock and Pulse should remain parallel');
assert.match(batchSource,/pulseBundled:true/);
assert.match(apiSource,/searchParams\.get\('force'\)==='1'/,'explicit refresh must bypass short manager caches');
assert.match(todaySource,/manager-home-fast/,'V1.94 fast first paint must remain');
assert.match(todaySource,/manager-inbox-batch/,'V1.94 enrichment batch must remain');
assert.match(todaySource,/chooseManagerNextAction/,'V1.94 one-action concierge must remain intact');
assert.match(todaySource,/today-command/,'V1.94 guided Today markup must remain intact');

console.log('V1.95 performance consolidation contract: OK');

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
assert.equal(home2.diagnostics.cache,'HIT','manager Today local snapshot should be reused briefly');
assert.equal(home2.diagnostics.externalCalls,0);

const batch1=await getManagerInboxBatch('val-fleuri',day,{force:true});
assert.equal(batch1.status,'READY');
assert.equal(batch1.diagnostics.cache,'MISS');
assert.equal(batch1.diagnostics.pulseBundled,true,'bundled Pulse contract must be preserved');
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
assert.match(batchSource,/getBusinessPulse/,'Business Pulse must remain bundled');
assert.match(batchSource,/peekStockSignals/,'LIVE manager batch should consume stock cache only');
assert.doesNotMatch(batchSource,/\[stockData,businessPulse\]=await Promise\.all/,'heavy stock refresh must be decoupled from bundled Pulse');
assert.match(batchSource,/pulseBundled:true/);
assert.match(apiSource,/searchParams\.get\('force'\)==='1'/,'explicit refresh must bypass short manager caches');
assert.match(todaySource,/manager-home-fast/,'fast first paint must remain');
assert.match(todaySource,/manager-inbox-batch/,'enrichment batch must remain');
assert.match(todaySource,/business-pulse\/stockouts/,'stockouts must be loaded outside the critical Business Pulse path');
assert.match(todaySource,/chooseManagerNextAction/,'local fast snapshot must still provide a useful first action while enrichment loads');
assert.match(todaySource,/BUSINESS PULSE/,'approved Business Pulse hierarchy must remain intact');
assert.match(todaySource,/items\.slice\(0,3\)/,'approved three-priority cap must remain intact');
assert.match(todaySource,/today-priority-card/,'approved priority markup must remain intact');

console.log('V1.95 performance consolidation + approved Today preview contract: OK');

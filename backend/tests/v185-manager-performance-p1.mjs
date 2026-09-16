import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v185-manager-performance.db';
process.env.D365_MODE='simulated';
process.env.D365_STOCK_READ_MODE='simulated';
process.env.STOREOPS_MANAGER_HOME_CACHE_MS='2500';
process.env.STOREOPS_MANAGER_INBOX_CACHE_MS='3500';

await import('../services/pilot-profile.mjs');
const { getManagerHomeFast }=await import('../services/manager-home-fast.mjs');
const { getManagerInboxBatch }=await import('../services/manager-inbox-batch.mjs');

const day='2026-09-16';
const fast1=getManagerHomeFast('val-fleuri',day,{force:true});
assert.equal(fast1.status,'READY');
assert.equal(fast1.diagnostics.cache,'MISS');
const fast2=getManagerHomeFast('val-fleuri',day);
assert.equal(fast2.diagnostics.cache,'HIT','second manager-home read should reuse the short local snapshot');
assert.equal(fast2.diagnostics.externalCalls,0);

const inbox1=await getManagerInboxBatch('val-fleuri',day,{force:true});
assert.equal(inbox1.status,'READY');
assert.equal(inbox1.businessPulse,null,'business pulse must not block the action inbox');
assert.equal(inbox1.diagnostics.pulseDeferred,true);
assert.equal(inbox1.diagnostics.pulseBundled,false);
assert.equal(inbox1.diagnostics.cache,'MISS');
const inbox2=await getManagerInboxBatch('val-fleuri',day);
assert.equal(inbox2.diagnostics.cache,'HIT','repeat manager inbox should use the short batch cache');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const batch=read('backend/services/manager-inbox-batch.mjs');
const fastApi=read('backend/services/manager-fast-api.mjs');
const managerHome=read('frontend/js/pages/manager-home.js');
const boot=read('frontend/js/boot-classic.js');
const pwa=read('frontend/js/pwa.js');
const auth=read('frontend/js/auth-entry.js');
const enhancements=read('frontend/js/enhancements-entry.js');

assert.doesNotMatch(batch,/from '\.\/business-pulse\.mjs'/,'business pulse import must stay off the blocking inbox path');
assert.match(batch,/pulseDeferred:true/);
assert.match(batch,/BATCH_CACHE_MS/);
assert.match(fastApi,/searchParams\.get\('force'\)==='1'/,'manager fast endpoints must support explicit forced refresh');
assert.match(managerHome,/manager-inbox-batch/,'Today must call the single operational batch endpoint');
assert.match(managerHome,/const pulsePromise=api\(`\/api\/stores\/\$\{storeId\}\/business-pulse`/,'Business Pulse must start independently');
assert.match(managerHome,/renderHome\(inbox,null,\{pulseLoading:true\}\)/,'operations must render before Business Pulse resolves');
assert.match(managerHome,/renderSkeleton\(\)/,'Today must paint an immediate loading shell');
assert.match(boot,/storeops-legacy-clean-/,'legacy browser cleanup must be version-scoped');
assert.match(boot,/localStorage\.getItem\(CLEAN_KEY\)/,'legacy cleanup must not repeat every load');
assert.doesNotMatch(pwa,/getRegistrations\(/,'PWA module must not repeat service worker unregister work');
assert.match(auth,/const BUILD='1850'/);
assert.match(enhancements,/\?v=1850/);

console.log('V1.85 manager performance P1 contract: OK');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.STOREOPS_DB='/tmp/storeops-v193-singleflight.db';
process.env.D365_MODE='simulated';
process.env.D365_STOCK_READ_MODE='simulated';
process.env.D365_SALES_READ_MODE='disabled';
process.env.STOREOPS_MANAGER_INBOX_CACHE_MS='3500';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const managerSrc=read('backend/services/manager-inbox-batch.mjs');
const pulseSrc=read('backend/services/business-pulse.mjs');

assert.match(managerSrc,/const batchInflight=new Map\(\)/,'manager inbox must keep an in-flight registry');
assert.match(managerSrc,/if\(!force&&batchInflight\.has\(key\)\)return batchInflight\.get\(key\)/,'normal concurrent manager bundle reads must share one promise');
assert.match(managerSrc,/finally\{if\(batchInflight\.get\(key\)===promise\)batchInflight\.delete\(key\)\}/,'manager single-flight entry must be cleared after completion');
assert.match(managerSrc,/const batchCache=new Map\(\)/,'manager bundle may keep a bounded short cache');
assert.match(managerSrc,/BATCH_CACHE_MS/,'manager bundle cache TTL must be explicit and bounded');
assert.match(managerSrc,/if\(!force&&cached&&now<cached\.expiresAt\)/,'normal reads may reuse the bounded manager snapshot');
assert.match(managerSrc,/singleFlight:true/,'manager bundle diagnostics must expose single-flight capability');

assert.match(pulseSrc,/const inflight=new Map\(\)/,'Business Pulse must keep an in-flight registry');
assert.match(pulseSrc,/if\(!force&&inflight\.has\(key\)\)return inflight\.get\(key\)/,'Business Pulse concurrent reads must share one promise');
assert.match(pulseSrc,/if\(!force\)inflight\.set\(key,promise\)/,'normal Business Pulse reads must register their promise');
assert.match(pulseSrc,/if\(!force&&inflight\.get\(key\)===promise\)inflight\.delete\(key\)/,'Business Pulse single-flight entry must be cleared');
assert.match(pulseSrc,/inflight\.clear\(\)/,'full pulse cache reset must clear in-flight work');

const {getManagerInboxBatch}=await import('../services/manager-inbox-batch.mjs');
const businessDate='2099-03-11';
const [a,b]=await Promise.all([
  getManagerInboxBatch('val-fleuri',businessDate,{force:true}),
  getManagerInboxBatch('val-fleuri',businessDate)
]);
assert.equal(a.status,'READY');
assert.equal(b.status,'READY');
assert.equal(a.diagnostics.singleFlight,true);
assert.equal(b.diagnostics.singleFlight,true);

const c=await getManagerInboxBatch('val-fleuri',businessDate);
assert.equal(c.status,'READY');
assert.equal(c.diagnostics.cache,'HIT','repeat manager read should use only the bounded short cache');

const forced=await getManagerInboxBatch('val-fleuri',businessDate,{force:true});
assert.equal(forced.status,'READY');
assert.equal(forced.diagnostics.cache,'MISS','forced manager refresh must bypass the bounded cache');
assert.equal(forced.diagnostics.singleFlight,true);

console.log('V1.93/V1.95 server single-flight + bounded cache contract: OK');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.STOREOPS_DB='/tmp/storeops-v193-singleflight.db';
process.env.D365_MODE='simulated';
process.env.D365_STOCK_READ_MODE='simulated';
process.env.D365_SALES_READ_MODE='disabled';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const managerSrc=read('backend/services/manager-inbox-batch.mjs');
const pulseSrc=read('backend/services/business-pulse.mjs');

assert.match(managerSrc,/const batchInflight=new Map\(\)/,'manager inbox must keep an in-flight registry');
assert.match(managerSrc,/if\(batchInflight\.has\(key\)\)return batchInflight\.get\(key\)/,'concurrent manager bundle reads must share one promise');
assert.match(managerSrc,/finally\{if\(batchInflight\.get\(key\)===promise\)batchInflight\.delete\(key\)\}/,'manager single-flight entry must be cleared after completion');
assert.doesNotMatch(managerSrc,/batchCache|BATCH_CACHE|batchTtl/i,'manager bundle must not add a TTL cache that could hide fresh writes');
assert.match(managerSrc,/singleFlight:true/,'manager bundle diagnostics must expose single-flight capability');

assert.match(pulseSrc,/const inflight=new Map\(\)/,'Business Pulse must keep an in-flight registry');
assert.match(pulseSrc,/if\(!force&&inflight\.has\(key\)\)return inflight\.get\(key\)/,'Business Pulse concurrent reads must share one promise');
assert.match(pulseSrc,/if\(!force\)inflight\.set\(key,promise\)/,'normal Business Pulse reads must register their promise');
assert.match(pulseSrc,/if\(!force&&inflight\.get\(key\)===promise\)inflight\.delete\(key\)/,'Business Pulse single-flight entry must be cleared');
assert.match(pulseSrc,/inflight\.clear\(\)/,'full pulse cache reset must clear in-flight work');

const {getManagerInboxBatch}=await import('../services/manager-inbox-batch.mjs');
const businessDate='2099-03-11';
const [a,b]=await Promise.all([
  getManagerInboxBatch('val-fleuri',businessDate),
  getManagerInboxBatch('val-fleuri',businessDate)
]);
assert.equal(a.status,'READY');
assert.equal(b.status,'READY');
assert.equal(a.generatedAt,b.generatedAt,'simultaneous manager requests should share the exact same computation');
assert.equal(a.diagnostics.singleFlight,true);
assert.equal(b.diagnostics.singleFlight,true);

const c=await getManagerInboxBatch('val-fleuri',businessDate);
assert.equal(c.status,'READY');
assert.notStrictEqual(c,a,'after completion a fresh request must not be held by a persistent manager cache');

console.log('V1.93 server single-flight contract: OK');

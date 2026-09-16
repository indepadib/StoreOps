import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const batchSource=read('backend/services/manager-inbox-batch.mjs');
const homeSource=read('frontend/js/pages/manager-home.js');
const authSource=read('frontend/js/auth-entry.js');

assert.match(batchSource,/getBusinessPulse/,'manager batch must import Business Pulse');
assert.match(batchSource,/\[stockData,businessPulse\]=await Promise\.all/,'stock and Business Pulse must enrich in parallel');
assert.match(batchSource,/businessPulse,items:sorted/,'manager batch must return Business Pulse');
assert.match(batchSource,/pulseBundled:true/,'manager diagnostics must expose bundled pulse');
assert.match(homeSource,/enriched\?\.businessPulse/,'manager home must consume bundled Business Pulse first');
assert.match(homeSource,/manager-home-fast/,'first paint must remain on the local fast endpoint');
assert.match(homeSource,/manager-inbox-batch/,'second network request must remain the enrichment batch');
assert.match(authSource,/const BUILD='1902'/,'frontend runtime must be cache-busted for V1.90.2');

const base=process.env.STOREOPS_TEST_BASE||'';
if(base){
 const headers={'x-demo-user':'u-vf'};
 const fastResponse=await fetch(`${base}/api/stores/val-fleuri/manager-home-fast`,{headers});
 assert.equal(fastResponse.status,200);
 const fast=await fastResponse.json();
 assert.equal(fast.status,'READY');
 assert.equal(fast.diagnostics?.externalCalls,0,'fast first paint must not call external systems');

 const batchResponse=await fetch(`${base}/api/stores/val-fleuri/manager-inbox-batch`,{headers});
 assert.equal(batchResponse.status,200);
 const batch=await batchResponse.json();
 assert.equal(batch.status,'READY');
 assert(batch.businessPulse,'manager batch must carry Business Pulse');
 assert.equal(batch.diagnostics?.httpFanout,0,'enrichment batch must not fan out through HTTP');
 assert.equal(batch.diagnostics?.pulseBundled,true);
}

console.log('V1.90.2 performance enrichment contract OK');

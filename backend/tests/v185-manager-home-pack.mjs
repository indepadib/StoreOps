import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const apiSource=read('frontend/js/api.js');
const homeSource=read('frontend/js/pages/manager-home.js');
const pulseApiSource=read('backend/services/business-pulse-api.mjs');

assert.match(apiSource,/primeApiResponses/,'frontend API cache priming is required');
assert.match(apiSource,/primedApiResponses/,'primed API response cache missing');
assert.match(homeSource,/manager-home-pack/,'manager home must prefetch the home pack');
assert.match(homeSource,/renderImmediateShell\(\)/,'manager home must paint immediately before network completion');
assert.match(homeSource,/primeApiResponses\(pack\.responses,8000\)/,'home pack must prime existing endpoint responses');
assert.match(pulseApiSource,/managerHomePack/,'backend manager home pack aggregator missing');
assert.match(pulseApiSource,/Promise\.all\(paths\.map/,'home pack sources must be loaded concurrently');
assert.match(pulseApiSource,/stock-signals/,'home pack must include stock signals');
assert.match(pulseApiSource,/business-pulse/,'home pack must include business pulse');

const base=process.env.STOREOPS_TEST_BASE||'';
if(base){
 const r=await fetch(`${base}/api/stores/val-fleuri/manager-home-pack`,{headers:{'x-demo-user':'u-vf'}});
 assert.equal(r.status,200,`manager home pack should return 200, got ${r.status}`);
 const pack=await r.json();
 assert.equal(pack.storeId,'val-fleuri');
 assert(pack.responses&&typeof pack.responses==='object');
 assert(pack.responses['/api/stores/val-fleuri/dashboard'],'dashboard must be included in home pack');
 assert('/api/stores/val-fleuri/business-pulse' in pack.responses,'business pulse must be included in home pack');
 assert(Object.keys(pack.responses).length>=8,'home pack should collapse most manager-home reads');
 assert(Number.isFinite(Number(pack.durationMs)),'home pack duration must be observable');
}

console.log('V1.85 manager home pack contract OK');

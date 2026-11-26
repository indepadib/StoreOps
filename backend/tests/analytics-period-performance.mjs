import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createPeriodLoader,periodPlan} from '../../frontend/analytics/period-loader.js';
import {salesComparatives} from '../../frontend/analytics/sales-comparatives.js';
import {createCustomerNameCache} from '../services/customer-name-cache.mjs';
import {createReadPool,boundedMap} from '../services/analytics-read-pool.mjs';

const current={start:'2026-08-01',end:'2026-10-29'},previous={start:'2026-05-03',end:'2026-07-31'};
const plan=periodPlan(current,previous);assert.equal(plan.length,45);
for(const side of ['current','previous']){
 const dates=plan.flatMap(p=>{const r=p[side],days=(Date.parse(r.end)-Date.parse(r.start))/86400000+1;assert.ok(days>0&&days<=2);return Array.from({length:days},(_,i)=>new Date(Date.parse(r.start)+i*86400000).toISOString().slice(0,10))});
 assert.equal(dates.length,90);assert.equal(new Set(dates).size,90);
}
assert.equal(periodPlan(current,{start:'2026-10-01',end:'2026-10-01'}).length,1,'short custom comparison must not generate zero-day or overlapping slices');
assert.throws(()=>periodPlan({start:'2026-02-30',end:'2026-03-02'},previous));
const ready={status:'READY',coverage:{storesRequested:2,currentStoresReady:2,comparisonStoresReady:2},quality:{status:'OK'},summary:{current:{sales:200},previous:{sales:100}}};
let tick=0,active=0,peak=0,calls=0;
const read=createPeriodLoader({now:()=>tick,ttl:1000});
const fetchSlice=async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return structuredClone(ready)};
const input={plan,scope:['tenant-A',['A','B']],fetchSlice};
const coldStart=performance.now(),cold=await read(input),coldMs=performance.now()-coldStart;
assert.equal(cold.results.length,45);assert.equal(cold.diagnostics.requests,45);assert.equal(peak,2);
const warmStart=performance.now(),warm=await read(input),warmMs=performance.now()-warmStart;
assert.equal(calls,45);assert.equal(warm.diagnostics.hits,45);assert.equal(warm.diagnostics.requests,0);
await read({...input,scope:['tenant-B',['A','B']]});assert.equal(calls,90,'tenant isolation');
await read({...input,scope:['tenant-A',['A']]});assert.equal(calls,135,'store isolation');
tick=1001;await read(input);assert.equal(calls,180,'expired slices re-read');
await read({...input,force:true});assert.equal(calls,225,'force bypasses every slice');
const cache=createPeriodLoader();let count=0;
const one={plan:plan.slice(0,1),scope:'test',fetchSlice:async()=>{count++;return structuredClone(ready)}};
await cache(one);
await assert.rejects(cache({...one,force:true,fetchSlice:async()=>{throw Error('source offline')}}));
await cache(one);assert.equal(count,2,'a failed forced refresh invalidates its old slice');
for(const incomplete of [{...ready,status:'TRUNCATED'},{...ready,quality:{status:'ERROR'}},{...ready,coverage:{...ready.coverage,comparisonStoresReady:1}}]){
 const load=createPeriodLoader();let reads=0;const sample={...one,fetchSlice:async()=>{reads++;return incomplete}};await load(sample);await load(sample);assert.equal(reads,2);
}
const controller=new AbortController();
const cancelled=createPeriodLoader();let published=0;
await assert.rejects(cancelled({...one,signal:controller.signal,fetchSlice:async()=>{controller.abort();return ready},onProgress:()=>published++}),{name:'AbortError'});
assert.equal(published,0);
const stopOnFailure=createPeriodLoader();let attempted=0,releaseRead,settled=false;
const inFlight=new Promise(resolve=>releaseRead=resolve);
const failed=stopOnFailure({...one,plan:plan.slice(0,5),fetchSlice:async()=>{attempted++;if(attempted===1)throw Error('source failed');await inFlight;return ready}}).catch(error=>{settled=true;assert.match(error.message,/source failed/)});
await new Promise(resolve=>setTimeout(resolve,1));
assert.equal(attempted,2);assert.equal(settled,false,'failed load drains the other in-flight read before permitting retry');
releaseRead();await failed;assert.equal(attempted,2,'remaining period slices are not read after a failure');

const pool=createReadPool();let shared=0;
await Promise.all(Array.from({length:8},()=>pool('same',async()=>{shared++;await new Promise(r=>setTimeout(r,1));return 7})));
assert.equal(shared,1);
await assert.rejects(pool('fail',async()=>{throw Error('fail')}));
assert.equal(await pool('fail',async()=>9),9);
await pool('same',async()=>{shared++;},{force:true});assert.equal(shared,2);
let namesCalls=0;const names=createCustomerNameCache(),fetchNames=async ids=>{namesCalls++;return new Map(ids.map(id=>[id,'Name '+id]))};
for(let i=0;i<45;i++)await names(['tenant','company'],['C1','C2','C3'],fetchNames);
assert.equal(namesCalls,1,'recurrent customers no longer refetch names for every date chunk');
await names(['other-tenant','company'],['C1'],fetchNames);assert.equal(namesCalls,2);
const missing=createCustomerNameCache();let failedNames=0;for(let i=0;i<2;i++)await missing('S',['X'],async()=>{failedNames++;return new Map()});assert.equal(failedNames,2,'missing names remain retryable');
let writes=0,maxWrites=0,inWrites=0;
await boundedMap(Array.from({length:90},(_,i)=>i),6,async()=>{inWrites++;maxWrites=Math.max(maxWrites,inWrites);await new Promise(r=>setTimeout(r,1));writes++;inWrites--});
assert.equal(writes,90);assert.equal(maxWrites,6);

const scope={periodStart:'2026-10-01',periodEnd:'2026-10-10',compareStart:'2026-09-21',compareEnd:'2026-09-30'};
const data={summary:{current:{sales:2000,tickets:100,identifiedSales:1200,identifiedTickets:40,discountAmount:50},previous:{sales:1000,tickets:50,identifiedSales:500,identifiedTickets:25,discountAmount:20}}};
const metrics=salesComparatives(data,scope,{currentReady:true,comparisonReady:true});
assert.deepEqual(metrics.map(x=>x.value),[800,40,40,60,30,800/60,50,null,null]);
assert.equal(metrics[2].previous,50);assert.equal(metrics[2].changeMode,'points');
assert.ok(salesComparatives(data,scope).every(x=>x.value===null&&x.previous===null));
assert.equal(salesComparatives({summary:{current:{sales:100,tickets:0}}},scope,{currentReady:true})[4].value,null);
console.log(JSON.stringify({fixture:'synthetic 90-day network; not a D365 production benchmark',blocks:45,peakConcurrent:peak,coldMs:Math.round(coldMs),warmMs:Math.round(warmMs*100)/100,warmRequests:0,recurrentCustomerNameReads:'45 -> 1',dailyEvidenceWrites:90,maxParallelWrites:6}));
console.log('PASS period coverage, bounded concurrency, cache isolation/expiry/force/failures, cancellation, coalescing, identity reuse and comparative KPI formulas');

import {mergeDailyEvidence} from '../../frontend/analytics/sales-proof-model.js';
import {filterAndSortRows} from '../../frontend/analytics/table-analysis.js';
import {marginEvidence} from '../../frontend/analytics/performance-evidence.js';
import {createPeriodLoader,periodPlan} from '../../frontend/analytics/period-loader.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../frontend/analytics/decision.js',import.meta.url),'utf8').replace(/^(?:import[^;]+;\s*)+/,'');
const nodes=new Map(['#executiveSalesValue','#executiveComparisonValue'].map(k=>[k,{textContent:'',innerHTML:''}]));
const listeners=new Map(),requests=[],published=[],saved=[];
const scope={tenant:'franprix',stores:[{id:'val-fleuri'},{id:'trefle'}],selectedStoreIds:['val-fleuri','trefle'],section:'overview',periodStart:'2026-10-21',periodEnd:'2026-10-22',compareStart:'2026-10-19',compareEnd:'2026-10-20'};
const context={createPeriodLoader,periodPlan,mergeDailyEvidence,filterAndSortRows,marginEvidence,console,AbortController,URLSearchParams,Map,Set,Date,Intl,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:()=>null,setItem:(key,value)=>saved.push({key,value})},document:{readyState:'complete',querySelector:key=>nodes.get(key)||null,querySelectorAll:()=>[],addEventListener:(key,fn)=>listeners.set(key,fn),dispatchEvent:event=>published.push(event)},window:{RETAIL_INTELLIGENCE:{getState:()=>scope,escapeHtml:s=>s,money:String,number:String,percent:String,api:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))}}};
vm.runInNewContext(source,context);
assert.equal(requests.length,1);
scope.periodEnd='2026-10-21';scope.compareStart=scope.compareEnd='2026-10-20';
listeners.get('retail-intelligence:period')({detail:{force:false}});
assert.equal(requests[0].options.signal.aborted,true,'changing dates cancels the obsolete request');
// Even a transport which delivers a response after cancellation must not publish it.
requests[0].resolve({summary:{current:{sales:40000},previous:{}},products:[]});
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(requests.length,2,'the requested period must not be dropped while loading');
const q=new URL(requests[1].url,'https://test.invalid').searchParams;
assert.equal(q.get('start'),'2026-10-21');assert.equal(q.get('end'),'2026-10-21');
assert.equal(published.length,0,'the stale two-day total must never be published');
requests[1].resolve({summary:{current:{sales:12345.67},previous:{}},products:[]});
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(context.window.RETAIL_DECISION_INTELLIGENCE.getData().summary.current.sales,12345.67);
assert.equal(nodes.get('#executiveSalesValue').textContent,'12345.67');
assert.equal(saved.length,1,'only the latest period may enter the browser cache');
assert.equal(published.filter(e=>e.type==='retail-intelligence:decision').length,1,'only the latest decision may be published; catalog enrichment has its own event');

const analytics=readFileSync(new URL('../../frontend/analytics/analytics.js',import.meta.url),'utf8');
const preset=analytics.slice(analytics.indexOf('  function applyPresetToState('),analytics.indexOf('  function applyComparisonToState('));
for(const [today,expected] of [['2026-10-22','2026-10-21'],['2026-10-01','2026-09-30']]){
 const state={comparisonMode:'previous_period'},test={state,businessToday:()=>today,shiftDate:(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)},applyComparisonToState(){}};
 vm.runInNewContext(preset+";applyPresetToState('yesterday');",test);
 assert.equal(state.periodStart,expected);assert.equal(state.periodEnd,expected);assert.equal(state.businessDate,expected);
 vm.runInNewContext(preset+";applyPresetToState('7d');",test);
 assert.equal(state.periodEnd,expected);
 assert.equal((Date.parse(state.periodEnd)-Date.parse(state.periodStart))/86400000+1,7);
 vm.runInNewContext(preset+";applyPresetToState('today');",test);
 assert.equal(state.periodStart,today);assert.equal(state.periodEnd,today);

}
console.log('PASS changed-period cancellation, late response rejection, latest result/cache and yesterday date boundaries');

const executiveScope={...scope,periodStart:'2026-08-01',periodEnd:'2026-10-29',compareStart:'2026-05-03',compareEnd:'2026-07-31'};
const executiveData={status:'READY',period:{startDate:executiveScope.periodStart,endDate:executiveScope.periodEnd},comparison:{startDate:executiveScope.compareStart,endDate:executiveScope.compareEnd},coverage:{storesRequested:2,currentStoresReady:2,comparisonStoresReady:2},quality:{status:'OK'},stores:[{storeId:'val-fleuri'},{storeId:'trefle'}],summary:{current:{sales:150000},previous:{sales:100000}}};
const exactKey='retail-intelligence:decision:v37:franprix|trefle,val-fleuri|2026-08-01|2026-10-29|2026-05-03|2026-07-31';
function openOverview(sample,age=0){
 const calls=[],events=[];
 const copies={...context,localStorage:{getItem:key=>key===exactKey?JSON.stringify({data:sample,at:Date.now()-age}):null},document:{...context.document,addEventListener(){},dispatchEvent:event=>events.push(event)},window:{RETAIL_INTELLIGENCE:{...context.window.RETAIL_INTELLIGENCE,getState:()=>executiveScope,api:(...args)=>{calls.push(args);return new Promise(()=>{})}}}};
 vm.runInNewContext(source,copies);
 return{calls,events};
}
const warm=openOverview(executiveData);
assert.equal(warm.calls.length,0,'a complete fresh executive result should avoid 45 identical reads');
assert.equal(warm.events.find(event=>event.detail?.cached)?.detail.data.summary.current.sales,150000);
assert.equal(openOverview({...executiveData,coverage:{...executiveData.coverage,comparisonStoresReady:1}}).calls.length,2,'incomplete comparison must be read again');
assert.equal(openOverview({...executiveData,comparison:{...executiveData.comparison,startDate:'2026-05-04'}}).calls.length,2,'comparison dates must match exactly');
assert.equal(openOverview({...executiveData,stores:[{storeId:'val-fleuri'},{storeId:'other'}]}).calls.length,2,'store identity must match, not just store count');
assert.equal(openOverview(executiveData,16*60*1000).calls.length,2,'an expired result must be read again');
console.log('PASS fresh complete 90-day executive cache and coverage/date/expiry safeguards');

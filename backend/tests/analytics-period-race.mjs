import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../frontend/analytics/decision.js',import.meta.url),'utf8');
const nodes=new Map(['#executiveSalesValue','#executiveComparisonValue'].map(k=>[k,{textContent:'',innerHTML:''}]));
const listeners=new Map(),requests=[],published=[],saved=[];
const scope={tenant:'franprix',stores:[{id:'val-fleuri'},{id:'trefle'}],selectedStoreIds:['val-fleuri','trefle'],section:'overview',periodStart:'2026-10-21',periodEnd:'2026-10-22',compareStart:'2026-10-19',compareEnd:'2026-10-20'};
const context={console,AbortController,URLSearchParams,Map,Set,Date,Intl,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail}},setTimeout:()=>0,clearTimeout(){},localStorage:{getItem:()=>null,setItem:(key,value)=>saved.push({key,value})},document:{readyState:'complete',querySelector:key=>nodes.get(key)||null,querySelectorAll:()=>[],addEventListener:(key,fn)=>listeners.set(key,fn),dispatchEvent:event=>published.push(event)},window:{RETAIL_INTELLIGENCE:{getState:()=>scope,escapeHtml:s=>s,money:String,number:String,percent:String,api:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}))}}};
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
assert.equal(published.length,1);

const analytics=readFileSync(new URL('../../frontend/analytics/analytics.js',import.meta.url),'utf8');
const preset=analytics.slice(analytics.indexOf('  function applyPresetToState('),analytics.indexOf('  function applyComparisonToState('));
for(const [today,expected] of [['2026-10-22','2026-10-21'],['2026-10-01','2026-09-30']]){
 const state={comparisonMode:'previous_period'},test={state,isoDate:()=>today,shiftDate:(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)},applyComparisonToState(){}};
 vm.runInNewContext(preset+";applyPresetToState('yesterday');",test);
 assert.equal(state.periodStart,expected);assert.equal(state.periodEnd,expected);assert.equal(state.businessDate,expected);
}
console.log('PASS changed-period cancellation, late response rejection, latest result/cache and yesterday date boundaries');

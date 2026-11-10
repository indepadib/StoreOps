import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the production loader with controlled, out-of-order network responses.
const ui=readFileSync(new URL('../../frontend/analytics/loyalty.js',import.meta.url),'utf8');
const loader=ui.slice(ui.indexOf('  async function loadRecruitment('),ui.indexOf('  function loyaltyAggregate('));
const scope={start:'2026-10-01',end:'2026-10-31',stores:[{id:'A'},{id:'B'}]},requests=[];
const state={recruitmentRequest:0},published=[];
const context={state,URLSearchParams,cashierScope:()=>scope,core:()=>({api:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}))}),renderLoyalty:()=>published.push(state.recruitmentData),renderCashiers(){}};
vm.runInNewContext(loader+';globalThis.load=loadRecruitment',context);
const guard=ui.slice(ui.indexOf('  function recruitmentForScope('),ui.indexOf('  function recruitmentByStore('));
vm.runInNewContext(guard+';globalThis.current=recruitmentForScope',context);
const october=context.load();
await context.load();assert.equal(requests.length,1,'duplicate in-flight scope is reused');
scope.start='2026-09-01';scope.end='2026-09-30';
const september=context.load();assert.equal(requests.length,2,'new period starts while previous one is pending');
requests[0].resolve({status:'READY',recruitments:2267});await october;
assert.equal(state.recruitmentData,null);assert.equal(state.recruitmentLoading,true);assert.equal(published.length,0);
requests[1].resolve({status:'READY',recruitments:7});await september;
assert.equal(state.recruitmentData.recruitments,7);assert.equal(published.length,1);
assert.equal(context.current().recruitments,7);
scope.start='2026-08-01';assert.equal(context.current(),null,'old result is hidden even before the next load starts');scope.start='2026-09-01';
scope.stores=[{id:'A'}];const oneStore=context.load();
scope.stores=[{id:'B'}];const otherStore=context.load();
requests[3].resolve({status:'READY',recruitments:3});await otherStore;
requests[2].reject(Error('late failure'));await oneStore;
assert.equal(state.recruitmentData.recruitments,3,'late errors cannot overwrite a new store result');
assert.equal(published.length,2);

// A malformed OData page must not become a certified zero or partial count.
const source=readFileSync(new URL('../services/dynamics.mjs',import.meta.url),'utf8');
const reader=source.slice(source.indexOf('export async function odataGetAll('),source.indexOf('function cleanList(')).replace('export ','');
let pages=[];
const backend={config:{dynamics:{}},odataGet:async()=>pages.shift()};
vm.runInNewContext(reader+';globalThis.read=odataGetAll',backend);
for(const bad of [{},{value:null},{value:[], '@odata.nextLink':'next'}]){
 pages=[bad];await assert.rejects(backend.read('Accounts',{strict:true}),{code:'D365_INCOMPLETE_COLLECTION'});
}
pages=[{value:[{id:1},{id:2}]},{}];
await assert.rejects(backend.read('Accounts',{strict:true,pageSize:2}),{code:'D365_INCOMPLETE_COLLECTION'});
pages=[{value:[]}];assert.equal((await backend.read('Accounts',{strict:true})).value.length,0);
pages=[{value:[{id:1},{id:2}]},{value:[{id:3}]}];
assert.equal((await backend.read('Accounts',{strict:true,pageSize:2})).value.length,3);
pages=[{value:[{id:1},{id:2}]}];assert.equal((await backend.read('Accounts',{strict:true,pageSize:2,maxRows:2})).truncated,true);
console.log('PASS recruitment latest-period/store publication and strict complete OData collection');

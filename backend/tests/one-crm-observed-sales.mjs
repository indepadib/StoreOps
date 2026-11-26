import assert from 'node:assert/strict';
import {summarizeObservedSales,makeObservedSalesGateway,parseObservedPilotStores} from '../services/one-crm-observed-sales.mjs';
const storeId='demo-a',date='2026-11-25';
const baskets=Array.from({length:12},(_,i)=>({storeId,date,key:'demo-ticket-'+i,customerToken:i<11?'demo-customer-'+i:null,items:[{sales:10}]}));
const e={storeId,startDate:date,endDate:date,source:'D365/RetailTransactionSalesTransBIEntities',checkedAt:'2026-11-26T10:00:00Z',rejectedIdentity:0,baskets};
const x=summarizeObservedSales(e,{storeId,date});assert.equal(x.status,'READY');assert.equal(x.positiveSales,120);assert.equal(x.identifiedCustomers,11);assert.equal(x.identifiedPositiveSales,110);assert.equal(x.identifiedTickets,11);assert.equal(x.averagePositiveBasket,10);assert.equal(x.financialReconciliation,'NOT_VERIFIED');assert.equal(x.activationEnabled,false);assert.ok(!JSON.stringify(x).includes('demo-customer'));
assert.equal(summarizeObservedSales({...e,baskets:baskets.slice(0,9)},{storeId,date}).status,'SUPPRESSED');
for(const patch of [{source:'simulated'},{rejectedIdentity:1},{startDate:'2026-11-24'},{baskets:[...baskets,baskets[0]]},{baskets:[{...baskets[0],items:[{sales:-5}]},...baskets.slice(1)]}])assert.equal(summarizeObservedSales({...e,...patch},{storeId,date}).status,'UNAVAILABLE');
let reads=0;const deps={listStores:async()=>[{id:'demo-a',name:'A'},{id:'demo-b',name:'B'}],canAccessStore:(_,id)=>id==='demo-a',sourceReady:()=>true,readDay:async()=>{reads++;return e},today:()=> '2026-11-26'};const gate=makeObservedSalesGateway({...deps,pilotStores:'demo-a,demo-b'});
const session={mode:'entra',user:{role:'ops_director'}},req={session,dynamicsMode:'live',method:'GET',query:new URLSearchParams({storeId,date})};
assert.equal((await gate(req)).data.positiveSales,120);assert.equal(reads,1);
for(const patch of [{session:{...session,mode:'demo'}},{session:{...session,user:{role:'employee'}}},{dynamicsMode:'simulated'},{method:'POST'},{query:new URLSearchParams({storeId:'demo-b',date})},{query:new URLSearchParams({storeId,date:'2026-11-26'})},{query:new URLSearchParams({storeId,date,token:'x'})}])assert.notEqual((await gate({...req,...patch})).data.status,'READY');
assert.equal(reads,1);assert.deepEqual((await gate({...req,query:new URLSearchParams()})).data.stores,[{id:'demo-a',name:'A'}]);assert.equal(reads,1);
console.log('CRM observed sales gateway passed');

assert.deepEqual([...parseObservedPilotStores('demo-a, demo-b')],['demo-a','demo-b']);
for(const scope of ['', 'demo-a,', 'demo-a,demo-a','demo-a,demo-b,demo-c','*','demo a']){
 assert.equal(parseObservedPilotStores(scope).size,0);
 assert.equal((await makeObservedSalesGateway({...deps,pilotStores:scope})(req)).data.reason,'PILOT_SCOPE_NOT_CONFIGURED');
}
const restricted=makeObservedSalesGateway({...deps,canAccessStore:()=>true,pilotStores:'demo-a'});
assert.deepEqual((await restricted({...req,query:new URLSearchParams()})).data.stores,[{id:'demo-a',name:'A'}]);
assert.equal((await restricted({...req,query:new URLSearchParams({storeId:'demo-b',date})})).status,403);
assert.equal(reads,1);

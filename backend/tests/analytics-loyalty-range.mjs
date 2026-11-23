import assert from 'node:assert/strict';
process.env.STOREOPS_DB=':memory:';
const {readLoyaltyRange}=await import('../services/analytics-loyalty-range.mjs');

const stores=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
const complete={status:'READY',total:10,identityBasis:'CUSTOMER_ACCOUNT',rowCount:12,items:[{customerAccount:'private-id'}]};
const options={startDate:'2026-10-01',endDate:'2026-10-31',includeStaff:true};
const dependencies={
 readEnrollments:async id=>({...complete,truncated:id==='b',missingIdentityRows:id==='c'?2:0}),
 readStaff:async id=>({status:'READY',truncated:id==='b',items:[{staffId:'x',recruitments:3}]}),
 readCache:async()=>null,
 writeCache:async()=>{},
 readAccounts:async()=>({status:'UNAVAILABLE'}),
 readEarn:async()=>({status:'UNAVAILABLE'}),
};
const result=await readLoyaltyRange(stores,options,dependencies);
assert.equal(result.status,'PARTIAL');
assert.deepEqual(result.coverage,{ready:1,total:3});
assert.equal(result.recruitments,null);
assert.equal(result.accountCreations,null);
assert.equal(result.enrollmentMetric.networkTotal,null);
assert.deepEqual(result.stores.map(s=>[s.status,s.enrollments,s.recruitments]),[
 ['READY',10,null],['TRUNCATED',null,null],['INCOMPLETE_IDENTITY',null,null],
]);
assert.deepEqual(result.stores[0].staff,[{staffId:'x',cardEnrollments:3,recruitments:null}]);
assert.deepEqual(result.stores[1].staff,[]);
assert.ok(!JSON.stringify(result).includes('private-id'));
const liveDependencies={...dependencies,
 readAccounts:async()=>({status:'PARTIAL',total:8,networkTotal:10,unattributed:2,source:'D365/CustTableCDREntities',dateField:'SysCreatedDateTime',stores:[{storeId:'a',total:3},{storeId:'b',total:4},{storeId:'c',total:1}]}),
 readEarn:async()=>({status:'READY',earn:10.25,source:'D365/journal'})};
const network=await readLoyaltyRange(stores,{...options,networkScope:true},liveDependencies);
assert.equal(network.accountCreations,10);assert.equal(network.accountCreationStatus,'READY');
assert.equal(network.accountCreationEvidence.unattributed,2);
assert.equal(network.earn,30.75);assert.equal(network.stores[0].accountCreations,3);
const scoped=await readLoyaltyRange(stores,options,liveDependencies);
assert.equal(scoped.accountCreations,8);assert.equal(scoped.accountCreationStatus,'PARTIAL');
assert.equal(scoped.accountCreationEvidence.unattributed,null,'restricted scopes must not expose counts from other stores');
const failedEarn=await readLoyaltyRange(stores,options,{...liveDependencies,readEarn:async()=>({status:'TRUNCATED',earn:999})});
assert.equal(failedEarn.earn,null);assert.equal(failedEarn.stores[0].earn,null);

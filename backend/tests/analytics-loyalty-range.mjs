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

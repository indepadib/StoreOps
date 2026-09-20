import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v220-pulse-${process.pid}.db`;
process.env.STOREOPS_MEDIA_DIR=`/tmp/storeops-v220-pulse-media-${process.pid}`;
process.env.D365_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';
process.env.D365_DATA_AREA_FIELD='dataAreaId';

const seen=[];
globalThis.fetch=async (url,opts={})=>{
 const u=String(url);seen.push(u);
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/RetailTransactionSalesTransBIEntities')){
  const decoded=decodeURIComponent(u);
  if(decoded.includes("store eq 'FRP0001'")&&decoded.includes('businessDate ge 2026-09-20T00:00:00Z')){
   return new Response(JSON.stringify({error:{message:'Edm.Date expected'}}),{status:400,headers:{'content-type':'application/json'}});
  }
  if(decoded.includes("store eq 'FRP0001'")&&decoded.includes('businessDate eq 2026-09-20')){
   return new Response(JSON.stringify({value:[
    {dataAreaId:'5001',store:'FRP0001',businessDate:'2026-09-20',transactionId:'T1',itemId:'A',netAmountInclTax:-120,qty:2,time:'09:10'},
    {dataAreaId:'5001',store:'FRP0001',businessDate:'2026-09-20',transactionId:'T2',itemId:'B',netAmountInclTax:-30,qty:1,time:'10:05'}
   ]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(decoded.includes("store eq 'FRP0001'")){
   return new Response(JSON.stringify({value:[
    {dataAreaId:'5001',store:'FRP0001',businessDate:'2026-09-20',transactionId:'T1',itemId:'A',netAmountInclTax:-120,qty:2,time:'09:10'}
   ]}),{status:200,headers:{'content-type':'application/json'}});
  }
  return new Response(JSON.stringify({value:[]}),{status:200,headers:{'content-type':'application/json'}});
 }
 throw new Error('Unexpected URL '+u)
};

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {saveD365SalesMappingDraft,smokeD365SalesMapping,activateD365SalesMapping,salesStoreIdentifiers}=await import('../services/d365-sales-mapping.mjs');
const {salesIntegrationConfig,readStoreSalesDay}=await import('../services/dynamics-sales.mjs');

const actor=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
assert(actor);

const mapping={
 entity:'RetailTransactionSalesTransBIEntities',
 fields:{channel:'store',businessDate:'businessDate',transaction:'transactionId',net:'netAmountInclTax',product:'itemId',quantity:'qty',cost:'',time:'time',productName:'',department:'',category:''},
 dateFilterMode:'datetime',salesSign:-1,quantitySign:1,costSign:-1
};
saveD365SalesMappingDraft({actor,input:mapping});
const ids=salesStoreIdentifiers('val-fleuri','store');
assert.equal(ids[0].kind,'STORE_NUMBER');
assert.equal(ids[0].value,'FRP0001');
assert(ids.some(x=>x.value==='10001'));

const validated=await smokeD365SalesMapping({actor,storeId:'val-fleuri'});
assert.equal(validated.state,'VALIDATED');
assert.equal(validated.smoke.status,'PASSED');
assert.equal(validated.smoke.storeIdentifierKind,'STORE_NUMBER');
assert.equal(validated.smoke.storeIdentifier,'FRP0001');
activateD365SalesMapping({actor});

const cfg=salesIntegrationConfig('val-fleuri');
assert.equal(cfg.ready,true);
assert.equal(cfg.storeFilterCandidates[0].value,'FRP0001');

const day=await readStoreSalesDay('val-fleuri','2026-09-20');
assert.equal(day.status,'READY');
assert.equal(day.config.storeIdentifier,'FRP0001');
assert.equal(day.config.dateFilterMode,'date');
assert.equal(day.data.netSales,150);
assert.equal(day.data.tickets,2);
assert.equal(day.data.units,3);
assert(seen.some(x=>decodeURIComponent(x).includes('businessDate ge 2026-09-20T00:00:00Z')),'datetime attempt expected');
assert(seen.some(x=>decodeURIComponent(x).includes('businessDate eq 2026-09-20')),'date fallback expected');

console.log('V2.20 live Business Pulse sales fallback: OK');

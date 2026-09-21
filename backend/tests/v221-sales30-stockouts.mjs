import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v221-stockout-${process.pid}.db`;
process.env.STOREOPS_MEDIA_DIR=`/tmp/storeops-v221-stockout-media-${process.pid}`;
process.env.D365_MODE='live';
process.env.D365_STOCK_READ_MODE='live';
process.env.D365_SALES_READ_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';
process.env.D365_DATA_AREA_FIELD='dataAreaId';
process.env.D365_SALES_ENTITY='RetailTransactionSalesTransBIEntities';

globalThis.fetch=async url=>{
 const u=decodeURIComponent(String(url)).replaceAll('+',' ');
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/WarehousesOnHandV2')){
  return new Response(JSON.stringify({value:[
   {dataAreaId:'5001',InventoryWarehouseId:'FRP0001',ItemNumber:'A',AvailableOnHandQuantity:0,OnHandQuantity:0},
   {dataAreaId:'5001',InventoryWarehouseId:'FRP0001',ItemNumber:'B',AvailableOnHandQuantity:5,OnHandQuantity:5},
   {dataAreaId:'5001',InventoryWarehouseId:'FRP0001',ItemNumber:'C',AvailableOnHandQuantity:-2,OnHandQuantity:-2}
  ]}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(u.includes('/data/RetailTransactionSalesTransBIEntities')){
  if(u.includes('businessDate ge 2026-08-23')||u.includes('businessDate ge 2026-08-23T00:00:00Z')){
   return new Response(JSON.stringify({value:[
    {dataAreaId:'5001',store:'FRP0001',businessDate:'2026-09-20',transactionId:'T1',itemId:'A',qty:1,netAmountInclTax:-10},
    {dataAreaId:'5001',store:'FRP0001',businessDate:'2026-09-18',transactionId:'T2',itemId:'B',qty:2,netAmountInclTax:-20},
    {dataAreaId:'5001',store:'FRP0001',businessDate:'2026-09-17',transactionId:'T3',itemId:'C',qty:1,netAmountInclTax:-5},
    {dataAreaId:'5001',store:'FRP0001',businessDate:'2026-09-16',transactionId:'T4',itemId:'D',qty:1,netAmountInclTax:-8}
   ]}),{status:200,headers:{'content-type':'application/json'}});
  }
  return new Response(JSON.stringify({value:[]}),{status:200,headers:{'content-type':'application/json'}});
 }
 throw new Error('Unexpected URL '+u);
};

await import('../services/pilot-profile.mjs');
const {getStockSignals}=await import('../services/stock-signals.mjs');

const result=await getStockSignals('val-fleuri',{businessDate:'2026-09-21',force:true});
assert.equal(result.summary.ruptureReady,true);
assert.equal(result.summary.ruptureMethod,'SALES_30D_ZERO_STOCK');
assert.equal(result.summary.salesWindowDays,30);
assert.equal(result.summary.salesWindowProducts,4);
assert.equal(result.summary.outOfStock,2);
assert(result.items.some(x=>x.type==='OUT'&&x.productNumber==='A'));
assert(result.items.some(x=>x.type==='OUT'&&x.productNumber==='D'&&x.stockEvidence==='NO_ON_HAND_ROW'));
assert(!result.items.some(x=>x.type==='OUT'&&x.productNumber==='B'));
assert(result.items.some(x=>x.type==='NEGATIVE'&&x.productNumber==='C'));

console.log('V2.21 sales-30d stockouts: OK');

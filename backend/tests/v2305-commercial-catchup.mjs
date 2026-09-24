import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v2305-catchup-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_PRICE_READ_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';
process.env.D365_DEFAULT_PRICE_GROUP='Franprix';
process.env.D365_CHANNEL_PRICE_GROUP_ENTITY='RetailChannelPriceGroups';

let secondPrice=89.95;
const json=value=>new Response(JSON.stringify({value}),{status:200,headers:{'content-type':'application/json'}});
globalThis.fetch=async url=>{
 const u=decodeURIComponent(String(url)).replaceAll('+',' ');
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/RetailChannelPriceGroups'))return json([{RetailChannelId:'10001',GroupCode:'Franprix'},{RetailChannelId:'10001',GroupCode:'Franp VF'}]);
 if(u.includes('/data/SalesPriceAgreements'))return json([]);
 if(u.includes('/data/ReleasedProductsV2')){
  if(u.includes('SalesPriceDate ge 2026-09-23T00:00:00Z')&&u.includes('SalesPriceDate lt 2026-09-24T00:00:00Z')){
   return json([
    {dataAreaId:'5001',ItemNumber:'HS-002789',ProductNumber:'HS-002789',ProductName:'DINDY',SalesPrice:69,SalesUnitSymbol:'kg',SalesPriceQuantity:1,SalesPriceDate:'2026-09-23T12:00:00Z',SellEndDate:'1900-01-01T12:00:00Z'},
    {dataAreaId:'5001',ItemNumber:'HS-002973',ProductNumber:'HS-002973',ProductName:'ZEN',SalesPrice:secondPrice,SalesUnitSymbol:'PC',SalesPriceQuantity:1,SalesPriceDate:'2026-09-23T12:00:00Z',SellEndDate:'1900-01-01T12:00:00Z'}
   ]);
  }
  return json([]);
 }
 throw new Error('Unexpected URL '+u);
};

const {db}=await import('../db.mjs');
const {getCommercialPriceChanges}=await import('../services/dynamics-price.mjs');
const {syncCommercialControls,listCommercialControls}=await import('../services/commercial.mjs');
for(const t of ['commercial_controls','commercial_source_state'])db.prepare(`DELETE FROM ${t}`).run();

const storeId='val-fleuri',day='2026-09-24';
let source=await getCommercialPriceChanges(storeId,day);
let base=source.changes.filter(x=>x.priceSource==='BASE_PRICE');
assert.equal(base.length,2,'all J-1 base price changes must be returned');
assert.deepEqual(base.map(x=>x.productName).sort(),['DINDY','ZEN']);
assert(base.every(x=>x.actionType==='VERIFY'&&x.deltaActionType==='PRICE_CHANGE'),'J-1 changes must enter catch-up materialization');

let sync=syncCommercialControls({storeId,businessDate:day,changes:source.changes});
let rows=listCommercialControls(storeId,day).filter(x=>x.action_type==='PRICE_CHANGE');
assert.equal(rows.length,2,'both changed articles must become controls');
assert(rows.some(x=>x.product_name==='DINDY'&&x.expected_price===69));
assert(rows.some(x=>x.product_name==='ZEN'&&x.expected_price===89.95));

sync=syncCommercialControls({storeId,businessDate:day,changes:source.changes});
rows=listCommercialControls(storeId,day).filter(x=>x.action_type==='PRICE_CHANGE');
assert.equal(rows.length,2,'refresh must never erase unverified controls');
assert.equal(sync.pendingRetention,true);

secondPrice=91.5;
source=await getCommercialPriceChanges(storeId,day);
syncCommercialControls({storeId,businessDate:day,changes:source.changes});
rows=listCommercialControls(storeId,day).filter(x=>x.action_type==='PRICE_CHANGE');
assert.equal(rows.length,2,'new price on same article must replace its old pending control, not duplicate the queue');
assert(rows.some(x=>x.product_name==='ZEN'&&x.expected_price===91.5));

console.log('V2.30.5 commercial catch-up + pending retention contract: OK');

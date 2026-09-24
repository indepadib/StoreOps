import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v2304-trades-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_PRICE_READ_MODE='live';
process.env.D365_PROMOTION_READ_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';
process.env.D365_DEFAULT_PRICE_GROUP='Franprix';
process.env.D365_CHANNEL_PRICE_GROUP_ENTITY='RetailChannelPriceGroups';

const seen=[];
const json=value=>new Response(JSON.stringify({value}),{status:200,headers:{'content-type':'application/json'}});
globalThis.fetch=async url=>{
 const u=decodeURIComponent(String(url)).replaceAll('+',' ');seen.push(u);
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/RetailChannelPriceGroups')){
  if(u.includes("10001"))return json([{RetailChannelId:'10001',GroupCode:'Franprix'},{RetailChannelId:'10001',GroupCode:'Franp VF'}]);
  if(u.includes("10002"))return json([{RetailChannelId:'10002',GroupCode:'Franprix'}]);
  return json([]);
 }
 if(u.includes('/data/SalesPriceAgreements')){
  if(u.includes('PriceApplicableFromDate ge 2026-09-24T00:00:00Z')&&u.includes('PriceApplicableFromDate lt 2026-09-25T00:00:00Z')){
   return json([
    {dataAreaId:'5001',RecordId:'A',ItemNumber:'HS-A',Price:10,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'PC',PriceApplicableFromDate:'2026-09-24T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franprix',CustomerAccountNumber:'',PriceWarehouseId:'',PriceSiteId:''},
    {dataAreaId:'5001',RecordId:'B',ItemNumber:'HS-A',Price:9,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'PC',PriceApplicableFromDate:'2026-09-24T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franp VF',CustomerAccountNumber:'',PriceWarehouseId:'',PriceSiteId:''},
    {dataAreaId:'5001',RecordId:'C',ItemNumber:'HS-GLOBAL',Price:20,PriceCurrencyCode:'MAD',SalesPriceQuantity:2,QuantityUnitySymbol:'PC',PriceApplicableFromDate:'2026-09-24T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'',CustomerAccountNumber:'',PriceWarehouseId:'',PriceSiteId:''},
    {dataAreaId:'5001',RecordId:'D',ItemNumber:'HS-CUSTOMER',Price:7,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'PC',PriceApplicableFromDate:'2026-09-24T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franprix',CustomerAccountNumber:'CUST-1',PriceWarehouseId:'',PriceSiteId:''},
    {dataAreaId:'5001',RecordId:'E',ItemNumber:'HS-TR',Price:8,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'PC',PriceApplicableFromDate:'2026-09-24T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franprix',CustomerAccountNumber:'',PriceWarehouseId:'FRP0002',PriceSiteId:''}
   ]);
  }
  return json([]);
 }
 if(u.includes('/data/ReleasedProductsV2'))return json([]);
 throw new Error('Unexpected URL '+u);
};

const {getCommercialPriceChanges}=await import('../services/dynamics-price.mjs');

const vf=await getCommercialPriceChanges('val-fleuri','2026-09-24');
const vfTrades=vf.changes.filter(x=>x.priceSource==='SALES_PRICE_AGREEMENT');
assert.equal(vfTrades.length,3);
assert.equal(vfTrades.filter(x=>x.productNumber==='HS-A').length,2,'Franprix and Franp VF agreements must both remain visible');
assert(vfTrades.some(x=>x.productNumber==='HS-GLOBAL'&&x.expectedPrice===10),'blank/global price group must remain visible and PriceQuantity must be normalized');
assert(!vfTrades.some(x=>x.productNumber==='HS-CUSTOMER'));
assert(!vfTrades.some(x=>x.productNumber==='HS-TR'));
assert(vfTrades.every(x=>/Accord tarifaire/i.test(x.promoLabel)));

const tr=await getCommercialPriceChanges('trefle','2026-09-24');
const trTrades=tr.changes.filter(x=>x.priceSource==='SALES_PRICE_AGREEMENT');
assert.equal(trTrades.length,3);
assert(trTrades.some(x=>x.productNumber==='HS-TR'));
assert(!trTrades.some(x=>x.priceGroup==='Franp VF'));

assert(seen.some(u=>u.includes('PriceApplicableFromDate ge 2026-09-24T00:00:00Z')&&u.includes('PriceApplicableFromDate lt 2026-09-25T00:00:00Z')),'commercial scan must use a DateTime range');
assert(seen.some(u=>u.includes("PriceCustomerGroupCode eq ''")),'commercial scan must include global agreements');

console.log('V2.30.4 Trade Agreements today contract: OK');

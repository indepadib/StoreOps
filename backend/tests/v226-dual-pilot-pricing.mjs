import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v226-pricing-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_PRICE_READ_MODE='live';
process.env.D365_PROMOTION_READ_MODE='live';
process.env.D365_SALES_READ_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';
process.env.D365_DEFAULT_PRICE_GROUP='Franprix';
process.env.D365_CHANNEL_PRICE_GROUP_ENTITY='RetailChannelPriceGroups';
process.env.D365_SALES_ENTITY='RetailTransactionSalesTransBIEntities';
process.env.D365_SALES_STORE_FIELD='store';
process.env.D365_SALES_DATE_FIELD='businessDate';
process.env.D365_SALES_TRANSACTION_FIELD='transactionId';
process.env.D365_SALES_NET_FIELD='netAmountInclTax';
process.env.D365_SALES_QTY_FIELD='qty';
process.env.D365_SALES_PRODUCT_FIELD='itemId';
process.env.D365_SALES_STATUS_FIELD='transactionStatus';
process.env.D365_SALES_SIGN='-1';

const json=value=>new Response(JSON.stringify({value}),{status:200,headers:{'content-type':'application/json'}});
globalThis.fetch=async url=>{
 const u=decodeURIComponent(String(url)).replaceAll('+',' ');
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/RetailChannelPriceGroups')){
  if(u.includes("10001"))return json([{RetailChannelId:'10001',GroupCode:'Franprix'},{RetailChannelId:'10001',GroupCode:'Franp VF'}]);
  if(u.includes("10002"))return json([{RetailChannelId:'10002',GroupCode:'Franprix'}]);
  return json([]);
 }
 if(u.includes('/data/ReleasedProductsV2'))return json([{dataAreaId:'5001',ItemNumber:'HS-AGREE',SalesPrice:12,SalesUnitSymbol:'CF-Pcs',SalesPriceQuantity:1}]);
 if(u.includes('/data/SalesPriceAgreements'))return json([
  {dataAreaId:'5001',RecordId:'A',ItemNumber:'HS-AGREE',Price:10,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'CF-Pcs',PriceApplicableFromDate:'2026-09-01T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franprix',CustomerAccountNumber:'',PriceWarehouseId:'',PriceSiteId:'',WillSearchContinue:'Yes'},
  {dataAreaId:'5001',RecordId:'B',ItemNumber:'HS-AGREE',Price:9,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'CF-Pcs',PriceApplicableFromDate:'2026-09-01T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franp VF',CustomerAccountNumber:'',PriceWarehouseId:'',PriceSiteId:'',WillSearchContinue:'Yes'}
 ]);
 if(u.includes('/data/RetailDiscountLines')||u.includes('/data/RetailDiscounts')||u.includes('/data/RetailDiscountPriceGroups')||u.includes('/data/MixAndMatchLineGroups'))return json([]);
 if(u.includes('/data/RetailTransactionSalesTransBIEntities')){
  const vf=u.includes("store eq 'FRP0001'"),tr=u.includes("store eq 'FRP0002'");
  if(vf)return json([
   {dataAreaId:'5001',store:'FRP0001',businessDate:'2026-09-20T00:00:00Z',transactionId:'VF1',itemId:'HS-AGREE',netAmountInclTax:-20,qty:2,transactionStatus:'NORMAL'},
   {dataAreaId:'5001',store:'FRP0001',businessDate:'2026-09-20T00:00:00Z',transactionId:'VFVOID',itemId:'HS-AGREE',netAmountInclTax:-100,qty:1,transactionStatus:'VOIDED'}
  ]);
  if(tr)return json([{dataAreaId:'5001',store:'FRP0002',businessDate:'2026-09-20T00:00:00Z',transactionId:'TR1',itemId:'HS-AGREE',netAmountInclTax:-30,qty:3,transactionStatus:'NORMAL'}]);
  return json([]);
 }
 throw new Error('Unexpected URL '+u)
};

const {resolveApplicableTradeAgreements}=await import('../services/dynamics-price.mjs');
const {getProductPricing}=await import('../services/dynamics-promotion.mjs');
const {itemPriceHistory}=await import('../services/price-history.mjs');

const expired=resolveApplicableTradeAgreements({rows:[{RecordId:'OLD',Price:10,SalesPriceQuantity:1,QuantityUnitySymbol:'CF-Pcs',PriceApplicableFromDate:'2026-07-13T12:00:00Z',PriceApplicableToDate:'2026-07-31T12:00:00Z',PriceCustomerGroupCode:'Franprix'}],businessDate:'2026-09-22',priceGroups:['Franprix'],warehouseId:'FRP0001',baseUnit:'CF-Pcs'});
assert.equal(expired.status,'NONE');
const historical=resolveApplicableTradeAgreements({rows:[{RecordId:'OLD',Price:10,SalesPriceQuantity:1,QuantityUnitySymbol:'CF-Pcs',PriceApplicableFromDate:'2026-07-13T12:00:00Z',PriceApplicableToDate:'2026-07-31T12:00:00Z',PriceCustomerGroupCode:'Franprix'}],businessDate:'2026-07-20',priceGroups:['Franprix'],warehouseId:'FRP0001',baseUnit:'CF-Pcs'});
assert.equal(historical.status,'UNIQUE');
assert.equal(historical.safePrice,10);

const tr=await getProductPricing('HS-AGREE',{storeId:'trefle',businessDate:'2026-09-20'});
assert.equal(tr.priceGroupContext.retailChannelId,'10002');
assert.deepEqual(tr.priceGroups,['Franprix']);
assert.equal(tr.tradeAgreements.applicability.status,'UNIQUE');
assert.equal(tr.pricingBasis.type,'TRADE_AGREEMENT');
assert.equal(tr.effectiveUnitPrice,10);

const vf=await getProductPricing('HS-AGREE',{storeId:'val-fleuri',businessDate:'2026-09-20'});
assert.equal(vf.priceGroupContext.retailChannelId,'10001');
assert(vf.priceGroups.includes('Franprix')&&vf.priceGroups.includes('Franp VF'));
assert.equal(vf.tradeAgreements.applicability.status,'AMBIGUOUS');
assert.equal(vf.pricingBasis.type,'BASE_PRICE');
assert.equal(vf.effectiveUnitPrice,12);
assert.match(vf.pricingNote,/aucun prix n’est imposé/i);

const vfHistory=await itemPriceHistory({storeId:'val-fleuri',productNumber:'HS-AGREE',businessDate:'2026-09-20',days:7});
assert.equal(vfHistory.observedSales.config.storeIdentifier,'FRP0001');
assert.equal(vfHistory.observedSales.items[0].weightedUnitPrice,10);
assert.equal(vfHistory.observedSales.excluded.voided,1);

const trHistory=await itemPriceHistory({storeId:'trefle',productNumber:'HS-AGREE',businessDate:'2026-09-20',days:7});
assert.equal(trHistory.observedSales.config.storeIdentifier,'FRP0002');
assert.equal(trHistory.observedSales.items[0].weightedUnitPrice,10);

console.log('V2.26 dual-pilot pricing contract: OK');

import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v2306-trades-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_PRICE_READ_MODE='live';
process.env.D365_PRODUCT_READ_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';
process.env.D365_DEFAULT_PRICE_GROUP='Franprix';
process.env.D365_CHANNEL_PRICE_GROUP_ENTITY='RetailChannelPriceGroups';
process.env.D365_PRODUCT_ENTITY='ReleasedProductsV2';
process.env.D365_PRODUCT_NUMBER_FIELD='ProductNumber';
process.env.D365_PRODUCT_NAME_FIELD='ProductName';
process.env.D365_BARCODE_ENTITY='RetailInventItemBarcode';
process.env.D365_BARCODE_PRODUCT_FIELD='itemId';
process.env.D365_BARCODE_DESCRIPTION_FIELD='description';
process.env.D365_BARCODE_FIELD='itemBarCode';

const json=value=>new Response(JSON.stringify({value}),{status:200,headers:{'content-type':'application/json'}});
globalThis.fetch=async url=>{
 const u=decodeURIComponent(String(url)).replaceAll('+',' ');
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/RetailChannelPriceGroups')){
  if(u.includes("10001"))return json([{RetailChannelId:'10001',GroupCode:'Franprix'},{RetailChannelId:'10001',GroupCode:'Franp VF'}]);
  if(u.includes("10002"))return json([{RetailChannelId:'10002',GroupCode:'Franprix'}]);
  return json([]);
 }
 if(u.includes('/data/SalesPriceAgreements')){
  if(u.includes('PriceApplicableFromDate ge 2026-09-24T00:00:00Z')&&u.includes('PriceApplicableFromDate lt 2026-09-25T00:00:00Z')){
   return json([
    {dataAreaId:'5001',RecordId:'A',ItemNumber:'HS-005694',Price:80,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'kg',PriceApplicableFromDate:'2026-09-24T00:00:00Z',PriceApplicableToDate:'2026-10-15T00:00:00Z',PriceCustomerGroupCode:'',CustomerAccountNumber:'',PriceWarehouseId:'',PriceSiteId:'',FromQuantity:0,ToQuantity:0,WillSearchContinue:'Yes'},
    {dataAreaId:'5001',RecordId:'B',ItemNumber:'HS-005927',Price:28.95,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'PC',PriceApplicableFromDate:'2026-09-24T00:00:00Z',PriceApplicableToDate:'2026-09-30T00:00:00Z',PriceCustomerGroupCode:'Franprix',CustomerAccountNumber:'',PriceWarehouseId:'',PriceSiteId:'SITE-1',FromQuantity:1,ToQuantity:12,WillSearchContinue:'No'}
   ]);
  }
  return json([]);
 }
 if(u.includes('/data/ReleasedProductsV2')){
  if(u.includes('SalesPriceDate'))return json([]);
  return json([]);
 }
 if(u.includes('/data/RetailInventItemBarcode')){
  const rows=[];
  if(u.includes("itemId eq 'HS-005694'"))rows.push({itemId:'HS-005694',description:'Melon jaune premium',itemBarCode:'6110000056940'});
  if(u.includes("itemId eq 'HS-005927'"))rows.push({itemId:'HS-005927',description:'Article frais test',itemBarCode:'6110000059279'});
  return json(rows);
 }
 throw new Error('Unexpected URL '+u);
};

const {getCommercialPriceChanges}=await import('../services/dynamics-price.mjs');
const {syncCommercialControls,listCommercialControls}=await import('../services/commercial.mjs');

const result=await getCommercialPriceChanges('val-fleuri','2026-09-24');
const trades=result.changes.filter(x=>x.priceSource==='SALES_PRICE_AGREEMENT');
assert.equal(trades.length,2);
const melon=trades.find(x=>x.productNumber==='HS-005694');
assert(melon);
assert.equal(melon.productName,'Melon jaune premium');
assert.equal(melon.sourceDetails.type,'TRADE_AGREEMENT');
assert.equal(melon.sourceDetails.recordId,'A');
assert.equal(melon.sourceDetails.price,80);
assert.equal(melon.sourceDetails.currency,'MAD');
assert.equal(melon.sourceDetails.priceQuantity,1);
assert.equal(melon.sourceDetails.unit,'kg');
assert.equal(melon.sourceDetails.normalizedUnitPrice,80);
assert.equal(melon.sourceDetails.priceGroup,null);
assert.equal(melon.sourceDetails.validFrom,'2026-09-24T00:00:00Z');
assert.equal(melon.sourceDetails.validTo,'2026-10-15T00:00:00Z');
assert.equal(melon.sourceDetails.productName,'Melon jaune premium');
assert.equal(melon.ean,'6110000056940');
assert.equal(melon.sourceDetails.ean,'6110000056940');
assert.match(melon.sourceDetails.productNameSource,/RetailInventItemBarcode/);

const diag=result.diagnostics.sources.find(x=>x.source==='PRODUCT_IDENTITY');
assert.equal(diag.status,'READY');
assert.equal(diag.resolved,2);

const synced=syncCommercialControls({storeId:'val-fleuri',businessDate:'2026-09-24',changes:result.changes});
assert(synced.inserted>=2);
const rows=listCommercialControls('val-fleuri','2026-09-24');
const persisted=rows.find(x=>x.product_number==='HS-005694');
assert(persisted);
assert.equal(persisted.product_name,'Melon jaune premium');
assert.equal(persisted.sourceDetails.type,'TRADE_AGREEMENT');
assert.equal(persisted.sourceDetails.recordId,'A');
assert.equal(persisted.sourceDetails.unit,'kg');

console.log('V2.30.6 Trade Agreement names/details contract: OK');

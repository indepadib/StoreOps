import assert from 'node:assert/strict';

process.env.STOREOPS_DB='/tmp/storeops-v206-channel-price-groups.db';
process.env.STOREOPS_REAL_ONLY='true';
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

let processingStatus='Processed';
globalThis.fetch=async url=>{
  const u=String(url);
  if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
  if(u.includes('/data/RetailChannelPriceGroups'))return new Response(JSON.stringify({value:[
    {RetailChannelId:'10001',GroupCode:'Franprix'},
    {RetailChannelId:'10001',GroupCode:'VF_DLC'}
  ]}),{status:200,headers:{'content-type':'application/json'}});
  if(u.includes('/data/RetailDiscountPriceGroups')){
    if(u.includes('OfferId'))return new Response(JSON.stringify({value:[{OfferId:'5001-NEW',PriceGroupId:'VF_DLC'}]}),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({value:[{OfferId:'5001-NEW',PriceGroupId:'VF_DLC'}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(u.includes('/data/RetailDiscounts'))return new Response(JSON.stringify({value:[{
    OfferId:'5001-NEW',Name:'Promo Val Fleuri',Status:'Enabled',ProcessingStatus:processingStatus,
    ValidFrom:'2026-09-18T00:00:00Z',ValidTo:'2026-09-30T00:00:00Z',
    PeriodicDiscountType:'Discount',DiscountPercentValue:10
  }]}),{status:200,headers:{'content-type':'application/json'}});
  if(u.includes('/data/RetailDiscountLines'))return new Response(JSON.stringify({value:[{
    OfferId:'5001-NEW',LineNum:1,LineType:'Include',ItemId:'HS-TEST',Name:'Article Test',
    OfferDiscountMethod:'PercentOff',OfferDiscountPercentage:10,CategoryName:'Test'
  }]}),{status:200,headers:{'content-type':'application/json'}});
  if(u.includes('/data/SalesPriceAgreements'))return new Response(JSON.stringify({value:[]}),{status:200,headers:{'content-type':'application/json'}});
  if(u.includes('/data/ReleasedProductsV2'))return new Response(JSON.stringify({value:[]}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error('Unexpected URL '+u);
};

const {resolveStorePriceGroups,getCommercialChanges}=await import('../services/dynamics.mjs');
const {getRetailPromotionsByItem}=await import('../services/dynamics-promotion.mjs');

const groups=await resolveStorePriceGroups('val-fleuri',{force:true});
assert.equal(groups.retailChannelId,'10001');
assert.equal(groups.source,'D365_RETAIL_CHANNEL');
assert(groups.groups.includes('Franprix'));
assert(groups.groups.includes('VF_DLC'));

const commercial=await getCommercialChanges('val-fleuri','2026-09-18');
const promo=commercial.find(x=>x.productNumber==='HS-TEST');
assert(promo,'Store commercial feed must include promo from Val Fleuri specific price group');
assert(promo.priceGroups.includes('VF_DLC'));
assert.equal(promo.retailChannelId,'10001');

const item=await getRetailPromotionsByItem('HS-TEST',{storeId:'val-fleuri',businessDate:'2026-09-18',productName:'Article Test',productCategory:'Test'});
assert(item.priceGroups.includes('VF_DLC'));
assert(item.promotions.some(x=>x.offerId==='5001-NEW'&&x.activeForRequestedContext===true),'Item scan must activate promo from channel-specific price group');

processingStatus='NotProcessed';
const pending=await getCommercialChanges('val-fleuri','2026-09-18');
const diag=pending.find(x=>x.source==='D365_RETAIL_PRICING_DIAGNOSTIC');
assert(diag,'Unprocessed channel promo must surface a diagnostic instead of disappearing');
assert.match(diag.promoLabel,/pas encore traitée/i);
assert.equal(diag.blockingOpening,false);

console.log('V2.06 channel price groups contract: OK');

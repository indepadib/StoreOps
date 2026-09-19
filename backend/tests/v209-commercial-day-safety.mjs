import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v209-commercial-day-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_PRICE_READ_MODE='live';
process.env.D365_PROMOTION_READ_MODE='simulated';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';
process.env.D365_DEFAULT_PRICE_GROUP='Franprix';

let seenChannelPriceGroups=false;
globalThis.fetch=async url=>{
  const u=String(url);
  if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
  if(u.includes('/data/RetailChannelPriceGroups')){
    seenChannelPriceGroups=true;
    return new Response(JSON.stringify({value:[
      {RetailChannelId:'10001',GroupCode:'Franprix'},
      {RetailChannelId:'10001',GroupCode:'VF_SPECIAL'}
    ]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(u.includes('/data/SalesPriceAgreements')){
    return new Response(JSON.stringify({value:[
      {RecordId:'TA-1',dataAreaId:'5001',ItemNumber:'SKU-1',Price:12.5,PriceCurrencyCode:'MAD',PriceApplicableFromDate:'2026-09-19',PriceApplicableToDate:'2026-09-30',PriceCustomerGroupCode:'VF_SPECIAL'}
    ]}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(u.includes('/data/ReleasedProductsV2')){
    return new Response(JSON.stringify({value:[]}),{status:200,headers:{'content-type':'application/json'}});
  }
  throw new Error('Unexpected URL '+u)
};

await import('../services/pilot-profile.mjs');
const {db,todayISO}=await import('../db.mjs');
const {syncCommercialControls,listCommercialControls,commercialSummary}=await import('../services/commercial.mjs');
const {getCommercialPriceChanges}=await import('../services/dynamics-price.mjs');

assert.equal(todayISO('Africa/Casablanca',new Date('2026-09-18T23:30:00Z')),'2026-09-19','Morocco business day must not lag behind UTC at midnight');

for(const t of ['commercial_controls','commercial_source_state'])db.prepare(`DELETE FROM ${t}`).run();

const oldDay='2026-09-18',today='2026-09-19',storeId='val-fleuri';
const oldChange={sourceKey:`D365-PRICE-AGREEMENT-OLD-${oldDay}`,stableKey:'D365-PRICE-AGREEMENT:OLD',fingerprint:'OLD|SKU-OLD|10',actionType:'PRICE_CHANGE',ean:'ITEM:SKU-OLD',productNumber:'SKU-OLD',productName:'Article non contrôlé',expectedPrice:10,promoLabel:'Prix à changer',signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,storeId,source:'D365_RETAIL_PRICING',effectiveFrom:oldDay};
syncCommercialControls({storeId,businessDate:oldDay,changes:[oldChange]});
let oldRows=listCommercialControls(storeId,oldDay);
assert.equal(oldRows.length,1);
assert.equal(oldRows[0].status,'PENDING');

let r=syncCommercialControls({storeId,businessDate:today,changes:[]});
assert.equal(r.removed,0,'refresh must never delete unresolved controls');
let rows=listCommercialControls(storeId,today);
assert.equal(rows.length,1,'yesterday unresolved control must carry into today');
assert.equal(rows[0].product_number,'SKU-OLD');
assert.equal(rows[0].carried_from_business_date,oldDay);
assert.equal(commercialSummary(storeId,today).blocking,1);

const sameDay={sourceKey:`D365-PRICE-AGREEMENT-TODAY-${today}`,stableKey:'D365-PRICE-AGREEMENT:TODAY',fingerprint:'TODAY|SKU-TODAY|11',actionType:'PRICE_CHANGE',ean:'ITEM:SKU-TODAY',productNumber:'SKU-TODAY',productName:'Article du jour',expectedPrice:11,promoLabel:'Prix du jour',signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,storeId,source:'D365_RETAIL_PRICING',effectiveFrom:today};
syncCommercialControls({storeId,businessDate:today,changes:[sameDay]});
syncCommercialControls({storeId,businessDate:today,changes:[]});
rows=listCommercialControls(storeId,today);
assert(rows.some(x=>x.product_number==='SKU-TODAY'),'same-day unresolved control must survive an empty Dynamics refresh');

const priceResult=await getCommercialPriceChanges(storeId,today);
assert.equal(seenChannelPriceGroups,true,'trade agreement price read must resolve channel price groups even when promotion read is not live');
assert(priceResult.diagnostics.priceGroups.includes('VF_SPECIAL'));
const changed=priceResult.changes.find(x=>x.productNumber==='SKU-1');
assert(changed,'trade agreement from channel-specific price group must surface');
assert.equal(changed.expectedPrice,12.5);
assert.equal(changed.priceGroup,'VF_SPECIAL');

const server=(await import('node:fs/promises')).readFile(new URL('../server.mjs',import.meta.url),'utf8');
const serverText=await server;
assert.match(serverText,/\/api\/commercial\/network\/sync/,'director network commercial refresh endpoint missing');
assert.match(serverText,/Promise\.allSettled\(stores\.map\(store=>refreshCommercial/,'network refresh must execute every active store independently');

const frontend=(await import('node:fs/promises')).readFile(new URL('../../frontend/js/commercial-live-refresh.js',import.meta.url),'utf8');
const frontText=await frontend;
assert.match(frontText,/businessDayToday\(\)/,'commercial throttle must be scoped by local business day');
assert.match(frontText,/refreshCommercialNetworkLive/,'network commercial background refresh missing');

console.log('V2.09 commercial day safety contract: OK');

import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v208-price-history-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_PRICE_READ_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';

globalThis.fetch=async url=>{
 const u=String(url);
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/ReleasedProductsV2'))return new Response(JSON.stringify({value:[{dataAreaId:'5001',ItemNumber:'HS-TEST',SalesPrice:19.9,SalesUnitSymbol:'PC',SalesPriceQuantity:1}]}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/CustomPriceHistory'))return new Response(JSON.stringify({value:[
  {dataAreaId:'5001',SKU:'HS-TEST',Amount:17.9,StartDate:'2026-09-01T00:00:00Z',EndDate:'2026-09-10T00:00:00Z',Currency:'MAD',GroupId:'Franprix',Qty:1,UOM:'PC',Rec:'1'},
  {dataAreaId:'5001',SKU:'HS-TEST',Amount:19.9,StartDate:'2026-09-11T00:00:00Z',EndDate:null,Currency:'MAD',GroupId:'Franprix',Qty:1,UOM:'PC',Rec:'2'}
 ]}),{status:200,headers:{'content-type':'application/json'}});
 throw new Error('Unexpected URL '+u)
};

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {saveD365PriceHistoryMappingDraft,d365PriceHistoryMappingSettings,evaluateD365PriceHistorySmokeRows,activateD365PriceHistoryMapping,disableD365PriceHistoryMapping}=await import('../services/d365-price-history-mapping.mjs');
const {getSalesPriceAgreementsByItem}=await import('../services/dynamics-price.mjs');
const {normalizeAgreementHistory}=await import('../services/price-history.mjs');

const actor=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
assert(actor,'admin required');
db.prepare(`DELETE FROM d365_price_history_mapping_settings`).run();

const mapping={entity:'CustomPriceHistory',fields:{item:'SKU',price:'Amount',validFrom:'StartDate',validTo:'EndDate',currency:'Currency',priceGroup:'GroupId',quantity:'Qty',unit:'UOM',recordId:'Rec',customer:'',warehouse:'',site:''}};
let saved=saveD365PriceHistoryMappingDraft({actor,input:mapping});
assert.equal(saved.state,'DRAFT');
assert.throws(()=>activateD365PriceHistoryMapping({actor}),e=>e.code==='D365_PRICE_HISTORY_MAPPING_NOT_VALIDATED');

const raw=[
 {SKU:'HS-TEST',Amount:17.9,StartDate:'2026-09-01T00:00:00Z',EndDate:'2026-09-10T00:00:00Z',Currency:'MAD',GroupId:'Franprix'},
 {SKU:'HS-TEST',Amount:19.9,StartDate:'2026-09-11T00:00:00Z',EndDate:null,Currency:'MAD',GroupId:'Franprix'}
];
const smoke=evaluateD365PriceHistorySmokeRows({rows:raw,mapping,productNumber:'HS-TEST',filtered:true});
assert.equal(smoke.status,'PASSED');
assert.equal(smoke.matchingRows,2);
assert.equal(smoke.distinctPrices,2);
assert.equal(smoke.distinctDates,2);

db.prepare(`UPDATE d365_price_history_mapping_settings SET state='VALIDATED',smoke_json=?,validated_at=CURRENT_TIMESTAMP,validated_by=? WHERE id='default'`).run(JSON.stringify(smoke),actor.id);
saved=activateD365PriceHistoryMapping({actor});
assert.equal(saved.state,'LIVE');

const payload=await getSalesPriceAgreementsByItem('HS-TEST');
assert.equal(payload.mappingSource,'STOREOPS_VALIDATED_MAPPING');
assert.equal(payload.entity,'CustomPriceHistory');
assert.equal(payload.rowCount,2);
assert.equal(payload.rows[0].ItemNumber,'HS-TEST');
assert.equal(payload.rows[0].Price,17.9);
assert.equal(payload.rows[0].PriceApplicableFromDate,'2026-09-01T00:00:00Z');
const history=normalizeAgreementHistory(payload);
assert.equal(history.length,2);
assert.equal(history[0].price,19.9);
assert.equal(history[0].from,'2026-09-11');
assert.equal(history[1].price,17.9);
assert.equal(history[1].to,'2026-09-10');

saved=disableD365PriceHistoryMapping({actor});
assert.equal(saved.state,'DISABLED');
assert.equal(d365PriceHistoryMappingSettings().state,'DISABLED');

const bad=evaluateD365PriceHistorySmokeRows({rows:[{SKU:'HS-TEST',Amount:17.9}],mapping,productNumber:'HS-TEST'});
assert.equal(bad.status,'FAILED');
assert(bad.missingInPayload.includes('validFrom'));

console.log('V2.08 price history mapping contract: OK');

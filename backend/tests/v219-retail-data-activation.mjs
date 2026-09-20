import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB=`/tmp/storeops-v219-retail-activation-${process.pid}.db`;
process.env.STOREOPS_MEDIA_DIR=`/tmp/storeops-v219-retail-activation-media-${process.pid}`;
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
 if(u.includes('/data/ReleasedProductsV2'))return new Response(JSON.stringify({value:[{dataAreaId:'5001',ItemNumber:'HS-AUTO',SalesPrice:21.5,SalesUnitSymbol:'PC',SalesPriceQuantity:1}]}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/SalesPriceAgreements'))return new Response(JSON.stringify({value:[
  {dataAreaId:'5001',ItemNumber:'HS-AUTO',Price:18.9,PriceApplicableFromDate:'2026-08-01T00:00:00Z',PriceApplicableToDate:'2026-09-10T00:00:00Z',PriceCurrencyCode:'MAD',PriceCustomerGroupCode:'Franprix',SalesPriceQuantity:1,QuantityUnitySymbol:'PC',RecordId:'A1'},
  {dataAreaId:'5001',ItemNumber:'HS-AUTO',Price:19.9,PriceApplicableFromDate:'2026-09-11T00:00:00Z',PriceApplicableToDate:null,PriceCurrencyCode:'MAD',PriceCustomerGroupCode:'Franprix',SalesPriceQuantity:1,QuantityUnitySymbol:'PC',RecordId:'A2'}
 ]}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/SalesTradeAgreementLines'))return new Response(JSON.stringify({value:[]}),{status:200,headers:{'content-type':'application/json'}});
 throw new Error('Unexpected URL '+u)
};

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {ensureD365PriceHistoryAutoConnected,clearD365PriceHistoryAutoConnectCache}=await import('../services/d365-price-history-autoconnect.mjs');
const {d365PriceHistoryMappingSettings,disableD365PriceHistoryMapping}=await import('../services/d365-price-history-mapping.mjs');
const {getSalesPriceAgreementsByItem}=await import('../services/dynamics-price.mjs');

db.prepare(`DELETE FROM d365_price_history_mapping_settings`).run();
clearD365PriceHistoryAutoConnectCache();

const activated=await ensureD365PriceHistoryAutoConnected('HS-AUTO');
assert.equal(activated.status,'LIVE');
assert.equal(activated.connected,true);
assert.equal(activated.mapping.state,'LIVE');
assert.equal(activated.mapping.smoke.status,'PASSED');
assert.equal(activated.mapping.entity,'SalesPriceAgreements');
assert.equal(activated.mapping.fields.item,'ItemNumber');
assert.equal(activated.mapping.fields.price,'Price');
assert.equal(activated.mapping.fields.validFrom,'PriceApplicableFromDate');

const persisted=d365PriceHistoryMappingSettings();
assert.equal(persisted.state,'LIVE');
const payload=await getSalesPriceAgreementsByItem('HS-AUTO');
assert.equal(payload.mode,'LIVE');
assert.equal(payload.mappingSource,'STOREOPS_VALIDATED_MAPPING');
assert.equal(payload.rowCount,2);
assert.equal(payload.rows[0].Price,18.9);

const cached=await ensureD365PriceHistoryAutoConnected('HS-AUTO');
assert.equal(cached.connected,true);
assert.equal(cached.cached,true);

disableD365PriceHistoryMapping({actor:null});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const scan=readFileSync(path.join(root,'frontend/js/pages/manager-scan.js'),'utf8');
const home=readFileSync(path.join(root,'frontend/js/pages/manager-home.js'),'utf8');
const api=readFileSync(path.join(root,'backend/services/price-history-api.mjs'),'utf8');
assert.match(scan,/price-history\/auto-connect\?days=90/);
assert.match(scan,/SMOKE_FAILED/);
assert.match(api,/ensureD365PriceHistoryAutoConnected/);
assert.match(home,/Ventes détectées, validation à corriger/);
assert.match(home,/NOT_DISCOVERED/);
assert.match(home,/autoConnect:healed\?\.autoConnect/);

console.log('V2.19 retail data activation contract: OK');

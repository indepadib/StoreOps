import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';

const dbPath=`/tmp/storeops-v218-pulse-${process.pid}.db`;rmSync(dbPath,{force:true});
Object.assign(process.env,{
 STOREOPS_DB:dbPath,
 D365_MODE:'live',
 D365_BASE_URL:'https://example.operations.dynamics.com',
 D365_TENANT_ID:'tenant',
 D365_CLIENT_ID:'client',
 D365_CLIENT_SECRET:'secret',
 D365_DATA_AREA_ID:'5001',
 D365_DATA_AREA_FIELD:'dataAreaId',
 D365_STORE_RETAIL_IDS:'',
 D365_STORE_WAREHOUSES:'val-fleuri=FRP0001,trefle=FRP0002'
});

const vfRows=[
 {RetailChannelId:'10001',StoreNumber:'FRP0001',BusinessDate:'2026-09-20T09:00:00Z',TransactionId:'VF-1',ItemId:'HS-1',NetAmountInclTax:-100,Qty:2,CostAmount:-60,TransactionTime:'09:15:00',ItemName:'Article VF'}
];
const trRows=[
 {RetailChannelId:'20022',StoreNumber:'FRP0002',BusinessDate:'2026-09-20T10:00:00Z',TransactionId:'TR-1',ItemId:'HS-2',NetAmountInclTax:-80,Qty:1,CostAmount:-45,TransactionTime:'10:05:00',ItemName:'Article Trèfle'}
];
globalThis.fetch=async input=>{
 const url=String(input);
 if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'test-token',expires_in:3600});
 const u=new URL(url),filter=decodeURIComponent(u.searchParams.get('$filter')||'');
 if(u.pathname.includes('/data/RetailStoreEntity')){
  if(filter.includes('FRP0002'))return Response.json({value:[{StoreNumber:'FRP0002',RetailChannelId:'20022',OperatingUnitNumber:'00000064',WarehouseId:'FRP0002',dataAreaId:'5001',Name:'Franprix Trefles'}]});
  if(filter.includes('FRP0001'))return Response.json({value:[{StoreNumber:'FRP0001',RetailChannelId:'10001',OperatingUnitNumber:'00000063',WarehouseId:'FRP0001',dataAreaId:'5001',Name:'Franprix ValFleuri'}]});
  return Response.json({value:[]});
 }
 if(u.pathname.includes('/data/RetailTransactionSalesTransBIEntities')){
  if(filter.includes('10001')||filter.includes('FRP0001'))return Response.json({value:vfRows});
  if(filter.includes('20022')||filter.includes('FRP0002'))return Response.json({value:trRows});
  return Response.json({value:[...vfRows,...trRows]});
 }
 return Response.json({value:[]});
};

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {storeOperationalSettings}=await import('../services/store-settings.mjs');
const {resolveStoreSalesChannel}=await import('../services/d365-sales-channel.mjs');
const {saveD365SalesMappingDraft,smokeD365SalesMapping,activateD365SalesMapping,d365SalesStoreValidation}=await import('../services/d365-sales-mapping.mjs');
const {ensureD365SalesAutoConnected,clearD365SalesAutoConnectCache}=await import('../services/d365-sales-autoconnect.mjs');
const {salesIntegrationConfig}=await import('../services/dynamics-sales.mjs');

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
assert(admin,'Admin StoreOps must exist');

let trefle=storeOperationalSettings('trefle');
assert.equal(trefle.storeWarehouseId,'FRP0002');
assert.equal(trefle.d365.storeNumber,'FRP0002');
assert.equal(trefle.d365.retailChannelId,null,'Trèfle Retail Channel ID must never be guessed');
assert.notEqual(trefle.d365.retailChannelId,'10002');
assert.equal(resolveStoreSalesChannel('trefle',{channelField:'StoreNumber'}).value,'FRP0002');
assert.equal(resolveStoreSalesChannel('trefle',{channelField:'RetailChannelId'}).value,null);

const mapping={
 entity:'RetailTransactionSalesTransBIEntities',
 fields:{channel:'RetailChannelId',businessDate:'BusinessDate',transaction:'TransactionId',product:'ItemId',net:'NetAmountInclTax',quantity:'Qty',cost:'CostAmount',time:'TransactionTime',productName:'ItemName',department:'',category:''},
 dateFilterMode:'datetime',salesSign:-1,quantitySign:1,costSign:-1
};
saveD365SalesMappingDraft({actor:admin,input:mapping});
const vfSmoke=await smokeD365SalesMapping({actor:admin,storeId:'val-fleuri'});
assert.equal(vfSmoke.smoke.status,'PASSED');
activateD365SalesMapping({actor:admin});
assert.equal(d365SalesStoreValidation('val-fleuri')?.state,'PASSED');
assert.equal(d365SalesStoreValidation('trefle'),null,'Val Fleuri smoke must not validate Trèfle');

let cfg=salesIntegrationConfig('trefle');
assert(cfg.missing.includes('storeMapping'),'Trèfle must remain unavailable while its retail channel is unknown');
assert(cfg.missing.includes('storeSmoke'));

clearD365SalesAutoConnectCache('trefle');
const connected=await ensureD365SalesAutoConnected('trefle');
assert.equal(connected.connected,true);
assert.equal(connected.status,'LIVE');
trefle=storeOperationalSettings('trefle');
assert.equal(trefle.d365.retailChannelId,'20022','true D365 channel must be persisted after strict store match');
assert.notEqual(trefle.d365.retailChannelId,'10002');
assert.equal(d365SalesStoreValidation('trefle')?.state,'PASSED');

cfg=salesIntegrationConfig('trefle');
assert.equal(cfg.retailId,'20022');
assert.equal(cfg.channelKind,'RETAIL_CHANNEL');
assert.equal(cfg.ready,true);
assert.equal(cfg.missing.length,0);

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const networkRoute=server.match(/if\(path==='\/api\/network'\)\{[\s\S]*?return json\(req,res,200,rows\)\n  \}/)?.[0]||'';
assert(networkRoute,'network route missing');
assert.doesNotMatch(networkRoute,/refreshCommercial/,'network read must not wait for Dynamics commercial refresh');
assert.match(networkRoute,/getManagerHomeFast/,'network must use one local manager snapshot per store');
assert.match(networkRoute,/staffing:fast\.staff/);

const networkUi=readFileSync(new URL('../../frontend/js/pages/network.js',import.meta.url),'utf8');
const pulseApi=readFileSync(new URL('../services/business-pulse-api.mjs',import.meta.url),'utf8');
const storeSettings=readFileSync(new URL('../services/store-settings.mjs',import.meta.url),'utf8');
assert.match(networkUi,/BUSINESS PULSE RÉSEAU/);
assert.match(networkUi,/Val Fleuri & Trèfle/);
assert.match(networkUi,/\/api\/network\/business-pulse/);
assert.doesNotMatch(networkUi,/Promise\.all\(base\.map/,'network frontend must not fan out five calls per store');
assert.match(pulseApi,/\/api\/network\/business-pulse\/auto-connect/);
assert.match(pulseApi,/mappedNetworkStores/);
assert.doesNotMatch(storeSettings,/retailChannelId:'10002'/);

console.log('V2.18 Val Fleuri + Trèfle Business Pulse contract passed');

import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';

const dbPath=`/tmp/storeops-v216-operational-${process.pid}.db`;
rmSync(dbPath,{force:true});
Object.assign(process.env,{
 STOREOPS_DB:dbPath,
 STOREOPS_REAL_ONLY:'false',
 D365_MODE:'live',
 D365_SALES_READ_MODE:'simulated',
 D365_RECEIVING_READ_MODE:'live',
 D365_BASE_URL:'https://example.operations.dynamics.com',
 D365_TENANT_ID:'tenant',
 D365_CLIENT_ID:'client',
 D365_CLIENT_SECRET:'secret',
 D365_DATA_AREA_ID:'5001',
 D365_DATA_AREA_FIELD:'dataAreaId',
 D365_STORE_WAREHOUSES:'val-fleuri=FRP0001',
 D365_PO_LINE_ENTITY:'PurchaseOrderLinesV2',
 D365_PO_HEADER_ENTITY:'PurchaseOrderHeadersV2'
});

const salesRows=[
 {RetailChannelId:'10001',BusinessDate:'2026-09-19T09:00:00Z',TransactionId:'T-1',ItemId:'HS-1',NetAmountInclTax:-100,Qty:2,CostAmount:-60,TransactionTime:'09:15:00',ItemName:'Article A'},
 {RetailChannelId:'10001',BusinessDate:'2026-09-19T10:00:00Z',TransactionId:'T-2',ItemId:'HS-2',NetAmountInclTax:-50,Qty:1,CostAmount:-30,TransactionTime:'10:05:00',ItemName:'Article B'}
];
const calls=[];
globalThis.fetch=async(input)=>{
 const url=String(input);calls.push(url);
 if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'test-token',expires_in:3600});
 if(url.includes('/data/RetailTransactionSalesTransBIEntities'))return Response.json({value:salesRows});
 if(url.includes('/data/PurchaseOrderLinesV2')){
  if(url.includes('ReceivingWarehouseId'))return Response.json({error:{message:'Field ReceivingWarehouseId does not exist'}},{status:400});
  if(url.includes('InventoryWarehouseId'))return Response.json({value:[
   {dataAreaId:'5001',PurchaseOrderNumber:'PO-216',LineNumber:1,ItemNumber:'HS-001',LineDescription:'Article PO',OrderedPurchaseQuantity:10,ReceivedPurchaseQuantity:2,RemainingPurchaseQuantity:8,PurchaseUnitSymbol:'PC',RequestedDeliveryDate:'2026-09-19T12:00:00Z',InventoryWarehouseId:'FRP0001'}
  ]});
  return Response.json({value:[]});
 }
 if(url.includes('/data/PurchaseOrderHeadersV2'))return Response.json({value:[
  {dataAreaId:'5001',PurchaseOrderNumber:'PO-216',OrderVendorAccountNumber:'V-01',PurchaseOrderStatus:'OpenOrder',RequestedDeliveryDate:'2026-09-19T12:00:00Z',DefaultReceivingWarehouseId:'FRP0001'}
 ]});
 throw new Error(`Unexpected URL ${url}`)
};

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {ensureD365SalesAutoConnected}=await import('../services/d365-sales-autoconnect.mjs');
db.prepare(`DELETE FROM d365_sales_mapping_settings`).run();
const {salesIntegrationConfig}=await import('../services/dynamics-sales.mjs');
const sales=await ensureD365SalesAutoConnected('val-fleuri');
assert.equal(sales.connected,true,'sales mapping should auto-connect only after a passing smoke');
assert.equal(sales.status,'LIVE');
const salesCfg=salesIntegrationConfig('val-fleuri');
assert.equal(salesCfg.mode,'LIVE');
assert.equal(salesCfg.retailId,'10001');
assert.equal(salesCfg.mappingState,'LIVE');
assert.equal(salesCfg.fields.store,'RetailChannelId');

const receiving=await import('../services/dynamics-receiving.mjs');
const snapshot=await receiving.listExpectedPurchaseOrders('val-fleuri',{businessDate:'2026-09-19'});
assert.equal(snapshot.mode,'LIVE');
assert.equal(snapshot.items.length,1);
assert.equal(snapshot.items[0].poNumber,'PO-216');
assert.equal(snapshot.diagnostics.warehouseField,'InventoryWarehouseId','receiving must recover when the configured/default warehouse field is rejected by D365');
assert(snapshot.diagnostics.filterFallbacks.length>0);
assert(calls.some(x=>x.includes('ReceivingWarehouseId')));
assert(calls.some(x=>x.includes('InventoryWarehouseId')));

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const storesUi=readFileSync(new URL('../../frontend/js/admin-studio-stores.js',import.meta.url),'utf8');
const managerHome=readFileSync(new URL('../../frontend/js/pages/manager-home.js',import.meta.url),'utf8');
const auth=readFileSync(new URL('../../frontend/js/auth-entry.js',import.meta.url),'utf8');
assert.match(server,/handleStoreSettingsApi/,'Store Settings handler must be wired into the real server');
assert.match(server,/storeSettingsResponse=await handleStoreSettingsApi/);
assert.match(storesUi,/Promise\.allSettled/,'Store Settings must survive optional directory/catalog failures');
assert.match(storesUi,/storesResult\.status!=='fulfilled'/);
assert.match(managerHome,/business-pulse\/auto-connect/,'Today must trigger guarded sales self-heal');
assert.match(auth,/BUILD_LABEL='\d+\.\d+\.\d+'/,'release label must remain explicit without freezing future releases');

console.log('V2.16 operational fixes contract passed');

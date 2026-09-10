import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

const dbPath='/tmp/storeops-d365-receiving-test.db';
rmSync(dbPath,{force:true});
Object.assign(process.env,{
 STOREOPS_DB:dbPath,
 D365_MODE:'live',
 D365_RECEIVING_READ_MODE:'live',
 D365_BASE_URL:'https://example.operations.dynamics.com',
 D365_TENANT_ID:'tenant',
 D365_CLIENT_ID:'client',
 D365_CLIENT_SECRET:'secret',
 D365_DATA_AREA_ID:'5001',
 D365_STORE_WAREHOUSES:'val-fleuri=FRP0001',
 D365_PO_HEADER_ENTITY:'PurchaseOrderHeadersV2',
 D365_PO_LINE_ENTITY:'PurchaseOrderLinesV2'
});

const calls=[];
globalThis.fetch=async(input)=>{
 const url=String(input);calls.push(url);
 if(url.includes('login.microsoftonline.com'))return Response.json({access_token:'test-token',expires_in:3600});
 if(url.includes('/data/PurchaseOrderLinesV2'))return Response.json({value:[
  {dataAreaId:'5001',PurchaseOrderNumber:'PO-100',LineNumber:1,ProductNumber:'HS-001',LineDescription:'Lait frais',Barcode:'611100000001',ProcurementProductCategoryName:'Frais',OrderedPurchaseQuantity:10,ReceivedPurchaseQuantity:2,RemainingPurchaseQuantity:8,PurchaseUnitSymbol:'pc',RequestedDeliveryDate:'2026-09-10T12:00:00Z',ReceivingWarehouseId:'FRP0001'},
  {dataAreaId:'5001',PurchaseOrderNumber:'PO-100',LineNumber:2,ProductNumber:'HS-002',LineDescription:'Épicerie test',Barcode:'611100000002',ProcurementProductCategoryName:'Épicerie',OrderedPurchaseQuantity:5,ReceivedPurchaseQuantity:0,RemainingPurchaseQuantity:5,PurchaseUnitSymbol:'pc',RequestedDeliveryDate:'2026-09-10T12:00:00Z',ReceivingWarehouseId:'FRP0001'},
  {dataAreaId:'5001',PurchaseOrderNumber:'PO-CLOSED',LineNumber:1,ProductNumber:'HS-003',LineDescription:'Déjà reçu',Barcode:'611100000003',ProcurementProductCategoryName:'Épicerie',OrderedPurchaseQuantity:4,ReceivedPurchaseQuantity:4,RemainingPurchaseQuantity:0,PurchaseUnitSymbol:'pc',RequestedDeliveryDate:'2026-09-09T12:00:00Z',ReceivingWarehouseId:'FRP0001'}
 ]});
 if(url.includes('/data/PurchaseOrderHeadersV2'))return Response.json({value:[
  {dataAreaId:'5001',PurchaseOrderNumber:'PO-100',OrderVendorAccountNumber:'VEND-01',PurchaseOrderStatus:'OpenOrder',RequestedDeliveryDate:'2026-09-10T12:00:00Z',DefaultReceivingWarehouseId:'FRP0001'}
 ]});
 throw new Error(`Unexpected URL ${url}`);
};

const receiving=await import(`../services/dynamics-receiving.mjs?test=${Date.now()}`);
const {db}=await import('../db.mjs');
const snapshot=await receiving.listExpectedPurchaseOrders('val-fleuri',{businessDate:'2026-09-10'});
assert.equal(snapshot.mode,'LIVE');
assert.equal(snapshot.warehouseId,'FRP0001');
assert.equal(snapshot.items.length,1);
assert.equal(snapshot.items[0].poNumber,'PO-100');
assert.equal(snapshot.items[0].vendor,'VEND-01');
assert.equal(snapshot.items[0].lines.length,2);
assert.equal(snapshot.items[0].lines[0].remainingQty,8);
assert.equal(snapshot.items[0].lines[0].temperatureRequired,1);
assert.ok(calls.some(x=>x.includes('ReceivingWarehouseId')&&x.includes('FRP0001')),'PO lines must be scoped to the store warehouse');

const sync=await receiving.syncExpectedReceiptsFromDynamics('val-fleuri',{businessDate:'2026-09-10'});
assert.equal(sync.synced,true);
assert.equal(sync.created,1);
assert.equal(sync.lineCreated,2);
const receipt=db.prepare(`SELECT * FROM receipts WHERE po_number='PO-100'`).get();
assert.equal(receipt.source,'D365');
assert.equal(receipt.source_warehouse_id,'FRP0001');
assert.equal(receipt.vendor,'VEND-01');
const lines=db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? ORDER BY source_line_number`).all(receipt.id);
assert.equal(lines.length,2);
assert.equal(lines[0].product_number,'HS-001');
assert.equal(lines[0].remaining_qty,8);
assert.equal(lines[0].ean,'611100000001');

// A second sync updates source data without losing operational quality-control fields.
db.prepare(`UPDATE receipt_lines SET delivered_qty=8,accepted_qty=8,rejected_qty=0 WHERE id=?`).run(lines[0].id);
const sync2=await receiving.syncExpectedReceiptsFromDynamics('val-fleuri',{businessDate:'2026-09-10'});
assert.equal(sync2.created,0);
assert.equal(sync2.updated,1);
const preserved=db.prepare(`SELECT * FROM receipt_lines WHERE id=?`).get(lines[0].id);
assert.equal(preserved.delivered_qty,8);
assert.equal(preserved.accepted_qty,8);

const unmapped=await receiving.listExpectedPurchaseOrders('carita',{businessDate:'2026-09-10'});
assert.equal(unmapped.mode,'LIVE_UNMAPPED');
assert.equal(unmapped.items.length,0);

console.log('D365 receiving READ + receipt sync contract OK');

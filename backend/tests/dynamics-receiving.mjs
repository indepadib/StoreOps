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
  {dataAreaId:'5001',PurchaseOrderNumber:'PO-100',OrderVendorAccountNumber:'VEND-01',PurchaseOrderName:'Fournisseur Test Maroc',AccountingDate:'2026-09-05T12:00:00Z',PurchaseOrderStatus:'OpenOrder',RequestedDeliveryDate:'2026-09-10T12:00:00Z',DefaultReceivingWarehouseId:'FRP0001'}
 ]});
 if(url.includes('/data/TransferOrderHeaders'))return Response.json({value:[
  {dataAreaId:'5001',TransferOrderNumber:'TO-100',TransferOrderStatus:'Created',ShippingWarehouseId:'LVE Lakhya',ReceivingWarehouseId:'FRP0001',RequestedReceiptDate:'2026-09-11T12:00:00Z'},
  {dataAreaId:'5001',TransferOrderNumber:'TO-DONE',TransferOrderStatus:'Received',ShippingWarehouseId:'LVE Lakhya',ReceivingWarehouseId:'FRP0001',RequestedReceiptDate:'2026-09-09T12:00:00Z'}
 ]});
 if(url.includes('/data/TransferOrderLinesV2'))return Response.json({value:[
  {dataAreaId:'5001',TransferOrderNumber:'TO-100',LineNumber:1,ItemNumber:'HS-010',TransferQuantity:12,ReceivedQuantity:2,RemainingReceivedQuantity:10,InventoryUnitSymbol:'PC',RequestedReceiptDate:'2026-09-11T12:00:00Z'},
  {dataAreaId:'5001',TransferOrderNumber:'TO-100',LineNumber:2,ItemNumber:'HS-011',TransferQuantity:5,ReceivedQuantity:5,RemainingReceivedQuantity:0,InventoryUnitSymbol:'PC',RequestedReceiptDate:'2026-09-11T12:00:00Z'}
 ]});
 if(url.includes('/data/ReleasedProductsV2'))return Response.json({value:[
  {dataAreaId:'5001',ItemNumber:'HS-010',ProductName:'Article transfert'}
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
assert.equal(snapshot.items[0].vendor,'Fournisseur Test Maroc');
assert.equal(snapshot.items[0].vendorAccount,'VEND-01');
assert.equal(snapshot.items[0].createdDate,'2026-09-05');
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
assert.equal(receipt.vendor,'Fournisseur Test Maroc');
assert.equal(receipt.source_vendor_account,'VEND-01');
assert.equal(receipt.source_created_date,'2026-09-05');
const lines=db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? ORDER BY source_line_number`).all(receipt.id);
assert.equal(lines.length,2);
assert.equal(lines[0].product_number,'HS-001');
assert.equal(lines[0].remaining_qty,8);
assert.equal(lines[0].ean,'611100000001');
assert.equal(receipt.document_type,'PO');

// TO flow is independent from PO and uses the real D365 transfer-order contract.
const toSnapshot=await receiving.listExpectedTransferOrders('val-fleuri',{businessDate:'2026-09-10'});
assert.equal(toSnapshot.mode,'LIVE');
assert.equal(toSnapshot.documentType,'TO');
assert.equal(toSnapshot.items.length,1);
assert.equal(toSnapshot.items[0].documentNumber,'TO-100');
assert.equal(toSnapshot.items[0].origin,'LVE Lakhya');
assert.equal(toSnapshot.items[0].warehouseId,'FRP0001');
assert.equal(toSnapshot.items[0].lines.length,1);
assert.equal(toSnapshot.items[0].lines[0].remainingQty,10);
assert.equal(toSnapshot.items[0].lines[0].productName,'Article transfert');

const toSync=await receiving.syncExpectedTransferOrdersFromDynamics('val-fleuri',{businessDate:'2026-09-10'});
assert.equal(toSync.synced,true);
assert.equal(toSync.created,1);
const toReceipt=db.prepare(`SELECT * FROM receipts WHERE po_number='TO-100'`).get();
assert.equal(toReceipt.document_type,'TO');
assert.equal(toReceipt.source_origin,'LVE Lakhya');
assert.equal(toReceipt.source_destination,'FRP0001');
const poOnly=receiving.listReceiptsForStore('val-fleuri',{documentType:'PO'});
const toOnly=receiving.listReceiptsForStore('val-fleuri',{documentType:'TO'});
assert(poOnly.every(x=>x.document_type==='PO'));
assert(toOnly.every(x=>x.document_type==='TO'));
assert(poOnly.some(x=>x.po_number==='PO-100'));
assert(!poOnly.some(x=>x.po_number==='TO-100'));
assert(toOnly.some(x=>x.po_number==='TO-100'));
assert(!toOnly.some(x=>x.po_number==='PO-100'));

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

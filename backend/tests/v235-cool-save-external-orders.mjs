import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v235-ext-${process.pid}.db`;
const {db}=await import('../db.mjs');
const {ingestCoolSaveExternalOrder,replaceCoolSaveOrderComposition,setCoolSaveExternalOrderState,listCoolSaveExternalOrders,coolSaveExternalOrderSummary}=await import('../services/cool-save-orders.mjs');

const paid={externalOrderId:'APP-1001',storeId:'val-fleuri',basketType:'TYPE_PENDING',amountPaid:49,paymentStatus:'PAID',paymentReference:'PAY-1',pickupCode:'7842'};
const first=ingestCoolSaveExternalOrder(paid);
const replay=ingestCoolSaveExternalOrder(paid);
assert.equal(first.id,replay.id,'webhook replay must be idempotent');
assert.equal(replay.idempotentReplay,true);
assert.equal(db.prepare('SELECT COUNT(*) c FROM cool_save_external_orders').get().c,1);

assert.throws(()=>ingestCoolSaveExternalOrder({...paid,externalOrderId:'APP-1002',paymentStatus:'PENDING'}),e=>e.code==='COOL_SAVE_ORDER_NOT_PAID');

assert.throws(()=>setCoolSaveExternalOrderState({id:first.id,user:{id:'u-vf'},status:'READY_FOR_PICKUP',d365OrderId:'SO-1'}),e=>e.code==='COOL_SAVE_COMPONENTS_REQUIRED');

let order=replaceCoolSaveOrderComposition({id:first.id,user:{id:'u-vf'},lines:[{productNumber:'SKU-1',ean:'6110001',productName:'Yaourt nature',quantity:2,unit:'pièce',sourceType:'DLC'}]});
assert.equal(order.status,'COMPOSITION_VALIDATED');
assert.equal(order.lines.length,1);

assert.throws(()=>setCoolSaveExternalOrderState({id:first.id,user:{id:'u-vf'},status:'READY_FOR_PICKUP'}),e=>e.code==='COOL_SAVE_D365_ORDER_REQUIRED');
order=setCoolSaveExternalOrderState({id:first.id,user:{id:'u-vf'},status:'ERP_READY',d365OrderId:'SO-CS-1001'});
assert.equal(order.d365_order_id,'SO-CS-1001');
order=setCoolSaveExternalOrderState({id:first.id,user:{id:'u-vf'},status:'READY_FOR_PICKUP'});
assert.equal(order.status,'READY_FOR_PICKUP');

const summary=coolSaveExternalOrderSummary('val-fleuri');
assert.equal(summary.ready,1);
assert.equal(listCoolSaveExternalOrders('val-fleuri').length,1);

console.log('V2.35 Cool & Save external order contract: OK');

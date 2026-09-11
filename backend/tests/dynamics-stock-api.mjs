import assert from 'node:assert/strict';

const base=process.env.STOREOPS_TEST_BASE||'http://127.0.0.1:8787';

async function get(path,user){
  const r=await fetch(`${base}${path}`,{headers:{'x-demo-user':user}});
  const body=await r.json().catch(()=>({}));
  return {status:r.status,body};
}

const config=await get('/api/dynamics/stock/config','u-ops');
assert.equal(config.status,200);
assert.equal(config.body.entity,'WarehousesOnHandV2');
assert.deepEqual(config.body.stores,[
  {storeId:'val-fleuri',warehouseId:'FRP0001',supplyWarehouseId:null}
]);
assert.equal(config.body.fields.ordered,'OrderedQuantity');
assert.equal(config.body.fields.availableOrdered,'AvailableOrderedQuantity');
assert.equal(config.body.fields.reservedOrdered,'ReservedOrderedQuantity');
assert.equal(config.body.fields.onOrder,'OnOrderQuantity');
assert.equal(config.body.fields.totalAvailable,'TotalAvailableQuantity');
assert.equal(config.body.fields.batch,null);

const vf=await get('/api/stores/val-fleuri/products/3017620422003','u-vf');
assert.equal(vf.status,200);
assert.equal(vf.body.ean,'3017620422003');
assert.equal(vf.body.warehouseId,'FRP0001');
assert.equal(vf.body.stock,17);

// A store without an explicit mapping must never inherit a fictitious warehouse.
const tr=await get('/api/stores/trefle/products/3017620422003','u-tr');
assert.equal(tr.status,200);
assert.equal(tr.body.warehouseId,null);
assert.equal(tr.body.stockSource,'UNMAPPED_D365');

const forbidden=await get('/api/stores/trefle/products/3017620422003','u-vf');
assert.equal(forbidden.status,403);

console.log('Dynamics stock explicit store mapping API: OK');

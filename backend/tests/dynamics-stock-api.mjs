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
assert(Array.isArray(config.body.stores));
const vfConfig=config.body.stores.find(x=>x.storeId==='val-fleuri');
assert(vfConfig,'Val Fleuri stock configuration must be exposed');
assert.equal(vfConfig.warehouseId,'FRP0001');
assert.equal(vfConfig.supplyWarehouseId,null);
assert(['PILOT_FALLBACK','STOREOPS_CONFIG','ENV_CONFIG'].includes(vfConfig.settingsSource));
const trConfig=config.body.stores.find(x=>x.storeId==='trefle');
assert(trConfig,'Trèfle stock configuration must be exposed');
assert.equal(trConfig.warehouseId,'FRP0002');
assert(['PILOT_FALLBACK','STOREOPS_CONFIG','ENV_CONFIG'].includes(trConfig.settingsSource));
for(const row of config.body.stores.filter(x=>!['val-fleuri','trefle'].includes(x.storeId))){
  assert.equal(row.warehouseId,null,`${row.storeId} must remain unmapped until explicitly configured`);
  assert.equal(row.supplyWarehouseId,null);
  assert.equal(row.settingsSource,'UNMAPPED');
}
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

// Trèfle uses its confirmed FRP0002 warehouse; no stock quantity is invented in simulated mode.
const tr=await get('/api/stores/trefle/products/3017620422003','u-tr');
assert.equal(tr.status,200);
assert.equal(tr.body.warehouseId,'FRP0002');
assert.equal(tr.body.stockSource,'SIMULATED_D365');

const forbidden=await get('/api/stores/trefle/products/3017620422003','u-vf');
assert.equal(forbidden.status,403);

console.log('Dynamics stock explicit store mapping API: OK');

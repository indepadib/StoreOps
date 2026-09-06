import assert from'node:assert/strict';
import{integrationReadiness,readinessCounts}from'../../frontend/js/integration-readiness.js';

const sim=integrationReadiness({connected:false,mappings:{},readModes:{}});
assert.equal(sim.length,10);
assert.equal(sim.find(x=>x.key==='receiving').read.code,'MAPPING');
assert.equal(sim.find(x=>x.key==='receiving').write.code,'MAPPING');
assert.equal(sim.find(x=>x.key==='stock').write.code,'MAPPING');
assert.equal(sim.find(x=>x.key==='inventory').write.code,'MAPPING');
assert.equal(sim.find(x=>x.key==='loss').write.code,'MAPPING');
assert.equal(sim.find(x=>x.key==='cash').write.code,'MAPPING');
assert.equal(sim.find(x=>x.key==='staffing').storeops.code,'STOREOPS');
assert.equal(sim.find(x=>x.key==='cold').storeops.code,'STOREOPS');
assert.notEqual(sim.find(x=>x.key==='product').read.code,'LIVE','Simulated mode must never claim Dynamics live');

const mappings={
  barcodeEntity:'RetailInventItemBarcode',
  productEntity:'ReleasedProductsV2',
  stockEntity:'WarehousesOnHandV2',
  basePriceEntity:'ReleasedProductsV2',
  retailDiscountEntity:'RetailDiscounts',
  retailDiscountLineEntity:'RetailDiscountLines'
};
const readModes={product:'live',stock:'live',price:'live',promotion:'live'};
const live=integrationReadiness({connected:true,mappings,readModes});
assert.equal(live.find(x=>x.key==='product').read.code,'LIVE');
assert.equal(live.find(x=>x.key==='stock').read.code,'LIVE');
assert.equal(live.find(x=>x.key==='pricing').read.code,'LIVE');
assert.equal(live.find(x=>x.key==='promotion').read.code,'LIVE');
assert.equal(live.find(x=>x.key==='receiving').write.code,'MAPPING','backend connection must not imply receipt write mapping');
assert.equal(live.find(x=>x.key==='loss').write.code,'MAPPING','backend connection must not imply loss write mapping');
const counts=readinessCounts(live);
assert.equal(counts.ready,10);
assert.equal(counts.liveReads,5,'inventory read is live through the validated stock read');
assert.equal(counts.writeMapping,5);
console.log('Dynamics integration readiness contract OK');

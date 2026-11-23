import assert from 'node:assert/strict';

process.env.D365_MODE='simulated';
const { getStockSignals,resolvedSupplyAvailability,aggregateStockSignalRows }=await import('../services/stock-signals.mjs');
const { stockIntegrationConfig }=await import('../services/dynamics-stock.mjs');

assert.equal(resolvedSupplyAvailability(null,true),0,'a complete warehouse read with no item row means warehouse stock is zero');
assert.equal(resolvedSupplyAvailability(null,false),null,'an unavailable warehouse read must remain unknown, never fake zero');
assert.equal(resolvedSupplyAvailability({availableQty:4.25},true),4.25);

const cfg=stockIntegrationConfig();
assert.equal(cfg.entity,'WarehousesOnHandV2');
assert.equal(cfg.stores.find(x=>x.storeId==='val-fleuri')?.warehouseId,'FRP0001');

const vf=await getStockSignals('val-fleuri');
assert.equal(vf.source,'SIMULATED');
assert.equal(vf.warehouse,'FRP0001');
assert.ok(vf.summary.negative>=1,'Val Fleuri doit exposer au moins un stock négatif de démonstration');
assert.ok(vf.summary.outOfStock>=1,'Val Fleuri doit exposer au moins une rupture de démonstration');
assert.ok(vf.items.some(x=>x.type==='NEGATIVE'&&x.priority==='P0'));
assert.ok(vf.items.some(x=>x.type==='OUT'&&x.priority==='P1'));

const unknown=await getStockSignals('carita');
assert.equal(unknown.source,'SIMULATED');
assert.equal(unknown.items.length,0);

console.log('stock-signals: OK');

const fields={productField:"sku",availableField:"available",physicalField:"physical"};
assert.equal(aggregateStockSignalRows([{sku:"A",available:5}],{...fields,physicalField:null})[0].physicalQty,null,"available stock never substitutes for missing physical stock");
assert.equal(aggregateStockSignalRows([{sku:"A",available:5,physical:8},{sku:"A",available:2,physical:null}],fields)[0].physicalQty,null,"a missing physical dimension makes the physical total unknown");
assert.equal(aggregateStockSignalRows([{sku:"A",available:5,physical:8},{sku:"A",available:2,physical:4}],fields)[0].physicalQty,12);

for(const available of [null,undefined,""," ","invalid"]){
 const rows=aggregateStockSignalRows([{sku:"A",available:2,physical:3},{sku:"A",available,physical:1}],fields);
 assert.equal(rows[0].availableQty,null,"incomplete available stock must not become a partial quantity");
 assert.equal(resolvedSupplyAvailability(rows[0],true),null);
}
assert.equal(resolvedSupplyAvailability({availableQty:3},false),null,"partial warehouse reads never authorize a quantified supply action");

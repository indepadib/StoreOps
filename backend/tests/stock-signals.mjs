import assert from 'node:assert/strict';

process.env.D365_MODE='simulated';
const { getStockSignals,resolvedSupplyAvailability }=await import('../services/stock-signals.mjs');
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

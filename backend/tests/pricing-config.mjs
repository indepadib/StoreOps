import assert from 'node:assert/strict';

process.env.D365_DEFAULT_PRICE_GROUP='Franprix';
process.env.D365_STORE_PRICE_GROUPS='val-fleuri=Franprix,trefle=Franprix-Test';
const {config}=await import(`../config.mjs?pricing-config=${Date.now()}`);
assert.equal(config.dynamics.defaultPriceGroup,'Franprix');
assert.equal(config.dynamics.storePriceGroups['val-fleuri'],'Franprix');
assert.equal(config.dynamics.storePriceGroups.trefle,'Franprix-Test');
assert.ok(config.dynamics.odataPageSize>=50);
assert.ok(config.dynamics.odataMaxRows>=500);
console.log('StoreOps V1.21 pricing configuration tests passed');

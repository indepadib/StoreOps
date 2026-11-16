import assert from 'node:assert/strict';
import {compareObservedPrice} from '../../frontend/analytics/competitor-comparison.js';

const store={businessDate:'2026-11-12',currency:'MAD',priceUnit:'KG',indicativeEffectivePrice:20};
const observation={observedAt:'2026-11-12',currency:'MAD',unit:'G',matchType:'IDENTICAL_GTIN',price:3,priceQuantity:100};
const compared=compareObservedPrice(store,observation);
assert.equal(compared.competitor,30);
assert.equal(compared.difference,-10);
assert.equal(compared.unit,'KG');
for(const alternate of [{unit:'PC'},{observedAt:'2026-10-01'},{priceQuantity:0},{matchType:'EQUIVALENT'},{currency:'EUR'}]){
 assert.ok(compareObservedPrice(store,{...observation,...alternate}).reason);
}
assert.ok(compareObservedPrice({...store,indicativeEffectivePrice:null},observation).reason);

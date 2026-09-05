import assert from 'node:assert/strict';
import { computeSimpleEffectivePrice, chooseEffectiveUnitPrice, resolvePriceGroup } from '../services/dynamics-promotion.mjs';

assert.equal(resolvePriceGroup(null),'Franprix','default retail price group must remain Franprix');
assert.equal(computeSimpleEffectivePrice(100,{mechanic:'PERCENT_OFF',discountPercent:20}),80);
assert.equal(computeSimpleEffectivePrice(100,{mechanic:'AMOUNT_OFF',discountAmount:15}),85);
assert.equal(computeSimpleEffectivePrice(100,{mechanic:'FIXED_PRICE',dealPrice:79.9}),79.9);
assert.equal(chooseEffectiveUnitPrice(100,[80,85]),80,'best simple price should win');
assert.equal(chooseEffectiveUnitPrice(null,[]),null,'missing base price must never become 0 DH');
assert.equal(chooseEffectiveUnitPrice(null,[79.9]),79.9,'a real promo price can survive without a base candidate');
assert.equal(chooseEffectiveUnitPrice('',[]),null,'blank base price must never become 0 DH');

console.log('StoreOps V1.21 pricing hardening tests passed');

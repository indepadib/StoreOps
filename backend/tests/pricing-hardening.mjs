import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeSimpleEffectivePrice, chooseEffectiveUnitPrice, resolvePriceGroup } from '../services/dynamics-promotion.mjs';

assert.equal(resolvePriceGroup(null),'Franprix','default retail price group must remain Franprix');
assert.equal(computeSimpleEffectivePrice(100,{mechanic:'PERCENT_OFF',discountPercent:20}),80);
assert.equal(computeSimpleEffectivePrice(100,{mechanic:'AMOUNT_OFF',discountAmount:15}),85);
assert.equal(computeSimpleEffectivePrice(100,{mechanic:'FIXED_PRICE',dealPrice:79.9}),79.9);
assert.equal(chooseEffectiveUnitPrice(100,[80,85]),80,'best simple price should win');
assert.equal(chooseEffectiveUnitPrice(null,[]),null,'missing base price must never become 0 DH');
assert.equal(chooseEffectiveUnitPrice(null,[79.9]),79.9,'a real promo price can survive without a base candidate');
assert.equal(chooseEffectiveUnitPrice('',[]),null,'blank base price must never become 0 DH');

const promoSource=fs.readFileSync(new URL('../services/dynamics-promotion.mjs',import.meta.url),'utf8');
const priceCheckSource=fs.readFileSync(new URL('../services/price-check.mjs',import.meta.url),'utf8');
assert.match(promoSource,/ItemId[^\n]*eq|D365_PROMOTION_ITEM_FIELD/,'promotion lookup must be server-filtered by item');
assert.match(promoSource,/Promise\.allSettled/,'price and promotion reads must be isolated');
assert.doesNotMatch(priceCheckSource,/odataGetAllBySkip\(['"]RetailDiscountLines/,'price check must never scan the full RetailDiscountLines entity for category lookup');
assert.match(priceCheckSource,/promotionError/,'price-check context must expose promotion read failures without hiding the article');

console.log('StoreOps pricing hardening and promotion resilience tests passed');

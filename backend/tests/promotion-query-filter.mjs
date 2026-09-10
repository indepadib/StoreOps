import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../services/dynamics-promotion.mjs',import.meta.url),'utf8');
assert.doesNotMatch(source,/`ItemId eq '/,'RetailDiscountLines.ItemId is virtual in One Retail D365 and must not be filtered directly');
assert.match(source,/verifiedItemRows/,'promotion candidates must be verified locally against the returned ItemId');
assert.match(source,/strategy:'PRODUCT_NAME'/,'product-name targeted lookup must be available');
assert.match(source,/strategy:'ACTIVE_OFFERS'/,'active Franprix offer fallback must be available');
assert.match(source,/PriceGroupId eq/,'promotion fallback must be scoped to the store price group');
console.log('D365 promotion virtual-ItemId-safe lookup contract OK');

import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../services/dynamics-promotion.mjs',import.meta.url),'utf8');
assert.match(source,/ItemId eq/);
assert.doesNotMatch(source,/allLines\.filter\(/);
console.log('D365 promotion item-filter contract OK');

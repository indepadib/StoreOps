import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
process.env.STOREOPS_DB=`/tmp/storeops-product-label-${process.pid}.db`;
const {releasedProductDisplayName}=await import('../services/released-product-sourcing.mjs');

assert.deepEqual(releasedProductDisplayName({ProductName:'Yaourt nature 4x110g',ProductDescription:'Yaourt nature 4x110g',SearchName:'DANONE'}),{field:'ProductName',name:'Yaourt nature 4x110g',quality:'DISPLAY_NAME'});
assert.deepEqual(releasedProductDisplayName({ProductDescription:'Lait entier 1L',SearchName:'CENTRALE DANONE'}),{field:'ProductDescription',name:'Lait entier 1L',quality:'DISPLAY_NAME'});
assert.deepEqual(releasedProductDisplayName({Description:'Tomates cerises',SearchName:'MARQUE TEST'}),{field:'Description',name:'Tomates cerises',quality:'DISPLAY_NAME'});
assert.deepEqual(releasedProductDisplayName({ProductSearchName:'SET DE 3 BOITES ALIM',SearchName:'TEFAL'}),{field:'ProductSearchName',name:'SET DE 3 BOITES ALIM',quality:'SEARCH_FALLBACK'});
assert.deepEqual(releasedProductDisplayName({SearchName:'MARQUE UNIQUEMENT'}),{field:'SearchName',name:'MARQUE UNIQUEMENT',quality:'SEARCH_FALLBACK'});

const source=readFileSync(new URL('../services/dynamics.mjs',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function productDisplayName'),source.indexOf('function productSearchName'));
assert.match(fn,/ProductName/);
assert.match(fn,/ProductDescription/);
assert.doesNotMatch(fn,/for\(const field of \['ProductSearchName','SearchName'\]/);

console.log('Product label contract: business name + ReleasedProducts search fallback: OK');

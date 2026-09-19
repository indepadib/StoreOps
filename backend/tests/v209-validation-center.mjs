import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const center=read('frontend/js/admin-validation-center.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const auth=read('frontend/js/auth-entry.js');
const index=read('frontend/index.html');
const build=read('frontend/netlify-build.sh');
const bridge=read('netlify/functions/api.mts');

assert.match(center,/d365-sales-mapping\/smoke/,'Validation Center must reuse secured sales smoke');
assert.match(center,/d365-price-history-mapping\/smoke/,'Validation Center must reuse secured price history smoke');
assert.match(center,/assortments\/dynamics-preview/,'Validation Center must use read-only assortment preview');
assert.match(center,/item-assistant/,'Validation Center must verify store and supply stock through item assistant');
assert.match(center,/EAN témoin stock/,'Validation Center needs a stock sample');
assert.match(center,/SKU témoin historique prix/,'Validation Center needs a price-history sample');
assert.match(center,/localStorage/,'Validation samples should persist locally for repeat checks');

assert.doesNotMatch(center,/d365-sales-mapping\/activate/,'Validation Center must never activate sales LIVE');
assert.doesNotMatch(center,/d365-price-history-mapping\/activate/,'Validation Center must never activate price history LIVE');
assert.doesNotMatch(center,/assortments\/sync-channel/,'Validation Center must never persist assortment automatically');
assert.doesNotMatch(center,/receiving|inventory-adjustment|loss.*write|cash.*write/i,'Validation Center must not introduce ERP writes');

assert.match(enhancements,/admin-validation-center\.js/,'Validation Center must lazy-load with Admin Integrations');
assert.match(enhancements,/const BUILD='2090'/,'Enhancement cache generation must be 2090');
assert.match(auth,/const BUILD='2090'/,'Auth release build must be 2090');
assert.match(auth,/const BUILD_LABEL='2\.09\.0'/,'Auth release label must be 2.09.0');
assert.match(index,/auth-entry\.js\?v=2090/,'HTML entry cache key must be 2090');
assert.match(build,/STOREOPS_RELEASE_BUILD:-2090/,'Netlify build must default to 2090');
assert.match(bridge,/STOREOPS_VERSION'\)\|\|'2\.09\.0'/,'Stateless health fallback must be 2.09.0');

console.log('V2.09 Validation Center contract: OK');

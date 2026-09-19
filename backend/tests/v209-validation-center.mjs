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
const authBuild=auth.match(/const BUILD='([0-9]{4})'/)?.[1];
const enhancementBuild=enhancements.match(/const BUILD='([0-9]{4})'/)?.[1];
const releaseLabel=auth.match(/const BUILD_LABEL='([0-9]+\.[0-9]+\.[0-9]+)'/)?.[1];
assert(authBuild,'Auth release build must exist');
assert.equal(enhancementBuild,authBuild,'Enhancement and auth cache generations must match');
assert.match(index,new RegExp(`auth-entry\\.js\\?v=${authBuild}`),'HTML entry cache key must match active build');
assert.match(build,new RegExp(`STOREOPS_RELEASE_BUILD:-${authBuild}`),'Netlify build default must match active build');
assert(releaseLabel,'Release label must exist');
assert.match(bridge,new RegExp(`STOREOPS_VERSION'\\)\\|\\|'${releaseLabel.replaceAll('.','\\.')}'`),'Stateless health fallback must match active release label');

console.log('V2.09 Validation Center contract: OK');

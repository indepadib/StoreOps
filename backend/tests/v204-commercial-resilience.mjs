import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
const dynamics=read('backend/services/dynamics.mjs');
const server=read('backend/server.mjs');
const commercial=read('frontend/js/pages/commercial.js');
const api=read('frontend/js/api.js');
const authEntry=read('frontend/js/auth-entry.js');
const tenant=read('frontend/js/tenant-branding.js');
const app=read('frontend/js/app.js');
const index=read('frontend/index.html');
const bridge=read('netlify/functions/api.mts');

const commercialBlock=dynamics.match(/export async function getCommercialChanges[\s\S]*?export async function getCashClosingSnapshot/)?.[0]||'';
assert(commercialBlock,'commercial D365 block missing');
assert.match(commercialBlock,/PriceGroupId eq/,'commercial sync must scope by store price group');
assert.match(commercialBlock,/commercialOfferFilter\('OfferId'/,'commercial sync must query only eligible offers');
assert.doesNotMatch(commercialBlock,/productsPayload|barcodesPayload/,'commercial page must not full-scan products or barcodes');
assert.match(dynamics,/D365_REQUEST_TIMEOUT_MS/,'D365 requests need a bounded timeout');
assert.match(dynamics,/D365_REQUEST_TIMEOUT/,'timeout must surface as a controlled JSON error');

const refresh=server.match(/async function refreshCommercial[\s\S]*?async function refreshCash/)?.[0]||'';
assert.match(refresh,/liveHeavy=config\.dynamics\.mode==='live'/,'commercial refresh must distinguish heavy live D365 reads');
assert.match(refresh,/if\(!required&&liveHeavy\)return\{ok:true,deferred:true/,'live commercial GET must stay off the D365 critical path');
assert.match(server,/\/api\/stores\/:storeId\/commercial\/sync/,'explicit commercial sync route must remain available');

assert.match(commercial,/Promise\.allSettled/,'commercial UI must degrade independently when one source fails');
assert.match(commercial,/autoSyncAttempted/,'empty snapshots should refresh once in background');
assert.match(commercial,/Aucune action prix\/promo dans le snapshot du jour/,'empty commercial state must remain usable');
assert.match(commercial,/Dynamics n’a pas pu rafraîchir Prix & promos/,'commercial sync failures must be visible without blanking the page');
assert.match(api,/Backend StoreOps temporairement indisponible/,'gateway HTML must be reported as backend failure');

assert.match(authEntry,/import\('\.\/state\.js'\)/,'bootstrap must mutate the same state module used by api.js');
assert.doesNotMatch(authEntry,/state\.js\?v=\$\{BUILD\}/,'bootstrap must not create a second state module identity');
assert.match(tenant,/scheduleTenantBranding\(\)/,'tenant branding must be auth-aware');
assert.match(tenant,/storeops:booted/,'protected tenant branding must wait for authenticated boot when needed');
assert.match(index,/name="mobile-web-app-capable" content="yes"/,'standard mobile web app meta is required');

const build=Number(authEntry.match(/const BUILD='(\\d+)'/)?.[1]||0);assert(build>=2040,'commercial resilience requires release marker >= 2040');
assert.match(app,/import\(path\)/,'canonical lazy loader must stay intact');
const commercialBuild=Number(app.match(/\.\/pages\/commercial\.js\?v=(\\d+)/)?.[1]||0);assert(commercialBuild>=2040,'commercial module cache bust must follow active release');
const entryBuild=Number(index.match(/auth-entry\.js\?v=(\\d+)/)?.[1]||0);assert(entryBuild>=2040,'entry asset cache bust must follow active release');
assert.match(bridge,/D365_COMMERCIAL_MAX_LINES/,'commercial tuning variables must reach the Netlify backend');

console.log('StoreOps V2.04 commercial resilience contract passed');

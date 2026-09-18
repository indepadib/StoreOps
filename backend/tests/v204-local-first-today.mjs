import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

const batch=read('backend/services/manager-inbox-batch.mjs');
const bridge=read('netlify/functions/api.mts');
const home=read('frontend/js/pages/manager-home.js');
const auth=read('frontend/js/auth-entry.js');
const index=read('frontend/index.html');

assert.doesNotMatch(batch,/^import .*stock-signals/m,'local batch module must not statically load the D365 stock graph');
assert.doesNotMatch(batch,/^import .*business-pulse/m,'local batch module must not statically load the business pulse graph');
assert.match(batch,/includeExternal=true/,'batch must expose an explicit external enrichment mode');
assert.match(batch,/if\(includeExternal\)\{/,'external reads must be conditional');
assert.match(batch,/import\('\.\/stock-signals\.mjs'\)/,'stock graph must load lazily only for enrichment');
assert.match(batch,/import\('\.\/business-pulse\.mjs'\)/,'business pulse graph must load lazily only for enrichment');
assert.match(batch,/STOREOPS_LOCAL_BATCH/,'local-only response must be identifiable');
assert.match(batch,/externalDeferred:!includeExternal/,'local response must declare deferred external enrichment');
assert.match(batch,/includeExternal\?'full':'local'/,'local and enriched batches must have distinct cache keys');

assert.match(bridge,/url\.searchParams\.get\('mode'\)!=='local'/,'Netlify fast path must support local-only manager batches');
assert.match(bridge,/manager-inbox-local/,'local manager fast-path observability missing');

const localStart=home.indexOf('manager-inbox-batch?mode=local');
const fullStart=home.indexOf('const enrichedBatchPromise=api');
const localAwait=home.indexOf('await localBatchPromise');
const fullAwait=home.indexOf('await enrichedBatchPromise');
assert(localStart>=0&&fullStart>=0,'Today must start local and enriched manager requests');
assert(localAwait>=0&&fullAwait>=0&&localAwait<fullAwait,'Today must render the local batch before waiting on enriched Dynamics data');
assert.match(home,/detailsLoading=false;redraw\(\)/,'local batch must unlock visible priorities immediately');
assert.match(home,/if\(enriched\.businessPulse\)/,'enriched batch must progressively upgrade Business Pulse');

assert.match(auth,/const BUILD='2040'/,'V2.04 runtime build marker missing');
assert.match(auth,/BUILD_LABEL='2\.04\.0'/,'V2.04 visible release label missing');
assert.match(index,/auth-entry\.js\?v=2040/,'V2.04 HTML cache bust missing');

console.log('V2.04 local-first Today contract OK');

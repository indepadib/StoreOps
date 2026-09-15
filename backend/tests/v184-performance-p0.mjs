import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const bridge=read('netlify/functions/api.mts');
const toml=read('netlify.toml');
const auth=read('frontend/js/auth-entry.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const stock=read('backend/services/stock-signals.mjs');

const readBlock=bridge.match(/async function serveRead[\s\S]*?async function serveWrite/)?.[0]||'';
const writeBlock=bridge.match(/async function serveWrite[\s\S]*?export default/)?.[0]||'';
const readSyncBlock=bridge.match(/async function syncReadRuntime[\s\S]*?function withTiming/)?.[0]||'';
const initBlock=bridge.match(/async function initializeCentralRuntime[\s\S]*?async function syncReadRuntime/)?.[0]||'';
assert(readBlock&&writeBlock&&readSyncBlock&&initBlock,'Netlify read/write paths must be explicit');
assert.doesNotMatch(readBlock,/persistSnapshot\(/,'read path must not rewrite SQLite blob');
assert.doesNotMatch(readBlock,/pg_advisory_xact_lock/,'read response path must not take global DB lock');
assert.doesNotMatch(readSyncBlock,/pg_advisory_xact_lock/,'cold/stale reads of an existing central snapshot must not serialize globally');
assert.doesNotMatch(readSyncBlock,/persistSnapshot\(/,'cold/stale reads of an existing central snapshot must not persist');
assert.match(initBlock,/pg_advisory_xact_lock/,'first-ever central state initialization must remain serialized');
assert.match(initBlock,/persistSnapshot\(/,'first-ever central state initialization must persist exactly one baseline');
assert.match(writeBlock,/persistSnapshot\(/,'write path must stay durable');
assert.match(writeBlock,/pg_advisory_xact_lock/,'write path must stay serialized');
assert.match(bridge,/REVISION_CACHE_MS/,'read state revision must be short-lived cached');
assert.match(bridge,/Server-Timing/,'API bridge must expose server timing diagnostics');

const jsHeader=toml.match(/for = "\/js\/\*"[\s\S]*?Cache-Control = "([^"]+)"/)?.[1]||'';
assert(jsHeader,'JS cache header missing');
assert.doesNotMatch(jsHeader,/no-store/,'JS modules must not be re-downloaded on every page load');
assert.match(jsHeader,/stale-while-revalidate/,'JS cache should support fast repeat visits');
assert.match(auth,/await start\(\);\s*loadEnhancementsDeferred\(\)/,'non-critical enhancements must load after core app startup');
assert.match(enhancements,/Promise\.allSettled/,'deferred enhancements should load concurrently');

assert.match(stock,/STOREOPS_STOCK_SIGNALS_CACHE_SECONDS/,'D365 stock signals need an explicit short cache');
assert.match(stock,/signalInflight/,'identical stock reads must be single-flight deduplicated');
assert.match(stock,/cache:\{status:'HIT'/,'stock cache hit observability missing');

console.log('V1.84 performance P0 invariants OK');

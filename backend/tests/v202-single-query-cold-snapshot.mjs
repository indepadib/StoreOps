import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const bridge=readFileSync(path.join(root,'netlify/functions/api.mts'),'utf8');
const sync=bridge.match(/async function syncReadRuntime\(database:any\)[\s\S]*?function withTiming/)?.[0]||'';
assert(sync,'syncReadRuntime block missing');

const warmGuard=sync.match(/if\(dbRuntimePromise&&localRevision!==null\)\{[\s\S]*?\n  \}/)?.[0]||'';
assert(warmGuard,'warm revision guard missing');
assert.match(warmGuard,/probeCentralRevision\(database\)/,'warm runtime must probe central revision');

const beforeWarm=sync.slice(0,sync.indexOf('if(dbRuntimePromise&&localRevision!==null)'));
assert.doesNotMatch(beforeWarm,/probeCentralRevision/,'cold path must not probe revision before fetching the snapshot');

const fullStateReads=[...sync.matchAll(/SELECT db_bytes,revision FROM storeops_sqlite_state/g)];
assert.equal(fullStateReads.length,1,'cold/stale sync must use one full snapshot query');
assert.match(sync,/if\(!row\)return initializeCentralRuntime\(database\)/,'first-ever initialization fallback must remain');
assert.match(sync,/rememberRevision\(revision\)/,'full snapshot read must refresh local revision cache');

console.log('V2.02 single-query cold snapshot contract OK');

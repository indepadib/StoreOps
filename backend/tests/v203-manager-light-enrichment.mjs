import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

const bridge=read('netlify/functions/api.mts');
const inbox=read('frontend/js/manager-action-inbox.js');
const index=read('frontend/index.html');
const auth=read('frontend/js/auth-entry.js');
const enhancements=read('frontend/js/enhancements-entry.js');

const light=bridge.match(/async function handleLightRoute[\s\S]*?async function authenticatedUser/)?.[0]||'';
assert(light,'handleLightRoute block missing');
assert.match(light,/manager-home-fast\|manager-inbox-batch\|business-pulse/,'manager fast resources must share the light route allowlist');
assert.match(light,/getManagerInboxBatch/,'manager inbox batch must execute directly on the light runtime');
assert.match(light,/getBusinessPulse/,'business pulse must execute directly on the light runtime');
assert.match(light,/X-StoreOps-Fast-Path':'manager-inbox'/,'manager inbox fast-path observability missing');
assert.match(light,/X-StoreOps-Fast-Path':'business-pulse'/,'business pulse fast-path observability missing');
assert.doesNotMatch(light,/loadRuntime\(/,'light manager routes must not boot the full backend server');

const batchCall=inbox.indexOf('manager-inbox-batch');
const legacyFanout=inbox.indexOf('Promise.all([');
assert(batchCall>=0&&legacyFanout>=0&&batchCall<legacyFanout,'manager inbox must try the batch endpoint before the legacy fan-out');
assert.match(inbox,/batch\?\.status==='READY'/,'batch response must be validated before returning');
assert.match(inbox,/fallback legacy/,'legacy fallback must remain available for resilience');

assert.match(index,/auth-entry\.js\?v=2030/,'HTML must invalidate the auth entry cache for V2.03');
assert.match(index,/boot-rescue\.js\?v=2030/,'HTML must invalidate boot rescue cache for V2.03');
assert.match(auth,/const BUILD='2030'/,'auth entry build marker must be V2.03');
assert.match(auth,/const BUILD_LABEL='2\.03\.0'/,'visible V2.03 build label missing');
assert.match(enhancements,/const BUILD='2030'/,'deferred enhancements must invalidate their module graph');

console.log('V2.03 manager light-enrichment contract OK');

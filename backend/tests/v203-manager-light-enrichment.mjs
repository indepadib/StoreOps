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

const activeBuild=auth.match(/const BUILD='(\d+)'/)?.[1]||'';
const activeLabel=auth.match(/const BUILD_LABEL='([^']+)'/)?.[1]||'';
const enhancementBuild=enhancements.match(/const BUILD='(\d+)'/)?.[1]||'';
assert(Number(activeBuild)>=2030,'release build must not regress below V2.03');
assert(/^\d+\.\d+\.\d+$/.test(activeLabel),'visible release label must remain semver');
assert(index.includes(`/js/auth-entry.js?v=${activeBuild}`),'HTML must invalidate auth entry with the active release key');
assert(index.includes(`/js/boot-rescue.js?v=${activeBuild}`),'HTML must invalidate boot rescue with the active release key');
assert.equal(enhancementBuild,activeBuild,'deferred enhancements must share the active release key');

console.log('V2.03 manager light-enrichment contract OK');

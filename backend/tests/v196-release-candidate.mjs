import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const boot=read('frontend/js/boot-classic.js');
const auth=read('frontend/js/auth-entry.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const build=read('frontend/netlify-build.sh');
const today=read('frontend/js/pages/manager-home.js');
const pwa=read('frontend/js/pwa.js');

assert.match(boot,/BUILD='1\.96\.0'/,'classic boot must expose V1.96.0');
assert.match(boot,/storeops-legacy-runtime-cleaned-v1/,'legacy cleanup key must remain stable so it is not rerun for every release');
assert.match(auth,/const BUILD='1960'/,'auth graph cache key must be 1960');
assert.match(auth,/BUILD_LABEL='1\.96\.0'/,'auth release label must be V1.96.0');
assert.match(auth,/enhancements-entry\.js\?v=1960/,'deferred enhancement entry must use V1.96 cache key');
assert.match(enhancements,/const BUILD='1960'/,'all deferred modules must share V1.96 cache key');
assert.match(build,/STOREOPS_RELEASE_BUILD:-1960/,'Netlify build must default to release cache key 1960');
assert.match(build,/tenant-branding\.js/,'tenant branding must remain in early published runtime');
assert.match(build,/boot-rescue\.js/,'boot rescue must remain in early published runtime');
assert.match(build,/auth-entry\.js/,'auth entry must remain in early published runtime');
assert.doesNotMatch(pwa,/getRegistrations\(/,'PWA layer must not repeat legacy service-worker cleanup');
assert.match(today,/manager-home-fast/,'guided Today must keep the local fast snapshot');
assert.match(today,/manager-inbox-batch/,'guided Today must keep the bundled enrichment path');
assert.match(today,/chooseManagerNextAction/,'guided Today must keep one-action-at-a-time prioritisation');

console.log('V1.96 release candidate runtime coherence OK');

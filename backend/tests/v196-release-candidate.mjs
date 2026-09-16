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
const managerToday=read('frontend/js/pages/manager-home.js');
const pwa=read('frontend/js/pwa.js');

const authBuild=auth.match(/const BUILD='(\d+)'/)?.[1];
const authLabel=auth.match(/const BUILD_LABEL='([^']+)'/)?.[1];
const bootLabel=boot.match(/var BUILD='([^']+)'/)?.[1];
const enhancementBuild=enhancements.match(/const BUILD='(\d+)'/)?.[1];
const buildDefault=build.match(/STOREOPS_RELEASE_BUILD:-([0-9]+)/)?.[1];
assert(authBuild&&authLabel&&bootLabel&&enhancementBuild&&buildDefault,'release identifiers must all be explicit');
assert.equal(enhancementBuild,authBuild,'deferred modules must share the auth cache key');
assert.equal(buildDefault,authBuild,'Netlify build default must share the runtime cache key');
assert.equal(bootLabel,authLabel,'classic boot and auth release labels must match');
assert.match(auth,new RegExp(`enhancements-entry\\.js\\?v=${authBuild}`),'deferred enhancement entry must share the release cache key');
assert.match(boot,/storeops-legacy-runtime-cleaned-v1/,'legacy cleanup key must remain stable so it is not rerun for every release');
assert.match(build,/tenant-branding\.js/,'tenant branding must remain in early published runtime');
assert.match(build,/boot-rescue\.js/,'boot rescue must remain in early published runtime');
assert.match(build,/auth-entry\.js/,'auth entry must remain in early published runtime');
assert.doesNotMatch(pwa,/getRegistrations\(/,'PWA layer must not repeat legacy service-worker cleanup');
assert.match(managerToday,/manager-home-fast/,'guided manager Today must keep the local fast snapshot');
assert.match(managerToday,/manager-inbox-batch/,'guided manager Today must keep the bundled enrichment path');
assert.match(managerToday,/chooseManagerNextAction/,'guided manager Today must keep one-action-at-a-time prioritisation');

console.log(`Release runtime coherence OK · build ${authBuild} · v${authLabel}`);

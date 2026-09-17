import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const module=read('frontend/js/director-exception-first.js');
const css=read('frontend/mobile-v199.css');
const enhancements=read('frontend/js/enhancements-entry.js');
const auth=read('frontend/js/auth-entry.js');
const boot=read('frontend/js/boot-classic.js');
const build=read('frontend/netlify-build.sh');
const today=read('frontend/js/pages/today.js');

assert.match(today,/today-priority-card/,'priorities must remain visible before secondary metrics');
assert.match(today,/today-metrics-grid/,'detailed operational metrics must keep a stable target');
assert.match(module,/max-width: 820px/,'exception-first behavior must be mobile-scoped');
assert.match(module,/director-metrics-collapsed/,'mobile detailed metrics must support collapsed state');
assert.match(module,/Voir tous les indicateurs/,'collapsed state must stay discoverable');
assert.match(module,/Masquer les indicateurs détaillés/,'expanded state must be reversible');
assert.match(module,/aria-expanded/,'progressive disclosure must expose accessibility state');
assert.match(module,/if\(mobile&&!grid\.dataset\.directorChoice\)/,'mobile must default to decision-first collapsed details');
assert.match(module,/else if\(!mobile\)/,'desktop must explicitly restore the full metrics grid');
assert.match(css,/director-metric-toggle\{display:none\}/,'toggle must stay hidden outside mobile');
assert.match(css,/today-metrics-grid\.director-metrics-collapsed\{display:none!important\}/,'collapsed mobile grid must not consume vertical space');
assert.match(css,/min-height:48px/,'metric disclosure must remain comfortably tappable');
assert.match(enhancements,/mobile-v199\.css\?v=\$\{BUILD\}/,'V1.99 stylesheet must be loaded through the Director graph');
assert.match(enhancements,/director-exception-first\.js/,'V1.99 module must load for Director only');

const authBuild=auth.match(/const BUILD='(\d+)'/)?.[1]||null;
const enhancementBuild=enhancements.match(/const BUILD='(\d+)'/)?.[1]||null;
const authLabel=auth.match(/BUILD_LABEL='([^']+)'/)?.[1]||null;
const bootLabel=boot.match(/BUILD='([^']+)'/)?.[1]||null;
const buildDefault=build.match(/STOREOPS_RELEASE_BUILD:-([0-9]+)/)?.[1]||null;
assert(authBuild,'auth release cache key missing');
assert(Number(authBuild)>=1990,'release must not roll back before V1.99');
assert.equal(enhancementBuild,authBuild,'deferred modules must share the auth cache key');
assert.equal(buildDefault,authBuild,'Netlify default release key must match the runtime cache key');
assert(authLabel,'auth release label missing');
assert.equal(bootLabel,authLabel,'classic boot and auth release labels must match');

console.log(`V1.99 exception-first Director mobile contract: OK · release ${authBuild} · v${authLabel}`);

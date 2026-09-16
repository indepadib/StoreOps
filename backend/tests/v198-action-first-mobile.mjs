import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const today=read('frontend/js/pages/today.js');
const mobile=read('frontend/mobile-v198.css');
const enhancements=read('frontend/js/enhancements-entry.js');
const auth=read('frontend/js/auth-entry.js');
const boot=read('frontend/js/boot-classic.js');
const build=read('frontend/netlify-build.sh');

assert.match(today,/today-primary-grid/,'Today must expose the primary decision zone');
assert.match(today,/today-health-card/,'Store Health must remain first-class');
assert.match(today,/today-priority-card/,'Today must expose an action-first priority card');
assert.match(today,/today-metrics-grid/,'Today must isolate detailed operational metrics');
assert.match(today,/rows\.slice\(0,3\)/,'Today must show at most three priorities before progressive disclosure');
assert.match(today,/today-priority-more/,'extra priorities must remain reachable');
const healthPos=today.indexOf('today-health-card');
const priorityPos=today.indexOf('today-priority-card');
const metricsPos=today.indexOf('today-metrics-grid');
assert(healthPos>=0&&priorityPos>healthPos&&metricsPos>priorityPos,'mobile decision order must be Health → priorities → metrics');

assert.match(mobile,/today-metrics-grid\{grid-template-columns:repeat\(2/,'mobile metrics must use a dense two-column grid');
assert.match(mobile,/today-metric-card\{padding:11px 10px/,'mobile operational cards must be compact');
assert.match(mobile,/topbar\{gap:7px;padding:8px 12px/,'Director mobile header must be denser than V1.97');
assert.match(mobile,/#nav\.ux191-network-nav\{gap:2px;padding:5px 6px/,'Director mobile bottom navigation must be compact');
assert.match(mobile,/min-height:44px/,'mobile nav targets must retain a usable touch height');
assert.match(mobile,/today-health-penalties[\s\S]*-webkit-line-clamp:2/,'health penalties must not dominate the first screen');

assert.match(enhancements,/mobile-v198\.css\?v=\$\{BUILD\}/,'V1.98 mobile stylesheet must stay in the director graph');
const enhancementsBuild=Number(enhancements.match(/const BUILD='(\d+)'/)?.[1]||0);
const authBuild=Number(auth.match(/const BUILD='(\d+)'/)?.[1]||0);
const authLabel=auth.match(/BUILD_LABEL='([^']+)'/)?.[1]||'';
const bootLabel=boot.match(/BUILD='([^']+)'/)?.[1]||'';
const netlifyBuild=Number(build.match(/STOREOPS_RELEASE_BUILD:-([0-9]+)/)?.[1]||0);
assert(enhancementsBuild>=1980,'enhancement release key must not regress below V1.98');
assert.equal(authBuild,enhancementsBuild,'auth and enhancements cache keys must stay coherent');
assert.equal(netlifyBuild,authBuild,'Netlify release cache key must match auth graph');
assert(authLabel&&bootLabel===authLabel,'classic boot and auth release labels must stay coherent');

console.log('V1.98 action-first mobile regression: OK');

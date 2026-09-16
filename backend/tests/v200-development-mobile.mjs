import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const css=read('frontend/development-v200.css');
const baseCss=read('frontend/development.css');
const development=read('frontend/js/development.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const auth=read('frontend/js/auth-entry.js');
const boot=read('frontend/js/boot-classic.js');
const build=read('frontend/netlify-build.sh');

assert.match(baseCss,/\.dev-board/,'canonical Development workspace must remain intact');
assert.match(development,/Prochaine action/,'Development project cards must expose the next action');
assert.match(development,/stageReadiness/,'Development detail must keep stage readiness gates');
assert.match(development,/data-dev-milestone/,'Development milestones must stay actionable');

assert.match(css,/@media\(max-width:820px\)/,'V2.00 Development polish must be mobile-scoped');
assert.match(css,/\.dev-kpis-5[\s\S]*grid-auto-flow:column/,'portfolio KPI strip must be horizontal on mobile');
assert.match(css,/\.dev-kpis-5 \.dev-kpi:nth-child\(4\)\{order:-3/,'attention KPI must be surfaced first');
assert.match(css,/\.dev-kpis-5 \.dev-kpi:nth-child\(5\)\{order:-2/,'near-term openings must follow attention');
assert.match(css,/\.dev-project-meta>div:nth-child\(3\)[\s\S]*grid-column:1\/-1[\s\S]*grid-row:1/,'project next action must occupy the first full row');
assert.match(css,/\.dev-stage-rail\{display:grid;grid-auto-flow:column/,'project stage rail must swipe horizontally');
assert.match(css,/\.dev-stage-rail[\s\S]*overflow-x:auto/,'stage rail must not stack into a tall mobile grid');
assert.match(css,/\.dev-next-card\{order:-3/,'project next action must precede secondary detail');
assert.match(css,/\.dev-milestone\.done\{order:2/,'completed milestones must be visually secondary');
assert.match(css,/\.dev-form input[\s\S]*font-size:16px/,'mobile Development forms must avoid iOS input zoom');
assert.match(css,/safe-area-inset-bottom/,'Development workspace must respect iPhone bottom safe area');

assert.match(enhancements,/addCss\(`\/development-v200\.css\?v=\$\{BUILD\}`,'developmentMobile'\)/,'V2.00 stylesheet must load for all authenticated experiences');
const addDevCssPos=enhancements.indexOf("addCss(`/development-v200.css?v=${BUILD}`,'developmentMobile')");
const directorConditionalPos=enhancements.indexOf("if(isDirector())paths.push('./director-exception-first.js')");
assert(addDevCssPos>=0&&directorConditionalPos>addDevCssPos,'Development mobile CSS must not be Director-only');

assert.match(enhancements,/const BUILD='2000'/,'V2.00 enhancement cache key missing');
assert.match(auth,/const BUILD='2000'/,'V2.00 auth cache key missing');
assert.match(auth,/BUILD_LABEL='2\.00\.0'/,'V2.00 auth label missing');
assert.match(boot,/BUILD='2\.00\.0'/,'V2.00 boot label missing');
assert.match(build,/STOREOPS_RELEASE_BUILD:-2000/,'V2.00 Netlify build key missing');

console.log('V2.00 Development mobile contract: OK');

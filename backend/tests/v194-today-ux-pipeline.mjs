import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const deploy=read('.github/workflows/production-deploy.yml');
const html=read('frontend/index.html');
const home=read('frontend/js/pages/manager-home.js');
const baseCss=read('frontend/manager-today.css');
const previewCss=read('frontend/manager-today-v185.css');
const auth=read('frontend/js/auth-entry.js');
const enhancements=read('frontend/js/enhancements-entry.js');

// Production remains explicitly controlled.
assert.match(deploy,/workflow_dispatch:/,'production deploy must be manual');
assert.match(deploy,/confirm_production/,'manual deploy must require explicit production confirmation');
assert.doesNotMatch(deploy,/\n\s*push:/,'production deploy must not trigger on push');
assert.doesNotMatch(deploy,/cache:\s*npm/,'setup-node must not require a missing npm lockfile');
assert.doesNotMatch(deploy,/npm ci\b/,'deploy must not use npm ci without a lockfile');
const compileAt=deploy.indexOf('npx tsc -p tsconfig.netlify.json');
const deployAt=deploy.indexOf('netlify-cli@latest deploy');
assert(compileAt>=0&&deployAt>compileAt,'compile/release contracts must run before any Netlify deploy');

// Manager navigation remains a stable four-tab top-level model.
const nav=html.match(/<nav class="manager-nav" id="managerNav"[\s\S]*?<\/nav>/)?.[0]||'';
assert(nav,'manager nav missing');
const buttons=[...nav.matchAll(/<button[^>]*data-page="([^"]+)"[^>]*>([^<]+)/g)].map(x=>({page:x[1],label:x[2]}));
assert.deepEqual(buttons.map(x=>x.page),['today','managerScan','managerTeam','managerMore']);
assert.deepEqual(buttons.map(x=>x.label),['Aujourd’hui','Scanner','Équipe','Plus']);

// Index only boots the runtime, branding, rescue and auth graph. Enhancements/Admin stay lazy.
const moduleSources=[...html.matchAll(/<script type="module" src="([^"]+)"/g)].map(x=>x[1].split('?')[0]);
assert.deepEqual(moduleSources,['/js/tenant-branding.js','/js/boot-rescue.js','/js/auth-entry.js']);
for(const eager of ['manager-polish.js','manager-alerts.js','admin-studio-access.js','admin-studio-stores.js','admin-studio-integrations.js'])assert(!html.includes(`src="/js/${eager}`),`${eager} must not be eagerly loaded by index.html`);
assert.match(auth,/loadEnhancementsDeferred\(\)/,'enhancements must remain outside the critical boot path');
assert.match(enhancements,/Promise\.allSettled/,'deferred enhancements should load concurrently');

// Manager Today: store pulse first, then no more than three visible priorities.
assert.match(home,/function ctaLabel/,'Today must use contextual action labels');
assert.match(home,/BUSINESS PULSE/,'Business Pulse is mandatory on manager Today');
assert.match(home,/items\.slice\(0,3\)/,'manager Today may expose at most three immediate priorities');
assert.match(home,/VOS PRIORITÉS/,'manager priority block missing');
assert.match(home,/phaseRail\(phase\)/,'opening / day / closing orientation must be visible');
assert(home.indexOf('${pulseCompact(pulse,pulseLoading)}')<home.indexOf('${prioritiesSection(actions,detailsLoading,phase,total)}'),'Business Pulse must render before priorities');
assert.match(previewCss,/\.today-priority-card/,'approved priority surface missing');
assert.match(previewCss,/\.today-pulse-grid-4/,'approved four-KPI pulse missing');
assert.match(baseCss,/\.today-dayrail\{/,'simple day orientation missing');
assert.doesNotMatch(previewCss,/#[0-9a-f]{3,8}\b/i,'Today redesign must reuse StoreOps color tokens instead of introducing a new palette');

const authBuild=auth.match(/const BUILD='(\d+)'/)?.[1];
const enhancementBuild=enhancements.match(/const BUILD='(\d+)'/)?.[1];
assert(authBuild&&enhancementBuild,'runtime build ids must be present');
assert.equal(authBuild,enhancementBuild,'auth and deferred enhancement runtime must share one cache generation');

console.log('Approved manager Today UX + manual release contract OK');

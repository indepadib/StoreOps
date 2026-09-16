import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const deploy=read('.github/workflows/production-deploy.yml');
const html=read('frontend/index.html');
const home=read('frontend/js/pages/manager-home.js');
const css=read('frontend/manager-today.css');
const auth=read('frontend/js/auth-entry.js');
const enhancements=read('frontend/js/enhancements-entry.js');

// Production credits: code pushes must never trigger Netlify production automatically.
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
const moduleSources=[...html.matchAll(/<script type="module" src="([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(moduleSources,['/js/tenant-branding.js?v=1940','/js/boot-rescue.js?v=1940','/js/auth-entry.js?v=1940']);
for(const eager of ['manager-polish.js','manager-alerts.js','admin-studio-access.js','admin-studio-stores.js','admin-studio-integrations.js'])assert(!html.includes(`src="/js/${eager}`),`${eager} must not be eagerly loaded by index.html`);
assert.match(auth,/loadEnhancementsDeferred\(\)/,'enhancements must remain outside the critical boot path');
assert.match(enhancements,/Promise\.allSettled/,'deferred enhancements should load concurrently');

// Today: one clear action, contextual CTA, progressive disclosure, KPI second.
assert.match(home,/function ctaLabel/,'Today must use contextual action labels');
assert.match(home,/MAINTENANT/,'Today primary action label missing');
assert.match(home,/<details class="today-queue/,'secondary queue must be progressively disclosed');
assert.match(home,/slice\(1,3\)/,'only two next actions may be prepared on Today');
assert.match(home,/phaseRail\(phase\)/,'opening / day / closing orientation must be visible');
assert(home.indexOf('${primaryAction(primary')<home.indexOf('${pulseCompact(pulse'),'primary action must render before business KPIs');
assert.match(css,/\.today-command\{/,'dominant action surface missing');
assert.match(css,/\.today-dayrail\{/,'simple day orientation missing');
assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b/i,'Today redesign must reuse StoreOps color tokens instead of introducing a new palette');

const authBuild=auth.match(/const BUILD='(\d+)'/)?.[1];
const enhancementBuild=enhancements.match(/const BUILD='(\d+)'/)?.[1];
assert.equal(authBuild,'1940');
assert.equal(enhancementBuild,'1940');

console.log('V1.94 manual release + one-action Today UX contract OK');

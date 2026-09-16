import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const home=read('frontend/js/pages/manager-home.js');
const baseCss=read('frontend/manager-today.css');
const previewCss=read('frontend/manager-today-v185.css');
const html=read('frontend/index.html');

assert.match(home,/BUSINESS PULSE/,'Today must lead with the store pulse before action detail');
assert.match(home,/function ctaLabel/,'priority CTAs must use plain-language contextual labels');
assert.match(home,/items\.slice\(0,3\)/,'Today must surface at most three immediate priorities');
assert.match(home,/VOS PRIORITÉS/,'three-priority decision zone missing');
assert.match(home,/PARCOURS DE JOURNÉE/,'day progress must remain visible');
assert.match(home,/Rien d’urgent pour le moment/,'clear no-priority state missing');
assert(home.indexOf('pulseCompact(pulse,pulseLoading)')<home.indexOf('prioritiesSection(actions,detailsLoading,phase,total)'),'Business Pulse must render before the priority zone');
assert.doesNotMatch(home,/priorityLabel\(/,'technical P0/P1 labels must not surface in Today');
assert.match(baseCss,/\.today-dayrail/,'opening / day / closing orientation rail missing');
assert.match(previewCss,/\.today-priority-card/,'three-priority card styling missing');
assert.match(previewCss,/\.today-pulse-grid-4/,'four-metric pulse styling missing');
assert.doesNotMatch(previewCss,/#[0-9a-f]{3,8}\b/i,'Today preview extension must reuse StoreOps design tokens');
assert.match(home,/manager-today-v185\.css/,'Today preview stylesheet must be loaded by the manager route');

const nav=html.match(/<nav class="manager-nav" id="managerNav"[\s\S]*?<\/nav>/)?.[0]||'';
assert(nav,'manager nav missing');
const buttons=[...nav.matchAll(/<button[^>]*data-page="([^"]+)"[^>]*>([^<]+)/g)].map(x=>({page:x[1],label:x[2]}));
assert.deepEqual(buttons.map(x=>x.page),['today','managerScan','managerTeam','managerMore']);
assert.deepEqual(buttons.map(x=>x.label),['Aujourd’hui','Scanner','Équipe','Plus']);

console.log('V1.89/V1.85 approved manager Today regression: OK');

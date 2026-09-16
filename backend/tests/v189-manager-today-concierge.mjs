import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const home=read('frontend/js/pages/manager-home.js');
const css=read('frontend/manager-today.css');
const html=read('frontend/index.html');

assert.match(home,/MAINTENANT/,'Today must lead with one immediate action');
assert.match(home,/function ctaLabel/,'primary CTA must use plain-language contextual labels');
assert.match(home,/slice\(1,3\)/,'Today must prepare at most two next actions');
assert.match(home,/<details class="today-queue/,'next actions must use progressive disclosure');
assert.match(home,/PARCOURS/,'day progress must remain visible');
assert.match(home,/EN UN COUP D’ŒIL/,'business metrics must stay secondary');
assert(home.indexOf('primaryAction')<home.indexOf('pulseCompact'),'action experience must be defined before KPI experience');
assert.doesNotMatch(home,/priorityLabel\(/,'technical P0/P1 labels must not surface in Today');
assert.match(css,/\.today-primary-cta/,'primary CTA styling missing');
assert.match(css,/\.today-dayrail/,'opening / day / closing orientation rail missing');
assert.match(css,/body\.manager-mode #todayPage>\.page-title\{display:none\}/,'legacy dashboard title must be hidden for managers');
assert.match(html,/manager-today\.css/,'Today concierge stylesheet must be loaded');

const nav=html.match(/<nav class="manager-nav" id="managerNav"[\s\S]*?<\/nav>/)?.[0]||'';
assert(nav,'manager nav missing');
const buttons=[...nav.matchAll(/<button[^>]*data-page="([^"]+)"[^>]*>([^<]+)/g)].map(x=>({page:x[1],label:x[2]}));
assert.deepEqual(buttons.map(x=>x.page),['today','managerScan','managerTeam','managerMore']);
assert.deepEqual(buttons.map(x=>x.label),['Aujourd’hui','Scanner','Équipe','Plus']);

console.log('V1.89/V1.94 guided manager Today regression: OK');

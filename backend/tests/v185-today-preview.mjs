import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const home=read('frontend/js/pages/manager-home.js');
const css=read('frontend/manager-today-v185.css');
const index=read('frontend/index.html');

assert.match(home,/BUSINESS PULSE/,'Today must surface Business Pulse');
assert.match(home,/items\.slice\(0,3\)/,'Today must expose at most three primary priorities');
assert.match(home,/pulseCompact\(pulse,pulseLoading\).*prioritiesSection/s,'Business Pulse must render before priorities');
assert.match(home,/prioritiesSection\(actions,detailsLoading,phase,total\).*alertStrip/s,'alerts must come after the priority block');
assert.match(home,/alertStrip\(inbox,detailsLoading\).*journeyStrip/s,'journey must follow alerts');
assert.match(home,/manager-today-v185\.css/,'Today route must load V1.85 preview styling');
assert.match(css,/today-pulse-grid-4/,'four-metric Business Pulse style missing');
assert.match(css,/today-priority-card/,'priority card styling missing');

const managerNav=index.match(/<nav class="manager-nav" id="managerNav"[\s\S]*?<\/nav>/)?.[0]||'';
assert(managerNav,'manager navigation missing');
const managerButtons=[...managerNav.matchAll(/<button[^>]*data-page="([^"]+)"[^>]*>([^<]+)/g)].map(m=>({page:m[1],label:m[2].trim()}));
assert.deepEqual(managerButtons,[
 {page:'today',label:'Aujourd’hui'},
 {page:'managerScan',label:'Scanner'},
 {page:'managerTeam',label:'Équipe'},
 {page:'managerMore',label:'Plus'}
]);

console.log('V1.85 approved Today preview contract OK');

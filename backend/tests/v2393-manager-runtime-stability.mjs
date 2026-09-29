import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runtimeModulesFor } from '../../frontend/js/enhancements-entry.js';

const manager=runtimeModulesFor({manager:true,pda:false,director:false});
assert.deepEqual(manager,['./pwa.js'],'Le responsable magasin doit charger uniquement le runtime terrain minimal.');

const forbidden=[
  './manager-more-simplified.js',
  './manager-polish.js',
  './manager-alerts.js',
  './manager-incident-flow.js',
  './manager-handover.js',
  './manager-control-focus.js',
  './manager-receiving-focus.js',
  './manager-replenishment-v2.js'
];
for(const module of forbidden)assert.ok(!manager.includes(module),`Module manager mutateur interdit dans le runtime stable: ${module}`);

const director=runtimeModulesFor({manager:false,pda:false,director:true});
assert.ok(director.includes('./director-exception-first.js'),'La vue Direction doit conserver ses enrichissements.');
assert.ok(director.includes('./warehouse-control.js'),'Le cockpit réseau/entrepôt doit rester disponible hors profil manager.');

const pwa=await readFile(new URL('../../frontend/js/pwa.js',import.meta.url),'utf8');
assert.match(pwa,/import '\.\/mobile-barcode\.js(?:\?v=\d+)?'/,'Le scanner caméra doit rester chargé dans le runtime manager minimal.');

const hubs=await readFile(new URL('../../frontend/js/pages/manager-hubs.js',import.meta.url),'utf8');
for(const route of ['commercial','inventory','receipts','dlc','handover','quality','maintenance','losses','cash']){
  assert.match(hubs,new RegExp(`navCard\\('${route}'`),`Le responsable doit garder l'accès utile à ${route}.`);
}

const app=await readFile(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
assert.match(app,/\$\('#managerNav'\)\.hidden=!manager/,'Le core StoreOps doit gérer la visibilité du menu manager sans surcouche.');
assert.match(app,/document\.querySelectorAll\('#managerNav button\[data-page\]'/,'Le core StoreOps doit gérer la navigation manager.');

// Push marker: run the branch-only stability workflow before production.\nconsole.log('v2.39.3 manager runtime stability: OK');

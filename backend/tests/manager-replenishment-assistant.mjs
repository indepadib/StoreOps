import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const repl=readFileSync(new URL('../../frontend/js/manager-replenishment-v2.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../../frontend/js/enhancements-entry.js',import.meta.url),'utf8');

assert.match(entry,/manager-replenishment-v2\.js/,'guided replenishment assistant must be loaded in Safari-safe enhancement chain');
assert.match(repl,/LOW_COVERAGE_DAYS=2\.5/,'near-stockout must be based on explicit day coverage');
assert.match(repl,/recommendation:'INVENTORY'/,'negative stock must recommend targeted inventory before ordering');
assert.match(repl,/recommendation:'TO'/,'central stock must prefer a transfer order');
assert.match(repl,/recommendation:'PO'/,'supplier PO must be available when depot stock is unavailable');
assert.match(repl,/recommendation:'COVERED'/,'existing inbound supply must suppress duplicate ordering');
assert.match(repl,/PROMO_TARGET_DAYS=7/,'promo items must receive extra coverage');
assert.match(repl,/Créer et commencer le comptage/,'stock-negative action must launch an explicit guided inventory flow');
assert.match(repl,/api\/inventory\/\$\{session\.id\}\/lines/,'targeted inventory flow must preload the affected EAN');
assert.match(repl,/data-repl2-confirm-order/,'PO and TO must require a confirmation step');
assert.match(repl,/Quantité proposée/,'recommended quantity must remain editable before staging');
assert.match(repl,/Voir le lot/,'after staging a PO or TO the manager must be able to inspect the actual batch');
assert.match(repl,/data-repl2-remove/,'staged replenishment lines must remain removable before export');
assert.match(repl,/INVENTORY_ADJUSTMENT/,'inventory adjustments must be included in Dynamics export staging');
assert.match(repl,/TRANSACTION_TYPE:'LOSS'/,'loss movements must be included in Dynamics export staging');
assert.match(repl,/template Data Management/,'UI must state that exact F&O mapping still needs validation');
assert.doesNotMatch(repl,/postPurchaseOrderToDynamics|createPurchaseOrderToDynamics/,'assistant must not create supplier orders automatically');
console.log('StoreOps guided replenishment and Dynamics export assistant contract passed');

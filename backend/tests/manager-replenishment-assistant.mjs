import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const repl=readFileSync(new URL('../../frontend/js/manager-replenishment.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../../frontend/js/enhancements-entry.js',import.meta.url),'utf8');

assert.match(entry,/manager-replenishment\.js/,'replenishment assistant must be loaded in the Safari-safe enhancement chain');
assert.match(repl,/LOW_COVERAGE_DAYS=2\.5/,'near-stockout must be based on explicit day coverage');
assert.match(repl,/recommendation:'INVENTORY'/,'negative stock must recommend targeted inventory before ordering');
assert.match(repl,/recommendation:'TO'/,'central stock must prefer a transfer order');
assert.match(repl,/recommendation:'PO'/,'supplier PO must be available when depot stock is unavailable');
assert.match(repl,/recommendation:'COVERED'/,'existing inbound supply must suppress duplicate ordering');
assert.match(repl,/PROMO_TARGET_DAYS=7/,'promo items must receive extra replenishment coverage');
assert.match(repl,/INVENTORY_ADJUSTMENT/,'inventory adjustments must be included in Dynamics export staging');
assert.match(repl,/TRANSACTION_TYPE:'LOSS'/,'loss movements must be included in Dynamics export staging');
assert.match(repl,/Format pilote StoreOps/,'UI must state that exact F&O Data Management mapping still needs validation');
assert.match(repl,/Préparer TO/,'assistant must prepare transfer requests instead of auto-posting them');
assert.match(repl,/Préparer PO/,'assistant must prepare purchase order requests instead of auto-posting them');
assert.doesNotMatch(repl,/postPurchaseOrderToDynamics|createPurchaseOrderToDynamics/,'V1.59 must not create supplier orders automatically');
console.log('StoreOps V1.59 replenishment and Dynamics export assistant contract passed');

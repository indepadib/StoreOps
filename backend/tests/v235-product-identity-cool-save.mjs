import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const stock=read('backend/services/stock-signals.mjs');
const receiving=read('backend/services/dynamics-receiving.mjs');
const warehouseUi=read('frontend/js/warehouse-control.js');
const replenishmentUi=read('frontend/js/manager-replenishment-v2.js');
const performance=read('backend/services/business-pulse.mjs');
const sellThrough=read('backend/services/sell-through.mjs');
const cool=read('backend/services/cool-save.mjs');
const coolUi=read('frontend/js/pages/cool-save.js');
const model=read('docs/cool-save-operating-model.md');

assert.match(stock,/sourcing\.productName/,'rupture/stock signals must resolve a business label');
assert.match(receiving,/releasedProductSourcingMany/,'PO sync must resolve missing labels from ReleasedProducts');
assert.match(receiving,/cachedProductByProductNumber/,'existing receipt cache must backfill known labels');
assert.match(warehouseUi,/EAN/,'warehouse lines must show references alongside labels');
assert.match(replenishmentUi,/productNumber/);
assert.match(replenishmentUi,/EAN/);
assert.match(performance,/enrichProductNames/,'sold article breakdown must resolve labels');
assert.match(sellThrough,/releasedProductSourcingMany/,'sell-through must backfill article names');
assert.match(cool,/client_request_id/,'Cool Save create must be idempotent');
assert.match(coolUi,/type="button"/,'Cool Save actions must never submit an enclosing form');
assert.match(coolUi,/clientRequestId/,'Cool Save UI must send creation idempotency key');
assert.match(model,/RECEIVED_PAID/);
assert.match(model,/ERP_READY/);
assert.match(model,/PICKED_UP/);
assert.match(model,/no direct stock decrement in StoreOps/i);

console.log('V2.35 article identity + Cool Save operating model contract: OK');

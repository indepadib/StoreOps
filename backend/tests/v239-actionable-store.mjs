import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const batch=read('backend/services/manager-inbox-batch.mjs');
const home=read('frontend/js/pages/manager-home.js');
const hubs=read('frontend/js/pages/manager-hubs.js');
const network=read('frontend/js/pages/network.js');

assert.match(batch,/dueBucketFor/,'manager missions must expose an operational deadline bucket');
assert.match(batch,/ownerLabel/,'manager missions must expose a human owner');
assert.match(batch,/recommendedAction/,'manager missions must expose the next action');
assert.match(batch,/evidence/,'manager missions must expose supporting evidence');
assert.match(batch,/const due=\{now:/,'manager inbox summary must compute due-bucket counts');
assert.match(batch,/summary:\{total:sorted\.length,critical,blocking,p0,p1,due,/,'manager inbox summary must expose due-bucket counts');

assert.match(home,/item\.dueBucket==='NOW'/,'Today must prioritize explicit operational deadlines');
assert.match(home,/today-action-meta/,'Today mission cards must show owner and expected action');

assert.match(hubs,/const dueGroups=/,'validation board must group work by operational deadline');
assert.match(hubs,/Maintenant/);
assert.match(hubs,/Prochaines priorités/);
assert.match(hubs,/owner=i\.ownerLabel/);

assert.doesNotMatch(network,/\$\{cardInsert\}/,'network cards must never reference an undefined template variable');
assert.match(network,/network-customer-score/,'network cards must retain the Customer & fidélité block');

console.log('V2.39 actionable mission board + network regression: OK');

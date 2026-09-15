import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v185-manager-fastlane.db';
process.env.D365_MODE='simulated';
process.env.D365_STOCK_READ_MODE='simulated';
process.env.AUTH_MODE='demo';

await import('../services/pilot-profile.mjs');
const { db,todayISO }=await import('../db.mjs');
const { getManagerHomeFast }=await import('../services/manager-home-fast.mjs');
const { getManagerInboxBatch }=await import('../services/manager-inbox-batch.mjs');
const { handleManagerFastApi }=await import('../services/manager-fast-api.mjs');

const storeId='val-fleuri',day=todayISO();
const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
const director=db.prepare(`SELECT * FROM users WHERE id='u-ops'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
assert(manager,'Pilot store manager must exist');
assert(director,'Ops director must exist');

db.prepare(`DELETE FROM store_days WHERE store_id=? AND business_date=?`).run(storeId,day);
const before=db.prepare(`SELECT COUNT(*) n FROM store_days WHERE store_id=? AND business_date=?`).get(storeId,day).n;
const fast=getManagerHomeFast(storeId,day);
const after=db.prepare(`SELECT COUNT(*) n FROM store_days WHERE store_id=? AND business_date=?`).get(storeId,day).n;
assert.equal(before,0);
assert.equal(after,0,'manager fast path must remain read-only and must not materialize store_day');
assert.equal(fast.status,'READY');
assert.equal(fast.source,'STOREOPS_LOCAL');
assert.equal(fast.diagnostics.externalCalls,0);
assert.equal(fast.diagnostics.readOnly,true);
assert.equal(fast.dashboard.day.persisted,false);
assert(fast.staff&&fast.cold&&fast.cashOpen&&fast.loss&&fast.receipts&&fast.quality,'fast path must include local operational summaries');

const batch=await getManagerInboxBatch(storeId,day);
assert.equal(batch.status,'READY');
assert.equal(batch.source,'STOREOPS_BATCH');
assert.equal(batch.diagnostics.httpFanout,0);
assert(Array.isArray(batch.items));
assert(Array.isArray(batch.alerts));
assert(batch.summary&&Number.isFinite(batch.summary.total));
assert(batch.dashboard&&batch.stockData,'batch must contain dashboard and stock result');

const fakeReq={method:'GET'};
let r=await handleManagerFastApi({req:fakeReq,url:new URL(`http://local/api/stores/${storeId}/manager-home-fast?date=${day}`),user:manager});
assert.equal(r.status,200);
assert.equal(r.data.source,'STOREOPS_LOCAL');
r=await handleManagerFastApi({req:fakeReq,url:new URL(`http://local/api/stores/${storeId}/manager-inbox-batch?date=${day}`),user:manager});
assert.equal(r.status,200);
assert.equal(r.data.source,'STOREOPS_BATCH');

const foreignManager={...manager,id:'u-other',store_id:'other-store',role:'store_manager'};
r=await handleManagerFastApi({req:fakeReq,url:new URL(`http://local/api/stores/${storeId}/manager-home-fast`),user:foreignManager});
assert.equal(r.status,403,'manager must not read another store fast path');
r=await handleManagerFastApi({req:fakeReq,url:new URL(`http://local/api/stores/${storeId}/manager-home-fast`),user:director});
assert.equal(r.status,200,'ops director must access store fast path');

console.log('V1.85 manager fastlane contract: OK');

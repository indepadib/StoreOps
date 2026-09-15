import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v185-manager-home-fast.db';

const {db}=await import('../db.mjs');
const {getManagerHomeFast}=await import('../services/manager-home-fast.mjs');
const {handleBusinessPulseApi}=await import('../services/business-pulse-api.mjs');

const businessDate='2099-01-01';
db.prepare(`DELETE FROM store_days WHERE store_id='val-fleuri' AND business_date=?`).run(businessDate);
const before=db.prepare(`SELECT COUNT(*) n FROM store_days WHERE store_id='val-fleuri' AND business_date=?`).get(businessDate).n;
const snap=getManagerHomeFast('val-fleuri',businessDate);
const after=db.prepare(`SELECT COUNT(*) n FROM store_days WHERE store_id='val-fleuri' AND business_date=?`).get(businessDate).n;

assert.equal(before,0);
assert.equal(after,0,'Fast GET snapshot must not create a store day');
assert.equal(snap.status,'READY');
assert.equal(snap.source,'STOREOPS_LOCAL');
assert.equal(snap.diagnostics.externalCalls,0);
assert.equal(snap.diagnostics.readOnly,true);
assert.equal(snap.diagnostics.storeDayPersisted,false);
assert.equal(snap.dashboard.day.opening_status,'NOT_STARTED');
assert.equal(snap.dashboard.opening.total,0);
assert.equal(snap.dashboard.closing.total,0);
assert.ok(snap.staff);
assert.ok(snap.cold);
assert.ok(snap.cashOpen);
assert.ok(snap.loss);
assert.ok(snap.receipts);
assert.ok(snap.quality);

const allowed=await handleBusinessPulseApi({req:{method:'GET'},url:new URL(`http://localhost/api/stores/val-fleuri/manager-home-fast?date=${businessDate}`),user:{id:'u-vf',role:'store_manager',store_id:'val-fleuri'}});
assert.equal(allowed.status,200);
assert.equal(allowed.data.storeId,'val-fleuri');
const forbidden=await handleBusinessPulseApi({req:{method:'GET'},url:new URL(`http://localhost/api/stores/trefle/manager-home-fast?date=${businessDate}`),user:{id:'u-vf',role:'store_manager',store_id:'val-fleuri'}});
assert.equal(forbidden.status,403);

console.log('V1.85 manager-home fast path contract: OK');

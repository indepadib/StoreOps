import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v186-manager-inbox-batch.db';
process.env.D365_MODE='simulated';
process.env.D365_STOCK_READ_MODE='simulated';

const {db}=await import('../db.mjs');
const {getManagerInboxBatch}=await import('../services/manager-inbox-batch.mjs');
const {handleBusinessPulseApi}=await import('../services/business-pulse-api.mjs');

const businessDate='2099-02-01';
db.prepare(`DELETE FROM store_days WHERE store_id='val-fleuri' AND business_date=?`).run(businessDate);
db.prepare(`DELETE FROM commercial_controls WHERE store_id='val-fleuri' AND business_date=?`).run(businessDate);
const dayBefore=db.prepare(`SELECT COUNT(*) n FROM store_days WHERE store_id='val-fleuri' AND business_date=?`).get(businessDate).n;
const commercialBefore=db.prepare(`SELECT COUNT(*) n FROM commercial_controls WHERE store_id='val-fleuri' AND business_date=?`).get(businessDate).n;

const batch=await getManagerInboxBatch('val-fleuri',businessDate);
const dayAfter=db.prepare(`SELECT COUNT(*) n FROM store_days WHERE store_id='val-fleuri' AND business_date=?`).get(businessDate).n;
const commercialAfter=db.prepare(`SELECT COUNT(*) n FROM commercial_controls WHERE store_id='val-fleuri' AND business_date=?`).get(businessDate).n;
assert.equal(batch.status,'READY');
assert.equal(batch.source,'STOREOPS_BATCH');
assert.equal(batch.diagnostics.httpFanout,0);
assert.equal(batch.diagnostics.commercialReadOnly,true);
assert.equal(dayBefore,dayAfter,'Batch GET must not create store day');
assert.equal(commercialBefore,commercialAfter,'Batch GET must not synchronize or mutate commercial controls');
assert.ok(Array.isArray(batch.items));
assert.ok(Array.isArray(batch.alerts));
assert.ok(batch.dashboard);
assert.ok(batch.stockData);
assert.ok(batch.summary);

const own=await handleBusinessPulseApi({req:{method:'GET'},url:new URL(`http://localhost/api/stores/val-fleuri/manager-inbox-batch?date=${businessDate}`),user:{id:'u-vf',role:'store_manager',store_id:'val-fleuri'}});
assert.equal(own.status,200);
assert.equal(own.data.source,'STOREOPS_BATCH');
const forbidden=await handleBusinessPulseApi({req:{method:'GET'},url:new URL(`http://localhost/api/stores/trefle/manager-inbox-batch?date=${businessDate}`),user:{id:'u-vf',role:'store_manager',store_id:'val-fleuri'}});
assert.equal(forbidden.status,403);

console.log('V1.86 manager inbox batch contract: OK');

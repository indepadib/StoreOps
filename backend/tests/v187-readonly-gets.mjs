import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v187-readonly-gets.db';
process.env.D365_MODE='simulated';

const {db}=await import('../db.mjs');
const {handleBusinessPulseApi}=await import('../services/business-pulse-api.mjs');

const user={id:'u-vf',role:'store_manager',store_id:'val-fleuri'};
const businessDate='2099-03-01';
for(const table of ['store_days','commercial_controls','cash_closings']){
 const column=table==='store_days'?'business_date':table==='commercial_controls'?'business_date':'business_date';
 db.prepare(`DELETE FROM ${table} WHERE store_id='val-fleuri' AND ${column}=?`).run(businessDate);
}
const count=(table)=>db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE store_id='val-fleuri' AND business_date=?`).get(businessDate).n;
const before={days:count('store_days'),commercial:count('commercial_controls'),cash:count('cash_closings')};

const dashboard=await handleBusinessPulseApi({req:{method:'GET'},url:new URL(`http://localhost/api/stores/val-fleuri/dashboard?date=${businessDate}`),user});
assert.equal(dashboard.status,200);
assert.equal(dashboard.data.day.persisted,false);
assert.equal(dashboard.data.commercialSync.readOnly,true);
assert.equal(count('store_days'),before.days,'Dashboard GET must not create store day');
assert.equal(count('commercial_controls'),before.commercial,'Dashboard GET must not synchronize commercial controls');

const commercial=await handleBusinessPulseApi({req:{method:'GET'},url:new URL(`http://localhost/api/stores/val-fleuri/commercial?date=${businessDate}`),user});
assert.equal(commercial.status,200);
assert.equal(commercial.data.sync.readOnly,true);
assert.equal(count('commercial_controls'),before.commercial,'Commercial GET must be read-only');

const cash=await handleBusinessPulseApi({req:{method:'GET'},url:new URL(`http://localhost/api/stores/val-fleuri/cash-closing?date=${businessDate}`),user});
assert.equal(cash.status,200);
assert.equal(cash.data.sync.readOnly,true);
assert.equal(count('cash_closings'),before.cash,'Cash-closing GET must not create/sync a closing');
assert.equal(count('store_days'),before.days,'Cash-closing GET must not create store day');

const commercialSync=await handleBusinessPulseApi({req:{method:'POST'},url:new URL(`http://localhost/api/stores/val-fleuri/commercial/sync?date=${businessDate}`),user});
assert.equal(commercialSync,null,'Explicit commercial sync POST must fall through to the write route');
const cashSync=await handleBusinessPulseApi({req:{method:'POST'},url:new URL(`http://localhost/api/stores/val-fleuri/cash-closing/sync?date=${businessDate}`),user});
assert.equal(cashSync,null,'Explicit cash sync POST must fall through to the write route');

const forbidden=await handleBusinessPulseApi({req:{method:'GET'},url:new URL(`http://localhost/api/stores/trefle/dashboard?date=${businessDate}`),user});
assert.equal(forbidden.status,403);
console.log('V1.87 read-only compatibility GET contract: OK');

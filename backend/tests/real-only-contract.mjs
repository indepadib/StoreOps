import assert from 'node:assert/strict';
import fs from 'node:fs';

const testDb=`/tmp/storeops-real-only-${process.pid}.db`;
for(const suffix of ['','-wal','-shm']){try{fs.rmSync(testDb+suffix,{force:true})}catch{}}
process.env.STOREOPS_DB=testDb;
process.env.STOREOPS_MEDIA_DIR=`/tmp/storeops-real-only-media-${process.pid}`;
process.env.STOREOPS_REAL_ONLY='true';
process.env.D365_MODE='simulated'; // must be overridden by REAL_ONLY
process.env.D365_BARCODE_ENTITY='RetailInventItemBarcode';

const {config}=await import('../config.mjs');
const {db}=await import('../db.mjs');
await import('../services/commercial.mjs');
await import('../services/cash.mjs');
await import('../services/inventory.mjs');
await import('../services/loss.mjs');
await import('../services/cash-opening.mjs');
await import('../services/staffing.mjs');
const {enforceRealOnlyData}=await import('../services/real-only.mjs');
const {getProductByEan,getCommercialChanges}=await import('../services/dynamics.mjs');
const {getStaffingSnapshot}=await import('../services/dynamics-staffing.mjs');
const {getCashOpeningSnapshot}=await import('../services/dynamics-cash-opening.mjs');

assert.equal(config.realOnly,true,'STOREOPS_REAL_ONLY must enable the hard guardrail');
assert.equal(config.dynamics.mode,'live','REAL_ONLY must force Dynamics LIVE even when D365_MODE=simulated');

// db.mjs historically seeded these demo POs; the production cleanup must remove them.
assert.ok(db.prepare(`SELECT COUNT(*) n FROM receipts WHERE id IN ('rcpt_vf_10482','rcpt_tr_20411')`).get().n>=1,'fixture should exist before cleanup so the test proves removal');
const cleanup=enforceRealOnlyData();
assert.equal(cleanup.enabled,true);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM receipts WHERE id IN ('rcpt_vf_10482','rcpt_tr_20411')`).get().n,0,'legacy demo POs must be removed');
assert.equal(db.prepare(`SELECT COUNT(*) n FROM receipt_lines WHERE receipt_id IN ('rcpt_vf_10482','rcpt_tr_20411')`).get().n,0,'legacy demo PO lines must be removed');

await assert.rejects(()=>getProductByEan('3017620422003'),e=>['D365_CONFIG_INCOMPLETE','D365_MAPPING_REQUIRED'].includes(e?.code),'fake Nutella catalog must never be returned in real-only mode');
await assert.rejects(()=>getCommercialChanges('val-fleuri','2026-09-06'),e=>e?.code==='D365_CONFIG_INCOMPLETE','simulated price/promo queue must never be returned in real-only mode');
await assert.rejects(()=>getStaffingSnapshot('val-fleuri','2026-09-06'),e=>e?.code==='STAFFING_REAL_SOURCE_NOT_CONFIGURED','placeholder staffing must never be generated in real-only mode');

const vfCash=await getCashOpeningSnapshot('val-fleuri','2026-09-06');
assert.equal(vfCash.source,'STOREOPS_REAL_MASTER');
assert.deepEqual(vfCash.lines.map(x=>[x.tillCode,x.expectedFloat,x.tpeMode]),[['C01',1000,'INTEGRATED'],['C02',1000,'MANUAL']],'Val Fleuri confirmed tills/floats must remain available');
await assert.rejects(()=>getCashOpeningSnapshot('trefle','2026-09-06'),e=>e?.code==='CASH_OPENING_REAL_MASTER_NOT_CONFIGURED','unconfirmed stores must not receive generic tills');

try{db.close()}catch{}
for(const suffix of ['','-wal','-shm']){try{fs.rmSync(testDb+suffix,{force:true})}catch{}}
console.log('StoreOps V1.68 real-data-only contract passed');

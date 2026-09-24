import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v2308-fleg-${process.pid}.db`;

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {FLEG_20260924_BATCH,getCommercialPriceBatchChanges,commercialPriceBatch}=await import('../services/commercial-price-batches.mjs');
const {syncCommercialControls,listCommercialControls}=await import('../services/commercial.mjs');

assert.equal(FLEG_20260924_BATCH.lines.length,69);
assert.deepEqual(FLEG_20260924_BATCH.stores,['val-fleuri','trefle']);
const batch=commercialPriceBatch('FLEG-2026-09-24');
assert(batch);
assert.equal(batch.lines.length,69);
assert.equal(batch.effective_date,'2026-09-24');
assert.equal(batch.valid_to,'2026-10-08');

for(const storeId of ['val-fleuri','trefle']){
 db.prepare(`DELETE FROM commercial_controls WHERE store_id=?`).run(storeId);
 const source=getCommercialPriceBatchChanges(storeId,'2026-09-24');
 assert.equal(source.changes.length,69,`${storeId}: 69 FLEG actions expected`);
 assert.equal(source.diagnostics.activeLines,69);
 assert.equal(source.diagnostics.pendingLines,69);
 assert(source.changes.every(x=>x.actionType==='PRICE_CHANGE'));
 assert(source.changes.every(x=>x.source==='STOREOPS_PRICE_BATCH'));
 assert(source.changes.every(x=>x.sourceDetails?.type==='CENTRAL_PRICE_BATCH'));
 const melon=source.changes.find(x=>x.productNumber==='HS-003577');
 assert(melon);
 assert.equal(melon.expectedPrice,5.5);
 const cherry=source.changes.find(x=>x.productNumber==='HS-006594');
 assert(cherry);
 assert.equal(cherry.expectedPrice,80);

 const sync=syncCommercialControls({storeId,businessDate:'2026-09-24',changes:source.changes});
 assert.equal(sync.actionableCount,69);
 const rows=listCommercialControls(storeId,'2026-09-24').filter(x=>x.action_type==='PRICE_CHANGE');
 assert.equal(rows.length,69);

 const first=rows[0];
 db.prepare(`UPDATE commercial_controls SET status='VERIFIED' WHERE id=?`).run(first.id);
 const tomorrow=getCommercialPriceBatchChanges(storeId,'2026-09-25');
 assert.equal(tomorrow.changes.length,68,'verified batch line must not return next day');
 assert(!tomorrow.changes.some(x=>x.productNumber===first.product_number));
}

assert.equal(getCommercialPriceBatchChanges('val-fleuri','2026-10-09').changes.length,0,'campaign must stop after validTo');
console.log('V2.30.8 FLEG central price batch contract: OK');

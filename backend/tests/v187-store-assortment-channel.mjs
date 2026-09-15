import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v187-store-assortment.db';
process.env.D365_MODE='simulated';
process.env.D365_ASSORTMENT_READ_MODE='simulated';

await import('../services/pilot-profile.mjs');
const { db }=await import('../db.mjs');
const { replaceStoreAssortmentAssignments }=await import('../services/assortment-relations.mjs');
const { PRODUCT_ASSORTMENT_SOURCE }=await import('../services/assortment-category-mapping.mjs');
const { getStoreAssortmentAssignments }=await import('../services/assortment-admin.mjs');
const { storeAssortmentLookupConfig,storeAssortmentLookupReadiness,previewStoreAssortmentsFromDynamics,syncStoreAssortmentsFromDynamicsChannel }=await import('../services/dynamics-store-assortment.mjs');
const { handleMerchandisingApi }=await import('../services/merchandising-api.mjs');

const storeId='val-fleuri';
const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
assert(admin&&manager,'pilot users required');

const cfg=storeAssortmentLookupConfig(storeId);
assert.equal(cfg.entity,'RetailAssortmentLookupChannelGroupEntity');
assert.equal(cfg.assortmentField,'AssortmentId');
assert.equal(cfg.channelField,'RetailChannelId');
assert.equal(cfg.retailChannelId,'10001');
assert.equal(cfg.standardCandidate,true);
assert.equal(cfg.productSource,PRODUCT_ASSORTMENT_SOURCE);

const readiness=storeAssortmentLookupReadiness(storeId);
assert.equal(readiness.live,false);
assert.equal(readiness.filterHint,"RetailChannelId eq '10001'");

replaceStoreAssortmentAssignments({storeId,source:PRODUCT_ASSORTMENT_SOURCE,assignments:[{assortmentKey:'KEEP-ME',assortmentName:'Mapping manuel à conserver'}],complete:true});
const before=getStoreAssortmentAssignments(storeId);
assert.equal(before.items.length,1);
assert.equal(before.items[0].assortmentKey,'KEEP-ME');

const preview=await previewStoreAssortmentsFromDynamics(storeId);
assert.equal(preview.status,'DISABLED');
assert.deepEqual(preview.ids,[]);
await assert.rejects(()=>syncStoreAssortmentsFromDynamicsChannel(storeId),e=>e.code==='D365_STORE_ASSORTMENT_NOT_LIVE');
const after=getStoreAssortmentAssignments(storeId);
assert.equal(after.items.length,1,'disabled/failed automatic sync must preserve current mapping');
assert.equal(after.items[0].assortmentKey,'KEEP-ME');

let r=await handleMerchandisingApi({req:{method:'GET'},url:new URL(`http://local/api/admin/stores/${storeId}/assortments/dynamics-preview`),user:admin});
assert.equal(r.status,200);
assert.equal(r.data.status,'DISABLED');
r=await handleMerchandisingApi({req:{method:'GET'},url:new URL(`http://local/api/admin/stores/${storeId}/assortments/dynamics-preview`),user:manager});
assert.equal(r.status,403,'store manager must not use admin D365 assortment probe');

console.log('V1.87 safe store/channel assortment resolver contract: OK');

import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v223-dual-pilot.db';

const {storeOperationalSettings}=await import('../services/store-settings.mjs');
const {salesStoreIdentifiers}=await import('../services/d365-sales-mapping.mjs');

const pilots={
 'val-fleuri':{store:'FRP0001',channel:'10001',warehouse:'FRP0001',operatingUnit:'00000063',legalEntity:'5001'},
 trefle:{store:'FRP0002',channel:'10002',warehouse:'FRP0002',operatingUnit:'00000064',legalEntity:'5001'}
};

for(const [storeId,expected] of Object.entries(pilots)){
 const s=storeOperationalSettings(storeId);
 assert.equal(s.d365.storeNumber,expected.store);
 assert.equal(s.d365.retailChannelId,expected.channel);
 assert.equal(s.storeWarehouseId,expected.warehouse);
 assert.equal(s.d365.operatingUnitNumber,expected.operatingUnit);
 assert.equal(s.d365.legalEntityId,expected.legalEntity);
 const ids=salesStoreIdentifiers(storeId,'store');
 assert.deepEqual(ids[0],{kind:'STORE_NUMBER',value:expected.store});
 assert(ids.some(x=>x.kind==='RETAIL_CHANNEL'&&x.value===expected.channel));
 assert(ids.some(x=>x.kind==='WAREHOUSE'&&x.value===expected.warehouse));
}
console.log('V2.23 dual-pilot Val Fleuri + Trèfle contract: OK');

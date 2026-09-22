import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v227-commercial-delta.db';

await import('../services/pilot-profile.mjs');
const {syncCommercialControls,listCommercialControls}=await import('../services/commercial.mjs');

const storeId='val-fleuri';
syncCommercialControls({storeId,businessDate:'2026-09-21',changes:[{
 sourceKey:'D365-PRICE-BASE-HS-TEST-2026-09-21',stableKey:'D365-PRICE-BASE:HS-TEST',fingerprint:'p10',
 actionType:'PRICE_CHANGE',ean:'ITEM:HS-TEST',productNumber:'HS-TEST',productName:'HS-TEST',category:null,
 oldPrice:null,expectedPrice:10,promoLabel:'Nouveau prix de base 10.00 DH',signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,source:'D365_RETAIL_PRICING'
}]});
let day1=listCommercialControls(storeId,'2026-09-21');
assert.equal(day1.length,1);
assert.equal(day1[0].expected_price,10);

syncCommercialControls({storeId,businessDate:'2026-09-22',changes:[{
 sourceKey:'D365-PRICE-BASE-HS-TEST-2026-09-22',stableKey:'D365-PRICE-BASE:HS-TEST',fingerprint:'p12',
 actionType:'PRICE_CHANGE',ean:'6110000000001',productNumber:'HS-TEST',productName:'Melon test',category:'F&L',
 oldPrice:null,expectedPrice:12,promoLabel:'Nouveau prix de base 12.00 DH',signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,source:'D365_RETAIL_PRICING'
}]});
let day2=listCommercialControls(storeId,'2026-09-22');
assert.equal(day2.length,1);
assert.equal(day2[0].old_price,10);
assert.equal(day2[0].expected_price,12);
assert.equal(day2[0].product_name,'Melon test');
assert.equal(day2[0].ean,'6110000000001');

// Same source key: enrichment must repair an already-created incomplete card.
syncCommercialControls({storeId,businessDate:'2026-09-22',changes:[{
 sourceKey:day2[0].source_key,stableKey:'D365-PRICE-BASE:HS-TEST',fingerprint:'p12',
 actionType:'PRICE_CHANGE',ean:'6110000000001',productNumber:'HS-TEST',productName:'Melon test',category:'F&L',
 oldPrice:10,expectedPrice:12,promoLabel:'Nouveau prix de base 12.00 DH',signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,source:'D365_RETAIL_PRICING'
}],preserveExisting:true});
day2=listCommercialControls(storeId,'2026-09-22');
assert.equal(day2[0].product_name,'Melon test');
assert.equal(day2[0].ean,'6110000000001');
assert.equal(day2[0].old_price,10);

console.log('V2.27 commercial price identity + old price contract: OK');

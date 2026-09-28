import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v235-coolsave-${process.pid}.db`;
const {db}=await import('../db.mjs');
const {createCoolSaveBasket,publishCoolSaveBasket,listCoolSaveBaskets}=await import('../services/cool-save.mjs');

const user={id:'u-vf'},storeId='val-fleuri',clientRequestId='tap-001';
const input={storeId,user,title:'Panier test',salePrice:39,clientRequestId,items:[{productNumber:'SKU-1',productName:'Tomates cerises',quantity:1,unit:'kg',referenceUnitPrice:60}]};

const first=createCoolSaveBasket(input);
const duplicate=createCoolSaveBasket(input);
assert.equal(first.id,duplicate.id,'same client request must return the same basket');
assert.equal(db.prepare('SELECT COUNT(*) AS c FROM cool_save_baskets WHERE store_id=?').get(storeId).c,1);

const published=publishCoolSaveBasket({id:first.id,user});
assert.equal(published.id,first.id);
assert.equal(published.status,'PUBLISHED');
const rows=listCoolSaveBaskets(storeId);
assert.equal(rows.length,1,'publish must never create another basket');
assert.equal(rows.filter(x=>x.status==='DRAFT').length,0,'published basket must not leave a duplicate draft');
assert.equal(rows[0].lines[0].product_name,'Tomates cerises');

console.log('V2.35 Cool & Save publish/idempotency contract: OK');

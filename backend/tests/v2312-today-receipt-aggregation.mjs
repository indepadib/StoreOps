import assert from 'node:assert/strict';

process.env.STOREOPS_DB='/tmp/storeops-v2312-today-receipts.db';
process.env.D365_MODE='simulated';
process.env.D365_STOCK_READ_MODE='simulated';

const {db}=await import('../db.mjs');
const {getManagerInboxBatch,invalidateManagerInboxBatch}=await import('../services/manager-inbox-batch.mjs');

const storeId='val-fleuri',businessDate='2099-04-10';
const existing=db.prepare(`SELECT id FROM receipts WHERE store_id=?`).all(storeId);
for(const r of existing)db.prepare(`DELETE FROM receipt_lines WHERE receipt_id=?`).run(r.id);
db.prepare(`DELETE FROM receipts WHERE store_id=?`).run(storeId);

const receipt=db.prepare(`INSERT INTO receipts(id,store_id,po_number,vendor,eta,status) VALUES(?,?,?,?,?,?)`);
const line=db.prepare(`INSERT INTO receipt_lines(id,receipt_id,ean,product_name,category,ordered_qty,temperature_required) VALUES(?,?,?,?,?,?,?)`);

receipt.run('r-a',storeId,'PO-AGG-001','Fournisseur A','2099-04-09','EXPECTED');
receipt.run('r-b',storeId,'PO-AGG-002','Fournisseur B','2099-04-10','EXPECTED');
line.run('l-a1','r-a','111','Article A1','Epicerie',3,0);
line.run('l-a2','r-a','112','Article A2','Epicerie',5,0);
line.run('l-b1','r-b','113','Article B1','Frais',2,1);

invalidateManagerInboxBatch(storeId,businessDate);
const batch=await getManagerInboxBatch(storeId,businessDate,{force:true});
const receiptActions=batch.items.filter(x=>x.category==='RECEIPT');

assert.equal(receiptActions.length,1,'Today must expose one aggregated receipt action, not one action per article');
const action=receiptActions[0];
assert.equal(action.id,'receipt-summary');
assert.match(action.title,/2 réceptions à traiter/);
assert.match(action.detail,/3 lignes quantité \/ qualité à valider/);
assert.match(action.detail,/2 PO/);
assert.match(action.detail,/1 en retard/);
assert.equal(action.priority,'P0');
assert.equal(action.page,'receipts');
assert(!batch.items.some(x=>/^receipt-r-/.test(String(x.id))),'per-line receipt actions must not be generated');

console.log('V2.31.2 Today receipt aggregation contract: OK');

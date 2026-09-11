import assert from 'node:assert/strict';
import { db } from '../db.mjs';
import { lossExportStatus,generateLossClosingPack,confirmLossClosingPackImport } from '../services/loss-export.mjs';
import { blockingLossCount } from '../services/loss.mjs';

const storeId='val-fleuri',businessDate='2026-09-11',user=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get()||db.prepare(`SELECT * FROM users WHERE active=1 LIMIT 1`).get();
assert.ok(user,'seed user missing');
db.prepare(`DELETE FROM loss_export_runs WHERE store_id=? AND business_date=?`).run(storeId,businessDate);
db.prepare(`DELETE FROM loss_records WHERE store_id=? AND business_date=?`).run(storeId,businessDate);
for(const [i,name] of ['Test casse','Test périmé'].entries())db.prepare(`INSERT INTO loss_records(id,store_id,business_date,ean,product_number,product_name,category,reason_code,source_type,quantity,unit,unit_retail_value,total_retail_value,requires_evidence,evidence_satisfied,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(`loss-test-${i}`,storeId,businessDate,`611000000000${i}`,`SKU-${i}`,name,'Test',i?'EXPIRED':'BREAKAGE','MANUAL',i+1,'pièce',10,10*(i+1),0,1,'READY_TO_POST',user.id);

let status=lossExportStatus(storeId,businessDate);
assert.equal(status.openLines,2);assert.equal(status.ready,true);assert.equal(status.erpTemplateConfigured,false);
let pack=generateLossClosingPack({storeId,businessDate,user});
assert.equal(pack.confirmable,false);assert.match(pack.file.content,/Test casse/);
assert.throws(()=>confirmLossClosingPackImport({exportId:pack.run.id,user,reference:'TEST'}),e=>e.code==='LOSS_ERP_TEMPLATE_NOT_CONFIGURED');
assert.equal(blockingLossCount(storeId,businessDate),2);

process.env.STOREOPS_LOSS_EXPORT_TEMPLATE_JSON=JSON.stringify({code:'ERP_LOSS_TEST',name:'ERP loss import',target:'D365',version:'1',delimiter:';',extension:'csv',columns:[{name:'Item',source:'product_number',required:true},{name:'Qty',source:'quantity',required:true,type:'number',decimals:3},{name:'Reason',source:'reason_code',required:true}]});
status=lossExportStatus(storeId,businessDate);assert.equal(status.erpTemplateConfigured,true);
pack=generateLossClosingPack({storeId,businessDate,user});assert.equal(pack.confirmable,true);assert.equal(pack.run.target,'D365');
const confirmed=confirmLossClosingPackImport({exportId:pack.run.id,user,reference:'JOURNAL-TEST-001'});assert.equal(confirmed.status,'CONFIRMED');
assert.equal(blockingLossCount(storeId,businessDate),0);
const rows=db.prepare(`SELECT status,posted_method,posted_reference FROM loss_records WHERE store_id=? AND business_date=? ORDER BY id`).all(storeId,businessDate);assert.ok(rows.every(x=>x.status==='POSTED'&&x.posted_method==='FILE_IMPORT'&&x.posted_reference==='JOURNAL-TEST-001'));
console.log('StoreOps loss closing pack contract OK');

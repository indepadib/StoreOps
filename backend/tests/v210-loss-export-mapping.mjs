import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB=`/tmp/storeops-v210-loss-map-${process.pid}.db`;
delete process.env.STOREOPS_LOSS_EXPORT_TEMPLATE_JSON;

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {saveLossExportMappingDraft,previewLossExportMapping,activateLossExportMapping,disableLossExportMapping,effectiveLossExportTemplate,lossExportMappingSettings}=await import('../services/loss-export-mapping.mjs');
const {lossExportStatus}=await import('../services/loss-export.mjs');

const actor=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
assert(actor,'admin required');
db.prepare(`DELETE FROM loss_export_mapping_settings`).run();

const template={
 code:'D365_LOSS_TEST',name:'Dynamics loss test',target:'D365_FILE_IMPORT',version:'3',delimiter:';',extension:'csv',includeHeader:true,
 fileNamePattern:'loss_{storeId}_{businessDate}.{extension}',
 columns:[
  {name:'JournalDate',source:'business_date',required:true,type:'date'},
  {name:'Warehouse',source:'store_id',required:true},
  {name:'ItemId',source:'product_number',required:true},
  {name:'Qty',source:'quantity',required:true,type:'number',decimals:3},
  {name:'Reason',source:'reason_code',required:true}
 ]
};

let saved=saveLossExportMappingDraft({actor,input:template});
assert.equal(saved.state,'DRAFT');
assert.throws(()=>activateLossExportMapping({actor,reference:'TEST'}),e=>e.code==='LOSS_EXPORT_MAPPING_NOT_VALIDATED');

saved=previewLossExportMapping({actor});
assert.equal(saved.state,'VALIDATED');
assert.equal(saved.preview.status,'PASSED');
assert.match(saved.preview.header,/JournalDate;Warehouse;ItemId;Qty;Reason/);
assert.match(saved.preview.sampleContent,/HS-004873/);
assert.throws(()=>activateLossExportMapping({actor,reference:''}),e=>e.code==='LOSS_EXPORT_VALIDATION_REFERENCE_REQUIRED');

saved=activateLossExportMapping({actor,reference:'D365-TEST-BATCH-001'});
assert.equal(saved.state,'LIVE');
assert.equal(saved.validationReference,'D365-TEST-BATCH-001');
assert.equal(effectiveLossExportTemplate().code,'D365_LOSS_TEST');

const status=lossExportStatus('val-fleuri','2026-09-19');
assert.equal(status.erpTemplateConfigured,true);
assert.equal(status.erpTemplate.code,'D365_LOSS_TEST');
assert.equal(status.erpTemplate.source,'STOREOPS_MAPPING');

assert.throws(()=>saveLossExportMappingDraft({actor,input:{...template,columns:[{name:'Hack',source:'unknown_field',required:true}]}}),e=>e.code==='LOSS_EXPORT_TEMPLATE_SOURCE_INVALID');

saved=disableLossExportMapping({actor});
assert.equal(saved.state,'DISABLED');
assert.equal(effectiveLossExportTemplate(),null);
assert.equal(lossExportMappingSettings().state,'DISABLED');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const ui=read('frontend/js/admin-loss-export-mapping.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const auth=read('frontend/js/auth-entry.js');
const build=read('frontend/netlify-build.sh');

assert.match(ui,/Référence import test Dynamics/,'UI must require external Dynamics proof');
assert.match(ui,/\/api\/admin\/loss-export-mapping\/preview/,'UI must preview template');
assert.match(ui,/\/api\/admin\/loss-export-mapping\/activate/,'UI activation must use secured lifecycle');
assert.match(ui,/Source StoreOps/,'UI must map ERP columns to StoreOps fields');
assert.match(enhancements,/admin-loss-export-mapping\.js/,'Closing Pack Mapping Studio must lazy-load with integrations');
assert.match(enhancements,/const BUILD='2100'/,'enhancement cache must be 2100');
assert.match(auth,/const BUILD='2100'/,'auth cache build must be 2100');
assert.match(auth,/const BUILD_LABEL='2\.10\.0'/,'release label must be 2.10.0');
assert.match(build,/STOREOPS_RELEASE_BUILD:-2100/,'Netlify release build must be 2100');

console.log('V2.10 Closing Pack Mapping Studio contract: OK');

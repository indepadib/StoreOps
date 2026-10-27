import assert from 'node:assert/strict';
import {rmSync} from 'node:fs';

process.env.STOREOPS_DB=new URL(`./rawbt-test-${process.pid}.db`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1');
const mod=await import('../services/dlc-markdown.mjs');
const {db}=await import('../db.mjs');

const admin=db.prepare("SELECT * FROM users WHERE id='u-ops'").get();
assert.ok(admin,'u-ops Direction must exist in the pilot seed.');

assert.equal(mod.markdownBarcodeContent('MD20','HS-002345'),'250HS-002345');
assert.equal(mod.markdownBarcodeContent('MD50','HS-002456'),'221HS-002456');

const plusDays=n=>{const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const minusDays=n=>plusDays(-n);

const md20=mod.upsertMarkdownRule({user:admin,scopeType:'ALL',daysBeforeExpiry:15,markdownCode:'MD20',priority:100,actionMode:'RECOMMENDED',alertPriority:'HIGH'});
const md50=mod.upsertMarkdownRule({user:admin,scopeType:'ALL',daysBeforeExpiry:5,markdownCode:'MD50',priority:100,actionMode:'RECOMMENDED',alertPriority:'CRITICAL'});
assert.ok(md20.id&&md50.id);

const at10=mod.resolveMarkdownRule({store_id:'val-fleuri',expiry_date:plusDays(10)},mod.listMarkdownRules({activeOnly:true}));
assert.equal(at10.rule.markdown_code,'MD20');
const at4=mod.resolveMarkdownRule({store_id:'val-fleuri',expiry_date:plusDays(4)},mod.listMarkdownRules({activeOnly:true}));
assert.equal(at4.rule.markdown_code,'MD50');

const receipt={id:'receipt-test-split',store_id:'val-fleuri',po_number:'PO-EXPIRY-1'};
const line={id:'line-test-split',ean:'6110000000001',product_name:'Produit test DLC',category:'Autre'};
const product={ean:line.ean,name:line.product_name,productNumber:'HS-002345',category:'Autre',price:10,retailUnit:'pièce'};
const groups=[{expiryDate:plusDays(10),quantity:12,lotRef:'LOT-A',expiryType:'DLC'},{expiryDate:plusDays(20),quantity:8,lotRef:'LOT-B',expiryType:'DLC'}];
const created=mod.registerReceiptExpiryGroups({receipt,line,user:admin,acceptedQty:20,groups,product,unit:'pièce'});
assert.equal(created.length,2);
assert.notEqual(created[0].id,created[1].id);
assert.equal(created.reduce((s,x)=>s+Number(x.original_quantity??x.quantity),0),20);
const replay=mod.registerReceiptExpiryGroups({receipt,line,user:admin,acceptedQty:20,groups,product,unit:'pièce'});
assert.deepEqual(replay.map(x=>x.id),created.map(x=>x.id),'same receipt/date/lot must be idempotent');
assert.throws(()=>mod.registerReceiptExpiryGroups({receipt:{...receipt,id:'receipt-bad'},line:{...line,id:'line-bad'},user:admin,acceptedQty:20,groups:[{expiryDate:plusDays(10),quantity:19,lotRef:'BAD'}],product,unit:'pièce'}),/somme/i);

const rec0=mod.listMarkdownRecommendations('val-fleuri').find(x=>x.id===created[0].id);
assert.equal(rec0.markdownCode,'MD20');
assert.equal(rec0.quantityToReview,12);
assert.equal(rec0.quantityConfidence,'ESTIMATE_REQUIRES_PHYSICAL_CONFIRMATION');

assert.throws(()=>mod.createPrintJob({storeId:'val-fleuri',user:admin,operationIds:[],idempotencyKey:'no-op'}),/Aucune opération/);

mod.validatePosProfile({markdownCode:'MD20',user:admin,symbology:'CODE128',roundingDecimals:2,evidenceNote:'TEST AUTOMATISÉ - scénario de validation du gate POS',confirmed:true});
const printer=mod.upsertPrinter({user:admin,storeId:'val-fleuri',name:'Zebra Test',bridgeKey:'vf-test',protocol:'ZPL_BRIDGE',mediaWidthMm:60,mediaHeightMm:40,dpi:203,colorMode:'MONO_PRECOLORED',active:true,isDefault:true});
assert.equal(printer.is_default,1);

const op=mod.createMarkdownOperation({dlcId:created[0].id,user:admin,quantity:7,markdownCode:'MD20',originalPrice:10,idempotencyKey:'partial-seven'});
assert.equal(op.quantity,7);
assert.equal(op.barcode_content,'250HS-002345');
assert.equal(op.final_price,8);
assert.equal(op.status,'APPROVED');

const remaining=mod.listMarkdownRecommendations('val-fleuri').find(x=>x.id===created[0].id);
assert.equal(remaining.quantityToReview,5,'partial 7 / 12 must leave 5 for review');

const job=mod.createPrintJob({storeId:'val-fleuri',user:admin,operationIds:[op.id],printerId:printer.id,idempotencyKey:'print-seven'});
assert.equal(job.total_labels,7);
assert.equal((job.payload.match(/\^XA/g)||[]).length,7,'exactly seven ZPL labels must be generated');
const sameJob=mod.createPrintJob({storeId:'val-fleuri',user:admin,operationIds:[op.id],printerId:printer.id,idempotencyKey:'print-seven'});
assert.equal(sameJob.id,job.id,'print idempotency must return the existing job');

const claimed=mod.claimPrintJob({bridgeKey:'vf-test'});
assert.equal(claimed.id,job.id);
assert.equal(claimed.status,'PRINTING');
const failed=mod.completePrintJob({jobId:job.id,bridgeKey:'vf-test',success:false,error:'printer offline'});
assert.equal(failed.status,'FAILED');
const retried=mod.retryPrintJob({jobId:job.id,user:admin});
assert.equal(retried.status,'PENDING');
const claimed2=mod.claimPrintJob({bridgeKey:'vf-test'});
mod.completePrintJob({jobId:claimed2.id,bridgeKey:'vf-test',success:true});
const applied=mod.confirmLabelsApplied({operationId:op.id,user:admin});
assert.equal(applied.status,'APPLIED');

const expired=mod.registerReceiptExpiryGroups({receipt:{...receipt,id:'receipt-expired'},line:{...line,id:'line-expired'},user:admin,acceptedQty:2,groups:[{expiryDate:minusDays(2),quantity:2,lotRef:'EXP'}],product:{...product,productNumber:'HS-002456'},unit:'pièce'})[0];
const expRec=mod.listMarkdownRecommendations('val-fleuri',{includeProcessed:true}).find(x=>x.id===expired.id);
assert.equal(expRec.status,'EXPIRED_WITHDRAW');
assert.throws(()=>mod.createMarkdownOperation({dlcId:expired.id,user:admin,quantity:1,markdownCode:'MD50',originalPrice:10,idempotencyKey:'expired'}),/périmé/i);

const monitor=mod.runMarkdownMonitor();
assert.ok(monitor.opened>=1);
assert.ok(mod.listMarkdownAlerts('val-fleuri').some(x=>x.dlc_id===expired.id&&x.alert_type==='EXPIRED'));

// Android handoff must not compete with the store bridge or claim twice.
const mobile=mod.upsertPrinter({user:admin,storeId:'val-fleuri',name:'LNX3 RawBT',bridgeKey:'vf-test',protocol:'ZPL_RAWBT'});
const mobileOp=mod.createMarkdownOperation({dlcId:created[0].id,user:admin,quantity:1,markdownCode:'MD20',originalPrice:10,idempotencyKey:'rawbt-one'});
const mobileJob=mod.createPrintJob({storeId:'val-fleuri',user:admin,operationIds:[mobileOp.id],printerId:mobile.id,idempotencyKey:'rawbt-job'});
assert.equal(mod.claimPrintJob({bridgeKey:'vf-test'}),null,'PC must never consume Android jobs');
assert.throws(()=>mod.mobilePrintJob({jobId:mobileJob.id,user:{id:'outsider',role:'employee',store_id:'other'},action:'prepare'}),e=>e.status===403);
const handoff=mod.mobilePrintJob({jobId:mobileJob.id,user:admin,action:'prepare'});
assert.equal(handoff.status,'PRINTING');
assert.ok(handoff.payload.startsWith('^XA'));
assert.throws(()=>mod.mobilePrintJob({jobId:mobileJob.id,user:admin,action:'prepare'}),e=>e.status===409);
assert.throws(()=>mod.mobilePrintJob({jobId:mobileJob.id,user:admin,action:'confirm'}),e=>e.status===409);
assert.equal(mod.mobilePrintJob({jobId:mobileJob.id,user:admin,action:'confirm',confirmed:true}).status,'PRINTED');
assert.throws(()=>mod.mobilePrintJob({jobId:mobileJob.id,user:admin,action:'failed',confirmed:true}),e=>e.status===409);
assert.throws(()=>mod.upsertPrinter({id:mobile.id,user:admin,storeId:'other',protocol:'ZPL_RAWBT'}),e=>e.status===404);
const {rawbtLink}=await import('../../frontend/js/rawbt-print.js');
const zpl='^XA^CI28^FDÉtiquette DLC^FS^XZ';
assert.equal(Buffer.from(rawbtLink(zpl).split(',')[1],'base64').toString('utf8'),zpl);
assert.throws(()=>rawbtLink('x'.repeat(180001)),/volumineux/);
console.log('RawBT: store isolation, single claim, explicit confirmation, UTF-8 payload OK');
db.close();
rmSync(process.env.STOREOPS_DB,{force:true});
console.log('V2.41 DLC markdown + print spooler contract: OK');

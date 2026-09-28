import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-v234-${process.pid}.db`;
const {normalizeReleasedProductSupplyMode}=await import('../services/released-product-sourcing.mjs');
const {recommendReplenishment}=await import('../services/replenishment-engine.mjs');

assert.equal(normalizeReleasedProductSupplyMode('DC'),'WAREHOUSE');
assert.equal(normalizeReleasedProductSupplyMode('Direct'),'DIRECT_SUPPLIER');
assert.equal(normalizeReleasedProductSupplyMode('direct fournisseur'),'DIRECT_SUPPLIER');
assert.equal(normalizeReleasedProductSupplyMode('LVE Lakhya'),'WAREHOUSE');
assert.equal(normalizeReleasedProductSupplyMode('Autre'),null);

let r=recommendReplenishment({storeAvailable:0,dailySales7:5,dailySales28:5,leadTimeDays:1,safetyDays:1,supplyMode:'DIRECT_SUPPLIER',supplierAccount:'V001'});
assert.equal(r.decision,'DIRECT_ORDER');
assert.equal(r.actionQty,10);
assert.equal(r.inputs.supplierAccount,'V001');

r=recommendReplenishment({storeAvailable:0,dailySales7:5,dailySales28:5,leadTimeDays:1,safetyDays:1,supplyMode:'WAREHOUSE',supplyAvailable:30});
assert.equal(r.decision,'REPLENISH');
assert.equal(r.actionQty,10);

r=recommendReplenishment({storeAvailable:0,dailySales7:5,dailySales28:5,leadTimeDays:1,safetyDays:1,supplyMode:'WAREHOUSE',supplyAvailable:0});
assert.equal(r.decision,'WAREHOUSE_OUT');

r=recommendReplenishment({storeAvailable:0,dailySales7:5,dailySales28:5,leadTimeDays:1,safetyDays:1,supplyMode:null});
assert.equal(r.decision,'NEED_SOURCING_DATA');

const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const item=read('backend/services/item-assistant.mjs');
const stock=read('backend/services/stock-signals.mjs');
const warehouse=read('backend/services/warehouse-control.mjs');
const req=read('backend/services/replenishment-requests.mjs');
const glovo=read('backend/services/glovo-availability.mjs');
const growthApi=read('backend/services/store-growth-api.mjs');
const cool=read('backend/services/cool-save.mjs');
const scan=read('frontend/js/mobile-barcode.js');
const pda=read('frontend/js/pda-mode.js');
const ops=read('frontend/js/enhancements-entry.js');
const mgrMore=read('frontend/js/manager-more-simplified.js');
const managerScan=read('frontend/js/pages/manager-scan.js');

assert.match(item,/releasedProductSourcing/);
assert.match(item,/DIRECT_ORDER/);
assert.match(stock,/releasedProductSourcingMany/);
assert.match(stock,/supplyMode/);
assert.match(warehouse,/DIRECT_PURCHASE/);
assert.match(warehouse,/DC_PURCHASE/);
assert.match(warehouse,/directSupplierGroups/);
assert.match(req,/DIRECT_ORDER/);
assert.match(req,/primaryVendorAccount/);
assert.match(glovo,/privacyMode:'AVAILABILITY_ONLY'/);
assert.match(glovo,/products=snapshot\.items\.map\(x=>\(\{sku:x\.sku,active:x\.active\}\)\)/);
assert.doesNotMatch(glovo,/products=snapshot\.items\.map\(x=>\(\{[^}]*quantity/);
assert.match(growthApi,/sell-through/);
assert.match(growthApi,/cool-save/);
assert.match(cool,/cool_save_baskets/);
assert.match(scan,/#managerScanEan/);
assert.match(scan,/Html5Qrcode\.getCameras/);
assert.match(pda,/Honeywell|Datalogic/);
assert.match(pda,/installWedge/);
assert.match(ops,/Vendre & anti-gaspi/);
assert.match(ops,/ux191-ops-choice/);
assert.match(mgrMore,/Invendus & rotation/);
assert.match(mgrMore,/Cool & Save/);
assert.match(managerScan,/DC · LVE Lakhyayta/);
assert.match(managerScan,/Direct fournisseur/);

console.log('V2.34 sourcing + growth + PDA UX contract: OK');

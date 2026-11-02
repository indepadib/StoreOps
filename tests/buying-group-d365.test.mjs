import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {projectPurchaseHeaders,serveBuyingD365} from '../backend/services/buying-group-d365.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const router=read('backend/services/buying-group-api.mjs');
const cockpit=read('frontend/js/pages/buying-group.js');
const d365=read('backend/services/buying-group-d365.mjs');
const fields={dataAreaField:'dataAreaId',purchaseOrderField:'PurchaseOrderNumber',vendorField:'OrderVendorAccountNumber',
  vendorNameField:'PurchaseOrderName',headerStatusField:'PurchaseOrderStatus',
  creationDateField:'AccountingDate',headerDateField:'RequestedDeliveryDate',headerWarehouseField:'DefaultReceivingWarehouseId'};

test('D365: strict company allowlist after OData response, including mixed-case area',()=>{
  const rows=[
    {dataAreaId:'frp',PurchaseOrderNumber:'PO-001',OrderVendorAccountNumber:'V001',PurchaseOrderName:'Fournisseur Franprix',PurchaseOrderStatus:'Backorder',AccountingDate:'2026-10-30',DefaultReceivingWarehouseId:'VF'},
    {dataAreaId:'OTH',PurchaseOrderNumber:'PO-002',OrderVendorAccountNumber:'V777',PurchaseOrderName:'Autre société'},
    {dataAreaId:'FRP',PurchaseOrderNumber:'PO-003',OrderVendorAccountNumber:'V009',PurchaseOrderName:'Deuxième fournisseur'},
    {dataAreaId:undefined,PurchaseOrderNumber:'PO-004',OrderVendorAccountNumber:'V005'}
  ];
  const result=projectPurchaseHeaders(rows,'frp',fields);
  assert.deepEqual(result.map(x=>x.purchaseOrderNumber),['PO-001','PO-003']);
  assert.deepEqual(result.map(x=>x.supplierAccount),['V001','V009']);
  assert.equal(result[0].creationDate,'2026-10-30');
});
test('D365: same-company duplicate PO header is deduplicated',()=>{
  const result=projectPurchaseHeaders([{dataAreaId:'frp',PurchaseOrderNumber:'PO-100'},{dataAreaId:'frp',PurchaseOrderNumber:'PO-100'}],'frp',fields);
  assert.equal(result.length,1);
});
test('D365: an unscoped record never leaks into the preview',()=>{
  const result=projectPurchaseHeaders([{PurchaseOrderNumber:'PO-999',OrderVendorAccountNumber:'V001'}],'frp',fields);
  assert.equal(result.length,0);
});
test('D365: API rejects write methods before any ERP connection',async()=>{
  const result=await serveBuyingD365(new Request('https://example.test/api/buying-group/dynamics/po-sample',{method:'POST'}));
  assert.equal(result.status,405);
});
test('D365: sampling is bounded, on-demand and cannot become a cross-company financial ledger',()=>{
  assert.match(d365,/const pageSize=60/);
  assert.match(d365,/maxRows:pageSize/);
  assert.match(d365,/isD365ReadLive\('receiving'\)/);
  assert.match(d365,/filter,extra:'cross-company=true'/);
  assert.match(d365,/projectPurchaseHeaders\(payload.value,company/);
  assert.match(d365,/isFinancialLedger:false/);
  assert.match(d365,/writeEnabled:false/);
  assert.match(cockpit,/data-bg-group-po/);
  assert.match(cockpit,/api\('\/api\/buying-group\/dynamics\/po-sample'/);
  assert.match(router,/serveBuyingD365\(req\)/);
});
test('D365: cockpit does not incorrectly assert absence of imported financial records',()=>{
  assert.doesNotMatch(cockpit,/0 DONNÉE FINANCIÈRE CRÉÉE/);
  assert.match(cockpit,/AUCUNE ÉCRITURE ERP/);
});

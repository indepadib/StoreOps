import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v2311-label-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';
process.env.D365_LABEL_DATA_SOURCE_ID='Promo Label';
delete process.env.D365_LABEL_PRINT_SERVICE_PATH;

let servicePost=null;
globalThis.fetch=async (url,options={})=>{
 const s=String(url);
 if(s.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(s.includes('/data/DocumentRoutingPrinters')){
  return new Response(JSON.stringify({value:[
   {PrinterName:'Honeywell PC42E-T (ValFleuri1)',PrinterPath:'Honeywell PC42E-T (ValFleuri1)',PrinterIsActive:'Yes',PrinterId:'907c923e-6999-4ada-9055-21c570cc7be2',PrinterCompanyId:'5001',ClientApplicationId:'vf-client'},
   {PrinterName:'Honeywell PC42E-T (Trefel)',PrinterPath:'Honeywell PC42E-T (Trefel)',PrinterIsActive:'Yes',PrinterId:'fe8339c7-b8ba-481c-b5ed-d0730e654636',PrinterCompanyId:'5001',ClientApplicationId:'tr-client'},
   {PrinterName:'VZebraPrinter',PrinterPath:'VZebraPrinter',PrinterIsActive:'Yes',PrinterId:'vz',PrinterCompanyId:'5001',ClientApplicationId:'other'}
  ]}),{status:200,headers:{'content-type':'application/json'}});
 }
 if(s.includes('/api/services/StoreOpsIntegration/LabelPrintService/printProductLabel')){
  servicePost={url:s,method:options.method,body:JSON.parse(options.body||'{}')};
  return new Response(JSON.stringify({requestId:'PRINT-1',status:'Queued'}),{status:200,headers:{'content-type':'application/json'}});
 }
 throw new Error('Unexpected URL '+s);
};

const {labelPrintingConfig,printProductLabel}=await import('../services/label-printing.mjs');

const vf=await labelPrintingConfig('val-fleuri');
assert.equal(vf.status,'CONNECTOR_REQUIRED');
assert.equal(vf.printer.name,'Honeywell PC42E-T (ValFleuri1)');
assert.equal(vf.dataSourceId,'Promo Label');
assert.equal(vf.canPrint,false);

const tr=await labelPrintingConfig('trefle');
assert.equal(tr.status,'CONNECTOR_REQUIRED');
assert.equal(tr.printer.name,'Honeywell PC42E-T (Trefel)');
assert.equal(tr.canPrint,false);

await assert.rejects(
 ()=>printProductLabel({storeId:'val-fleuri',user:null,productNumber:'HS-003577',quantity:1}),
 e=>e?.code==='LABEL_PRINT_D365_CONNECTOR_REQUIRED'
);
assert.equal(servicePost,null,'StoreOps must never fake or enqueue a print without the D365 connector');

process.env.D365_LABEL_PRINT_SERVICE_PATH='/api/services/StoreOpsIntegration/LabelPrintService/printProductLabel';
const sent=await printProductLabel({storeId:'trefle',user:null,productNumber:'HS-003577',ean:'TESTEAN',quantity:2,businessDate:'2026-09-25'});
assert.equal(sent.status,'SENT');
assert.equal(sent.printer.name,'Honeywell PC42E-T (Trefel)');
assert(servicePost);
assert.equal(servicePost.method,'POST');
assert.equal(servicePost.body.itemNumber,'HS-003577');
assert.equal(servicePost.body.storeNumber,'FRP0002');
assert.equal(servicePost.body.warehouseId,'FRP0002');
assert.equal(servicePost.body.labelLayoutDataSourceId,'Promo Label');
assert.equal(servicePost.body.printerName,'Honeywell PC42E-T (Trefel)');
assert.equal(servicePost.body.quantity,2);

console.log('V2.31.1 label printing connector contract: OK');

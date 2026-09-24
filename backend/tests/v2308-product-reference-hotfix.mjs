import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v2308-product-reference-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_PRODUCT_READ_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';
process.env.D365_PRODUCT_ENTITY='ReleasedProductsV2';
process.env.D365_PRODUCT_NUMBER_FIELD='ProductNumber';
process.env.D365_PRODUCT_NAME_FIELD='ProductName';
process.env.D365_BARCODE_ENTITY='RetailInventItemBarcode';
process.env.D365_BARCODE_PRODUCT_FIELD='itemId';
process.env.D365_BARCODE_DESCRIPTION_FIELD='description';
process.env.D365_BARCODE_FIELD='itemBarCode';

const seen=[];
const json=value=>new Response(JSON.stringify({value}),{status:200,headers:{'content-type':'application/json'}});
globalThis.fetch=async url=>{
 const u=decodeURIComponent(String(url)).replaceAll('+',' ');seen.push(u);
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/RetailInventItemBarcode')){
   if(u.includes("itemBarCode eq 'HS-003577'"))return json([]);
   if(u.includes("itemBarCode eq '6110000035775'"))return json([{itemBarCode:'6110000035775',itemId:'HS-003577',description:'Melon jaune',UnitID:'kg',dataAreaId:'5001'}]);
   if(u.includes("itemId eq 'HS-003577'"))return json([{itemBarCode:'6110000035775',itemId:'HS-003577',description:'Melon jaune',UnitID:'kg',dataAreaId:'5001'}]);
   return json([]);
 }
 if(u.includes('/data/ReleasedProductsV2')){
   if(u.includes('$select')&&u.includes('ProductName'))throw new Error('ProductName must never be selected on ReleasedProductsV2');
   if(u.includes("ProductNumber eq 'HS-003577'"))return json([{dataAreaId:'5001',ProductNumber:'HS-003577',ProductSearchName:'Melon jaune',InventoryUnitSymbol:'g',SalesUnitSymbol:'kg'}]);
   return json([]);
 }
 throw new Error('Unexpected URL '+u);
};

const {getProductByReference,getProductByEan}=await import('../services/dynamics.mjs');

const byCode=await getProductByReference('HS-003577');
assert(byCode);
assert.equal(byCode.lookupType,'PRODUCT_NUMBER');
assert.equal(byCode.productNumber,'HS-003577');
assert.equal(byCode.name,'Melon jaune');
assert.equal(byCode.ean,'6110000035775');
assert.equal(byCode.inventoryUnit,'g');
assert.equal(byCode.salesUnit,'kg');

const byEan=await getProductByEan('6110000035775');
assert(byEan);
assert.equal(byEan.productNumber,'HS-003577');
assert.equal(byEan.name,'Melon jaune');
assert.equal(byEan.inventoryUnit,'g');
assert.equal(byEan.salesUnit,'kg');

assert(!seen.some(u=>u.includes('$select')&&u.includes('ProductName')),'ReleasedProductsV2 lookup must never request invalid ProductName in $select');
console.log('V2.30.8 product reference schema-safe lookup: OK');

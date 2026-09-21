import assert from 'node:assert/strict';
process.env.D365_DEFAULT_PRICE_GROUP='Franprix';

const {selectApplicableSalesPriceAgreement}=await import('../services/dynamics-price.mjs');

const rows=[
 {RecordId:'expired',ItemNumber:'SKU',Price:10,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'kg',PriceApplicableFromDate:'2026-07-13T12:00:00Z',PriceApplicableToDate:'2026-07-31T12:00:00Z',PriceCustomerGroupCode:'Franprix',CustomerAccountNumber:'',PriceWarehouseId:'',PriceSiteId:'',FromQuantity:0,ToQuantity:0},
 {RecordId:'generic',ItemNumber:'SKU',Price:12,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'kg',PriceApplicableFromDate:'2026-09-01T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franprix',CustomerAccountNumber:'',PriceWarehouseId:'',PriceSiteId:'',FromQuantity:0,ToQuantity:0},
 {RecordId:'vf',ItemNumber:'SKU',Price:11,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'kg',PriceApplicableFromDate:'2026-09-10T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franp VF',CustomerAccountNumber:'',PriceWarehouseId:'FRP0001',PriceSiteId:'',FromQuantity:0,ToQuantity:0},
 {RecordId:'wrong-unit',ItemNumber:'SKU',Price:5,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'PC',PriceApplicableFromDate:'2026-09-10T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franp VF',CustomerAccountNumber:'',PriceWarehouseId:'FRP0001',PriceSiteId:'',FromQuantity:0,ToQuantity:0},
 {RecordId:'customer',ItemNumber:'SKU',Price:4,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'kg',PriceApplicableFromDate:'2026-09-10T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franp VF',CustomerAccountNumber:'CUST1',PriceWarehouseId:'FRP0001',PriceSiteId:'',FromQuantity:0,ToQuantity:0},
 {RecordId:'wrong-wh',ItemNumber:'SKU',Price:3,PriceCurrencyCode:'MAD',SalesPriceQuantity:1,QuantityUnitySymbol:'kg',PriceApplicableFromDate:'2026-09-10T12:00:00Z',PriceApplicableToDate:'2026-09-30T12:00:00Z',PriceCustomerGroupCode:'Franp VF',CustomerAccountNumber:'',PriceWarehouseId:'FRP0002',PriceSiteId:'',FromQuantity:0,ToQuantity:0}
];

const vf=selectApplicableSalesPriceAgreement(rows,{businessDate:'2026-09-21',priceGroups:['Franprix','Franp VF'],warehouseId:'FRP0001',quantity:1,expectedUnit:'kg'});
assert.equal(vf.status,'APPLICABLE');
assert.equal(vf.selected.recordId,'vf','Val Fleuri-specific group/warehouse should outrank generic Franprix');
assert.equal(vf.selected.unitPrice,11);

const tr=selectApplicableSalesPriceAgreement(rows,{businessDate:'2026-09-21',priceGroups:['Franprix'],warehouseId:'FRP0002',quantity:1,expectedUnit:'kg'});
assert.equal(tr.selected.recordId,'generic','Trèfle must not inherit Val Fleuri-specific price group');

const july=selectApplicableSalesPriceAgreement(rows,{businessDate:'2026-08-15',priceGroups:['Franprix'],warehouseId:'FRP0002',quantity:1,expectedUnit:'kg'});
assert.equal(july.status,'NONE','expired agreements must not leak into current pricing');

const qtyRows=[{...rows[1],RecordId:'qty',Price:20,SalesPriceQuantity:2,FromQuantity:2,ToQuantity:10}];
assert.equal(selectApplicableSalesPriceAgreement(qtyRows,{businessDate:'2026-09-21',priceGroups:['Franprix'],warehouseId:'FRP0002',quantity:1,expectedUnit:'kg'}).status,'NONE');
const qty2=selectApplicableSalesPriceAgreement(qtyRows,{businessDate:'2026-09-21',priceGroups:['Franprix'],warehouseId:'FRP0002',quantity:2,expectedUnit:'kg'});
assert.equal(qty2.selected.unitPrice,10,'agreement price must be normalized by SalesPriceQuantity');

console.log('V2.24 dual-pilot Trade Agreement resolution: OK');

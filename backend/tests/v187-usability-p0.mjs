import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v187-usability-p0.db';
process.env.STOREOPS_REAL_ONLY='true';
process.env.D365_MODE='live';
process.env.D365_PRODUCT_READ_MODE='live';
process.env.D365_STOCK_READ_MODE='live';
process.env.D365_PRICE_READ_MODE='live';
process.env.D365_PROMOTION_READ_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant-test';
process.env.D365_CLIENT_ID='client-test';
delete process.env.D365_CLIENT_SECRET;
process.env.D365_BARCODE_ENTITY='RetailInventItemBarcode';
process.env.D365_PRODUCT_ENTITY='ReleasedProductsV2';
process.env.D365_BARCODE_FIELD='itemBarCode';
process.env.D365_BARCODE_PRODUCT_FIELD='itemId';
process.env.D365_BARCODE_DESCRIPTION_FIELD='description';
process.env.D365_BARCODE_UNIT_FIELD='UnitID';
process.env.D365_STOCK_ENTITY='WarehousesOnHandV2';
process.env.D365_STOCK_PRODUCT_FIELD='ItemNumber';
process.env.D365_STOCK_WAREHOUSE_FIELD='InventoryWarehouseId';
process.env.D365_STOCK_AVAILABLE_FIELD='AvailableOnHandQuantity';
process.env.D365_STOCK_PHYSICAL_FIELD='OnHandQuantity';
process.env.D365_STORE_WAREHOUSES='val-fleuri=FRP0001';
process.env.D365_DEFAULT_SUPPLY_WAREHOUSE='LVE Lakhya';
process.env.D365_DATA_AREA_ID='5001';

const { rememberProductIdentity,cachedProductByEan }=await import('../services/product-cache.mjs');
const { getStoreProductByEan }=await import('../services/dynamics-stock.mjs');
const { buildPriceCheckContext }=await import('../services/price-check.mjs');
const { buildItemAssistant }=await import('../services/item-assistant.mjs');
const { syncStoreAssortmentSnapshot,classifyAvailability }=await import('../services/assortment.mjs');

const cached=rememberProductIdentity({ean:'4012',productNumber:'HS-003584',name:'Banane au KG',category:'Fruits & légumes',unit:'KG',source:'D365'});
assert.equal(cached?.productNumber,'HS-003584');
assert.equal(cachedProductByEan('4012')?.name,'Banane au KG');

syncStoreAssortmentSnapshot({storeId:'val-fleuri',source:'TEST',assortmentKey:'franprix-complementaire-plus',assortmentName:'Franprix - Complémentaire +',products:['HS-003584'],complete:true});

const product=await getStoreProductByEan('val-fleuri','4012');
assert.equal(product.productNumber,'HS-003584');
assert.equal(product.identityFallback,true,'Known item identity should fall back to StoreOps cache when D365 auth is unavailable');
assert.equal(product.stockUnavailable,true,'Stock should be explicitly unavailable, never zero');
assert.equal(product.availableStock,null);
assert.equal(product.stock,null);
assert.equal(product.stockSource,'D365_UNAVAILABLE');

const priceCtx=await buildPriceCheckContext({storeId:'val-fleuri',ean:'4012',businessDate:'2026-09-17'});
assert.equal(priceCtx.product.productNumber,'HS-003584');
assert.equal(priceCtx.partial,true);
assert.equal(priceCtx.expectedUnitPrice,null,'Missing Dynamics credential must never invent a price');
assert(priceCtx.integrationErrors?.identity||priceCtx.integrationErrors?.pricing||priceCtx.integrationErrors?.stock,'Partial item must expose integration degradation');

const assistant=await buildItemAssistant({storeId:'val-fleuri',ean:'4012',businessDate:'2026-09-17'});
assert.equal(assistant.item.productNumber,'HS-003584');
assert.equal(assistant.item.identityFallback,true);
assert.equal(assistant.storeStock.availableStock,null);
assert.equal(assistant.availability.state,'STOCK_UNKNOWN','Unknown stock must not become out of stock');
assert.notEqual(assistant.availability.state,'OUT_OF_STOCK');
assert.equal(assistant.replenishment.ready,false,'No smart replenishment can be emitted without real store stock');
assert.equal(assistant.dataQuality.partial,true);
assert(assistant.integrationHealth.issues.includes('stock'));

const unknown=classifyAvailability({storeId:'val-fleuri',productNumber:'HS-003584',availableQty:null});
assert.equal(unknown.state,'STOCK_UNKNOWN');
assert.equal(unknown.stockKnown,false);
const realZero=classifyAvailability({storeId:'val-fleuri',productNumber:'HS-003584',availableQty:0});
assert.equal(realZero.state,'OUT_OF_STOCK');
assert.equal(realZero.stockKnown,true);

let unseenError=null;
try{await getStoreProductByEan('val-fleuri','9999999999999')}catch(e){unseenError=e}
assert(unseenError,'An unseen product cannot be invented when D365 is unavailable');
assert.equal(unseenError.code,'D365_CONFIG_INCOMPLETE');
assert.deepEqual(unseenError.details?.missing,['D365_CLIENT_SECRET']);

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const scanner=read('frontend/js/scanner-resilience.js');
const nav=read('frontend/js/navigation-polish.js');
const more=read('frontend/js/manager-more-simplified.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const assortment=read('backend/services/assortment.mjs');
assert.match(scanner,/Connexion articles indisponible/);
assert.match(scanner,/Aucune donnée article, prix ou stock n’est inventée/);
assert.match(nav,/managerRoots=new Set\(\['today','managerScan','managerTeam','managerMore'\]\)/,'Manager root navigation must remain exactly four primary destinations');
for(const title of ['Article & rayon','Marchandises','Qualité & incidents','Journée & caisse'])assert(more.includes(title),`Missing simplified intent ${title}`);
assert.match(enhancements,/\.\/scanner-resilience\.js/);
assert.match(enhancements,/\.\/navigation-polish\.js/);
assert.match(enhancements,/\.\/manager-more-simplified\.js/);
assert.match(assortment,/state:'STOCK_UNKNOWN'/,'Canonical availability must preserve unknown stock');
assert.doesNotMatch(assortment,/const qty=Number\(availableQty\)/,'Canonical availability must not coerce null to zero');

console.log('V1.87 usability P0: degraded scanner, stock trust and simplified journey OK');

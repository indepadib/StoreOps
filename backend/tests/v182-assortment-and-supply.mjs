import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v182-assortment-supply.db';

const {db}=await import('../db.mjs');
const {parseAssortmentLabel,normalizeProductAssortmentCategoryRows,syncProductAssortmentCategoryRows,PRODUCT_ASSORTMENT_SOURCE}=await import('../services/assortment-category-mapping.mjs');
const {saveStoreAssortmentAssignments}=await import('../services/assortment-admin.mjs');
const {assortmentIndex,assortmentMembership}=await import('../services/assortment-resolver.mjs');
const {saveNetworkOperationalSettings,saveStoreOperationalSettings,storeOperationalSettings}=await import('../services/store-settings.mjs');

for(const table of ['store_assortment_assignments','store_assortment_assignment_state','assortment_product_assignments','assortment_product_assignment_state','store_operational_settings','network_operational_settings'])db.prepare(`DELETE FROM ${table}`).run();

assert.deepEqual(parseAssortmentLabel('Franprix - Dépannage').brands,['FRANPRIX']);
assert.equal(parseAssortmentLabel('Franprix - Dépannage').tier,'DEPANNAGE');
assert.equal(parseAssortmentLabel('FPXMPX - Complémentaire').brandScope,'FRANPRIX_MONOPRIX');
assert.equal(parseAssortmentLabel('FPXMPX - Complémentaire').tier,'COMPLEMENTAIRE');
assert.equal(parseAssortmentLabel('Monoprix - Complémentaire +').tier,'COMPLEMENTAIRE_PLUS');

const raw=[
 {ProductNumber:'SKU-F-D',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'CAT-F-D',ProductCategoryName:'Franprix - Dépannage'},
 {ProductNumber:'SKU-SHARED-C',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'CAT-S-C',ProductCategoryName:'FPXMPX - Complémentaire'},
 {ProductNumber:'SKU-M-CP',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'CAT-M-CP',ProductCategoryName:'Monoprix - Complémentaire +'},
 {ProductNumber:'SKU-OTHER',ProductCategoryHierarchyName:'Procurement',CategoryId:'OTHER',ProductCategoryName:'Boissons'}
];
const normalized=normalizeProductAssortmentCategoryRows(raw);
assert.equal(normalized.length,3);
const sync=syncProductAssortmentCategoryRows(raw,{complete:true});
assert.equal(sync.assortments.length,3);
assert.equal(sync.rows,3);

saveStoreAssortmentAssignments({storeId:'val-fleuri',assortmentKeys:['CAT-F-D','CAT-S-C'],source:PRODUCT_ASSORTMENT_SOURCE});
const index=assortmentIndex('val-fleuri',{maxAgeHours:48});
assert.equal(index.status,'READY');
assert.equal(index.model,'RELATIONAL');
assert.equal(assortmentMembership('val-fleuri','SKU-F-D',{index}).status,'ASSORTED');
assert.equal(assortmentMembership('val-fleuri','SKU-SHARED-C',{index}).status,'ASSORTED');
assert.equal(assortmentMembership('val-fleuri','SKU-M-CP',{index}).status,'NOT_ASSORTED');
assert.equal(assortmentMembership('val-fleuri','SKU-OTHER',{index}).status,'NOT_ASSORTED');

saveNetworkOperationalSettings({defaultSupplyWarehouseId:'LVE-ELKHYAYTA'});
saveStoreOperationalSettings({storeId:'val-fleuri',storeWarehouseId:'FRP0001',supplyWarehouseId:null,secondarySupplyWarehouseIds:[]});
let settings=storeOperationalSettings('val-fleuri');
assert.equal(settings.storeWarehouseId,'FRP0001');
assert.equal(settings.supplyWarehouseId,'LVE-ELKHYAYTA');
assert.equal(settings.supplyWarehouseSource,'NETWORK_DEFAULT');
assert.equal(settings.supplyWarehouseOverrideId,null);

saveStoreOperationalSettings({storeId:'val-fleuri',storeWarehouseId:'FRP0001',supplyWarehouseId:'OVERRIDE-WH',secondarySupplyWarehouseIds:[]});
settings=storeOperationalSettings('val-fleuri');
assert.equal(settings.supplyWarehouseId,'OVERRIDE-WH');
assert.equal(settings.supplyWarehouseSource,'STORE_OVERRIDE');

console.log('V1.82 ProductCategoryAssignments assortment + network supply contract: OK');

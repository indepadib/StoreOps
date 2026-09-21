import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v222-assortment-profile.db';

const {db}=await import('../db.mjs');
const {syncProductAssortmentCategoryRows,PRODUCT_ASSORTMENT_SOURCE}=await import('../services/assortment-category-mapping.mjs');
const {resolveAssortmentProfile,applyAssortmentProfile}=await import('../services/assortment-profiles.mjs');
const {assortmentIndex,assortmentMembership}=await import('../services/assortment-resolver.mjs');
const {storeOperationalSettings}=await import('../services/store-settings.mjs');

for(const table of ['store_assortment_assignments','store_assortment_assignment_state','assortment_product_assignments','assortment_product_assignment_state','store_operational_settings'])db.prepare(`DELETE FROM ${table}`).run();

const rows=[
 {ProductNumber:'F-D',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'F-D-CAT',ProductCategoryName:'Franprix - Dépannage'},
 {ProductNumber:'F-C',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'F-C-CAT',ProductCategoryName:'Franprix - Complémentaire'},
 {ProductNumber:'F-CP',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'F-CP-CAT',ProductCategoryName:'Franprix - Complémentaire +'},
 {ProductNumber:'X-D',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'X-D-CAT',ProductCategoryName:'FPXMPX - Dépannage'},
 {ProductNumber:'X-C',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'X-C-CAT',ProductCategoryName:'FPXMPX - Complémentaire'},
 {ProductNumber:'X-CP',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'X-CP-CAT',ProductCategoryName:'FPXMPX - Complémentaire +'},
 {ProductNumber:'M-CP',ProductCategoryHierarchyName:'Retail Assortment',CategoryId:'M-CP-CAT',ProductCategoryName:'Monoprix - Complémentaire +'}
];
syncProductAssortmentCategoryRows(rows,{source:PRODUCT_ASSORTMENT_SOURCE,complete:true});

const settings=storeOperationalSettings('val-fleuri');
assert.equal(settings.assortmentProfile,'COMPLEMENTAIRE_PLUS');
assert.equal(settings.assortmentProfileSource,'CONFIRMED_PILOT');

const resolution=resolveAssortmentProfile('COMPLEMENTAIRE_PLUS');
assert.equal(resolution.status,'READY');
assert.equal(resolution.safeToPersist,true);
assert.equal(resolution.required.length,6);
assert.equal(resolution.resolved.length,6);
assert(!resolution.resolved.some(x=>x.assortmentName.startsWith('Monoprix')));

const applied=applyAssortmentProfile({storeId:'val-fleuri',profileCode:'COMPLEMENTAIRE_PLUS'});
assert.equal(applied.status,'APPLIED');
assert.equal(applied.rowCount,6);

const index=assortmentIndex('val-fleuri',{maxAgeHours:48});
assert.equal(index.status,'READY');
assert.equal(index.assortments.length,6);
for(const sku of ['F-D','F-C','F-CP','X-D','X-C','X-CP'])assert.equal(assortmentMembership('val-fleuri',sku,{index}).status,'ASSORTED',sku);
assert.equal(assortmentMembership('val-fleuri','M-CP',{index}).status,'NOT_ASSORTED');

db.prepare(`DELETE FROM assortment_product_assignments WHERE source=? AND assortment_key='X-CP-CAT'`).run(PRODUCT_ASSORTMENT_SOURCE);
db.prepare(`DELETE FROM assortment_product_assignment_state WHERE source=? AND assortment_key='X-CP-CAT'`).run(PRODUCT_ASSORTMENT_SOURCE);
const incomplete=resolveAssortmentProfile('COMPLEMENTAIRE_PLUS');
assert.equal(incomplete.status,'INCOMPLETE');
assert.equal(incomplete.safeToPersist,false);
assert(incomplete.missing.some(x=>x.brand==='FPXMPX'&&x.tier==='COMPLEMENTAIRE_PLUS'));
assert.throws(()=>applyAssortmentProfile({storeId:'val-fleuri',profileCode:'COMPLEMENTAIRE_PLUS'}),e=>e?.code==='ASSORTMENT_PROFILE_INCOMPLETE');

const preserved=assortmentIndex('val-fleuri',{maxAgeHours:48});
assert.equal(preserved.assortments.length,6,'incomplete catalog must not replace existing store assignments');

console.log('V2.22 deterministic Complémentaire+ assortment profile: OK');

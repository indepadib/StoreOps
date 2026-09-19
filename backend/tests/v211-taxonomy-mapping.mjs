import assert from 'node:assert/strict';

process.env.STOREOPS_DB=`/tmp/storeops-v211-taxonomy-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';

globalThis.fetch=async url=>{
 const u=String(url);
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/ProductCategoryAssignments'))return new Response(JSON.stringify({value:[
  {dataAreaId:'5001',ProductNumber:'HS-TEST',CategoryCode:'C10',ProductCategoryHierarchyName:'UB'},
  {dataAreaId:'5001',ProductNumber:'HS-TEST',CategoryCode:'C20',ProductCategoryHierarchyName:'UB'}
 ]}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/ProcurementProductCategories')&&u.includes('C10'))return new Response(JSON.stringify({value:[{dataAreaId:'5001',CategoryCode:'C10',CategoryLabel:'Epicerie',ParentCode:'D01',LevelNo:2,FullPath:'Alimentaire > Epicerie',HierarchyLabel:'UB'}]}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/ProcurementProductCategories')&&u.includes('C20'))return new Response(JSON.stringify({value:[{dataAreaId:'5001',CategoryCode:'C20',CategoryLabel:'Petit déjeuner',ParentCode:'C10',LevelNo:3,FullPath:'Alimentaire > Epicerie > Petit déjeuner',HierarchyLabel:'UB'}]}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/ProcurementProductCategories'))return new Response(JSON.stringify({value:[
  {dataAreaId:'5001',CategoryCode:'C10',CategoryLabel:'Epicerie',ParentCode:'D01',LevelNo:2,FullPath:'Alimentaire > Epicerie',HierarchyLabel:'UB'},
  {dataAreaId:'5001',CategoryCode:'C20',CategoryLabel:'Petit déjeuner',ParentCode:'C10',LevelNo:3,FullPath:'Alimentaire > Epicerie > Petit déjeuner',HierarchyLabel:'UB'}
 ]}),{status:200,headers:{'content-type':'application/json'}});
 throw new Error('Unexpected URL '+u)
};

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {saveD365TaxonomyMappingDraft,smokeD365TaxonomyMapping,activateD365TaxonomyMapping,disableD365TaxonomyMapping,d365TaxonomyMappingSettings,evaluateD365TaxonomySmokeRows}=await import('../services/d365-taxonomy-mapping.mjs');
const {dynamicsMerchandisingConfig}=await import('../services/dynamics-merchandising.mjs');

const actor=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
assert(actor,'admin required');
db.prepare(`DELETE FROM d365_taxonomy_mapping_settings`).run();

const mapping={categoryEntity:'ProcurementProductCategories',assignmentEntity:'ProductCategoryAssignments',hierarchyKey:'UB',fields:{
 categoryId:'CategoryCode',categoryName:'CategoryLabel',parentCategoryId:'ParentCode',categoryLevel:'LevelNo',categoryPath:'FullPath',categoryHierarchy:'HierarchyLabel',
 assignmentProduct:'ProductNumber',assignmentCategory:'CategoryCode',assignmentHierarchy:'ProductCategoryHierarchyName'
}};

let saved=saveD365TaxonomyMappingDraft({actor,input:mapping});
assert.equal(saved.state,'DRAFT');
assert.throws(()=>activateD365TaxonomyMapping({actor}),e=>e.code==='D365_TAXONOMY_MAPPING_NOT_VALIDATED');

saved=await smokeD365TaxonomyMapping({actor,productNumber:'HS-TEST'});
assert.equal(saved.state,'VALIDATED');
assert.equal(saved.smoke.status,'PASSED');
assert.deepEqual(saved.smoke.resolvedCategoryIds.sort(),['C10','C20']);
assert.equal(saved.smoke.unresolvedCategoryIds.length,0);
assert.equal(saved.smoke.sampleCategories.length,2);

saved=activateD365TaxonomyMapping({actor});
assert.equal(saved.state,'LIVE');
const cfg=dynamicsMerchandisingConfig();
assert.equal(cfg.taxonomyReadMode,'live');
assert.equal(cfg.taxonomy.mappingSource,'STOREOPS_VALIDATED_MAPPING');
assert.equal(cfg.taxonomy.categoryEntity,'ProcurementProductCategories');
assert.equal(cfg.taxonomy.assignmentEntity,'ProductCategoryAssignments');
assert.equal(cfg.taxonomy.categoryIdField,'CategoryCode');
assert.equal(cfg.taxonomy.assignmentProductField,'ProductNumber');
assert.equal(cfg.hierarchyKey,'UB');

const bad=evaluateD365TaxonomySmokeRows({mapping,productNumber:'HS-TEST',assignmentRows:[{ProductNumber:'HS-TEST',CategoryCode:'MISSING'}],categoryRows:[]});
assert.equal(bad.status,'FAILED');
assert.deepEqual(bad.unresolvedCategoryIds,['MISSING']);

saved=disableD365TaxonomyMapping({actor});
assert.equal(saved.state,'DISABLED');
assert.equal(d365TaxonomyMappingSettings().state,'DISABLED');

console.log('V2.11 D365 taxonomy mapping contract: OK');

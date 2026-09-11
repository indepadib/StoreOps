import assert from 'node:assert/strict';
import { normalizeCategoryRows,normalizeAssignmentRows,normalizeAssortmentRows,merchandisingReadiness } from '../services/dynamics-merchandising.mjs';
import { replaceStoreAssortmentSnapshots,assortmentIndex,classifyAvailability,productTaxonomy,syncCategoryHierarchy,syncProductCategoryAssignments } from '../services/assortment.mjs';
import { db } from '../db.mjs';

const categories=normalizeCategoryRows([
 {CategoryId:'100',CategoryName:'Épicerie',ParentCategoryId:'10',CategoryLevel:2},
 {CategoryId:'100200',CategoryName:'Biscuits',ParentCategoryId:'100',CategoryLevel:3}
],{});
assert.equal(categories.length,2);assert.equal(categories[1].categoryName,'Biscuits');assert.equal(categories[1].parentCategoryId,'100');

const assignments=normalizeAssignmentRows([{ProductNumber:'HS-1',CategoryId:'100200'}],{});
assert.deepEqual(assignments,[{productNumber:'HS-1',categoryId:'100200',hierarchy:null}]);

const assortments=normalizeAssortmentRows([
 {AssortmentId:'A1',AssortmentName:'Val Fleuri Core',ProductNumber:'HS-1',Included:true,ValidFrom:'2026-01-01'},
 {AssortmentId:'A1',AssortmentName:'Val Fleuri Core',ProductNumber:'HS-2',Included:true,ValidFrom:'2026-01-01'},
 {AssortmentId:'A2',AssortmentName:'Exclusions',ProductNumber:'HS-2',Included:false,ValidFrom:'2026-01-01'}
],{});
assert.equal(assortments.length,2);assert.equal(assortments[0].products.length,2);assert.equal(assortments[1].products[0].included,false);

const source='TEST_D365_MERCH';
syncCategoryHierarchy({source,hierarchyKey:'PROCUREMENT',categories});
syncProductCategoryAssignments({source,hierarchyKey:'PROCUREMENT',assignments});
assert.equal(productTaxonomy('HS-1',{source,hierarchyKey:'PROCUREMENT'})[0].category_name,'Biscuits');

replaceStoreAssortmentSnapshots({storeId:'val-fleuri',source,assortments});
let idx=assortmentIndex('val-fleuri',{source,businessDate:'2026-09-11',maxAgeHours:36});
assert.equal(idx.status,'READY');
assert.equal(classifyAvailability({storeId:'val-fleuri',productNumber:'HS-1',availableQty:0,index:idx}).state,'OUT_OF_STOCK');
assert.equal(classifyAvailability({storeId:'val-fleuri',productNumber:'HS-2',availableQty:0,index:idx}).state,'NOT_ASSORTED');
assert.equal(classifyAvailability({storeId:'val-fleuri',productNumber:'HS-2',availableQty:5,index:idx}).state,'RESIDUAL_STOCK_OUTSIDE_ASSORTMENT');
assert.equal(classifyAvailability({storeId:'val-fleuri',productNumber:'HS-9',availableQty:-2,index:idx}).state,'STOCK_ANOMALY');

// Stale assortment must never create operational OOS.
db.prepare(`UPDATE store_assortment_state SET synced_at='2020-01-01 00:00:00' WHERE store_id='val-fleuri' AND source=?`).run(source);
idx=assortmentIndex('val-fleuri',{source,businessDate:'2026-09-11',maxAgeHours:36});
assert.equal(idx.status,'STALE');
assert.equal(classifyAvailability({storeId:'val-fleuri',productNumber:'HS-1',availableQty:0,index:idx}).state,'ASSORTMENT_UNKNOWN');

assert.throws(()=>replaceStoreAssortmentSnapshots({storeId:'val-fleuri',source:'TEST_EMPTY',assortments:[]}),e=>e.code==='ASSORTMENT_EMPTY_SNAPSHOT');
const ready=merchandisingReadiness('val-fleuri');assert.equal(ready.source,'D365');assert.ok(ready.capabilities.assortment);

console.log('D365 merchandising + assortment safety contract OK');

import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v2221-loss-units.db';

const {convertQuantity,valueByBasis}=await import('../services/unit-conversion.mjs');
const {calculateLossValuation,LOSS_VALUATION_VERSION}=await import('../services/loss-valuation.mjs');
const {db}=await import('../db.mjs');
const user=db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get()||db.prepare(`SELECT * FROM users ORDER BY id LIMIT 1`).get();
assert(user,'test user required');
const {createLossRecord,lossSummary}=await import('../services/loss.mjs');
const {buildLossExcel}=await import('../services/operations-excel.mjs');

assert.deepEqual(convertQuantity(6000,'g','kg'),{status:'READY',quantity:6,factor:0.001,from:'g',to:'kg'});
assert.equal(valueByBasis({quantity:6000,quantityUnit:'g',amount:5.5,basisUnit:'kg',basisQuantity:1}).total,33);
assert.equal(valueByBasis({quantity:6000,quantityUnit:'g',amount:0.01,basisUnit:'g',basisQuantity:1}).total,60);
assert.equal(valueByBasis({quantity:6000,quantityUnit:'g',amount:9,basisUnit:'pièce',basisQuantity:1}).status,'INCOMPATIBLE_UNIT');

const valuation=calculateLossValuation({
 quantity:6000,unit:'g',
 product:{price:5.5,retailUnit:'kg',retailPriceQuantity:1,unitCost:0.01,costUnit:'g',costBasisQuantity:1,costSource:'D365/ReleasedProductsV2',costState:'READY'}
});
assert.equal(valuation.version,LOSS_VALUATION_VERSION);
assert.equal(valuation.retail.equivalentQuantity,6);
assert.equal(valuation.retail.total,33);
assert.equal(valuation.cost.equivalentQuantity,6000);
assert.equal(valuation.cost.total,60);

db.prepare(`DELETE FROM loss_records`).run();
const row=createLossRecord({
 storeId:'val-fleuri',businessDate:'2026-09-21',user,
 product:{ean:'TEST-MELON',productNumber:'MELON-1',name:'Melon jaune',category:'F&L',price:5.5,retailUnit:'kg',retailPriceQuantity:1,unitCost:0.01,costUnit:'g',costBasisQuantity:1,costSource:'D365/ReleasedProductsV2',costState:'READY'},
 reasonCode:'DAMAGED',quantity:6000,unit:'g',note:'test pondéré'
});
assert.equal(row.total_retail_value,33);
assert.equal(row.total_cost_value,60);
assert.equal(row.retail_equivalent_qty,6);
assert.equal(row.cost_equivalent_qty,6000);
assert.equal(row.retail_price_unit,'kg');
assert.equal(row.cost_unit,'g');
assert.equal(row.valuation_version,LOSS_VALUATION_VERSION);

const summary=lossSummary('val-fleuri','2026-09-21');
assert.equal(summary.retailValue,33);
assert.equal(summary.costValue,60);
assert.equal(summary.retailCoverage,100);
assert.equal(summary.costCoverage,100);

const excel=buildLossExcel({storeId:'val-fleuri',businessDate:'2026-09-21',user});
assert.match(excel.file.content,/Quantité démarquée/);
assert.match(excel.file.content,/Unité prix vente/);
assert.match(excel.file.content,/Qté équivalente vente/);
assert.match(excel.file.content,/Valeur prix vente \(DH\)/);
assert.match(excel.file.content,/>33</);
assert.match(excel.file.content,/>60</);
assert.doesNotMatch(excel.file.content,/>54000</);

db.prepare(`UPDATE loss_records SET valuation_version=NULL,total_retail_value=54000,total_cost_value=36000 WHERE id=?`).run(row.id);
const legacy=lossSummary('val-fleuri','2026-09-21');
assert.equal(legacy.retailValue,0);
assert.equal(legacy.costValue,0);
assert.equal(legacy.retailCoverage,0);
assert.equal(legacy.costCoverage,0);
const legacyExcel=buildLossExcel({storeId:'val-fleuri',businessDate:'2026-09-21',user:null});
assert.match(legacyExcel.file.content,/LEGACY_NON_FIABILISÉE/);
assert.doesNotMatch(legacyExcel.file.content,/>54000</);

const policyRow=createLossRecord({
 storeId:'val-fleuri',businessDate:'2026-09-22',user,
 product:{ean:'TEST-COST-BASIS',productNumber:'COST-BASIS',name:'Produit coût prioritaire',category:'Test',price:100,retailUnit:'kg',retailPriceQuantity:1,unitCost:0.01,costUnit:'g',costBasisQuantity:1,costSource:'D365/ReleasedProductsV2',costState:'READY'},
 reasonCode:'DAMAGED',quantity:6000,unit:'g'
});
assert.equal(policyRow.total_retail_value,600);
assert.equal(policyRow.total_cost_value,60);
assert.equal(policyRow.status,'READY_TO_POST','cost value must drive approval threshold when cost is available');
assert.equal(Number(policyRow.requires_evidence),0,'cost value must drive evidence threshold when cost is available');

console.log('V2.22.1 weighted loss valuation contract: OK');

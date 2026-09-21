import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v2221-loss-units.db';

const {convertQuantity,valueByBasis}=await import('../services/unit-conversion.mjs');
const {calculateLossValuation,LOSS_VALUATION_VERSION}=await import('../services/loss-valuation.mjs');
const {db}=await import('../db.mjs');
const {createLossRecord,lossSummary}=await import('../services/loss.mjs');
const {buildLossExcel}=await import('../services/operations-excel.mjs');

assert.deepEqual(convertQuantity(6000,'g','kg'),{status:'READY',quantity:6,factor:0.001,from:'g',to:'kg'});
assert.equal(valueByBasis({quantity:6000,quantityUnit:'g',amount:9,basisUnit:'kg',basisQuantity:1}).total,54);
assert.equal(valueByBasis({quantity:6000,quantityUnit:'g',amount:0.006,basisUnit:'g',basisQuantity:1}).total,36);
assert.equal(valueByBasis({quantity:6000,quantityUnit:'g',amount:9,basisUnit:'pièce',basisQuantity:1}).status,'INCOMPATIBLE_UNIT');

const valuation=calculateLossValuation({
 quantity:6000,unit:'g',
 product:{price:9,retailUnit:'kg',retailPriceQuantity:1,unitCost:0.006,costUnit:'g',costBasisQuantity:1,costSource:'D365/ReleasedProductsV2',costState:'READY'}
});
assert.equal(valuation.version,LOSS_VALUATION_VERSION);
assert.equal(valuation.retail.equivalentQuantity,6);
assert.equal(valuation.retail.total,54);
assert.equal(valuation.cost.equivalentQuantity,6000);
assert.equal(valuation.cost.total,36);

db.prepare(`DELETE FROM loss_records`).run();
const row=createLossRecord({
 storeId:'val-fleuri',businessDate:'2026-09-21',user:{id:'u-admin',role:'ops_director'},
 product:{ean:'TEST-MELON',productNumber:'MELON-1',name:'Melon jaune',category:'F&L',price:9,retailUnit:'kg',retailPriceQuantity:1,unitCost:0.006,costUnit:'g',costBasisQuantity:1,costSource:'D365/ReleasedProductsV2',costState:'READY'},
 reasonCode:'DAMAGED',quantity:6000,unit:'g',note:'test pondéré'
});
assert.equal(row.total_retail_value,54);
assert.equal(row.total_cost_value,36);
assert.equal(row.retail_equivalent_qty,6);
assert.equal(row.cost_equivalent_qty,6000);
assert.equal(row.retail_price_unit,'kg');
assert.equal(row.cost_unit,'g');
assert.equal(row.valuation_version,LOSS_VALUATION_VERSION);

const summary=lossSummary('val-fleuri','2026-09-21');
assert.equal(summary.retailValue,54);
assert.equal(summary.costValue,36);
assert.equal(summary.retailCoverage,100);
assert.equal(summary.costCoverage,100);

const excel=buildLossExcel({storeId:'val-fleuri',businessDate:'2026-09-21',user:{id:'u-admin'}});
assert.match(excel.file.content,/Quantité démarquée/);
assert.match(excel.file.content,/Unité prix vente/);
assert.match(excel.file.content,/Qté équivalente vente/);
assert.match(excel.file.content,/Valeur prix vente \(DH\)/);
assert.match(excel.file.content,/>54</);
assert.doesNotMatch(excel.file.content,/>54000</);

db.prepare(`UPDATE loss_records SET valuation_version=NULL,total_retail_value=54000,total_cost_value=36000 WHERE id=?`).run(row.id);
const legacy=lossSummary('val-fleuri','2026-09-21');
assert.equal(legacy.retailValue,0);
assert.equal(legacy.costValue,0);
assert.equal(legacy.retailCoverage,0);
assert.equal(legacy.costCoverage,0);
const legacyExcel=buildLossExcel({storeId:'val-fleuri',businessDate:'2026-09-21',user:{id:'u-admin'}});
assert.match(legacyExcel.file.content,/LEGACY_NON_FIABILISÉE/);
assert.doesNotMatch(legacyExcel.file.content,/>54000</);

console.log('V2.22.1 weighted loss valuation contract: OK');

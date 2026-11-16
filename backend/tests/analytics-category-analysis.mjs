import assert from 'node:assert/strict';
import {contributions,summarizeCategories} from '../../frontend/analytics/category-analysis.js';
const rows=[
 {sales:50,previousSales:100,deltaSales:-50,marginSalesBase:40,marginValue:10},
 {sales:30,previousSales:40,deltaSales:-10,marginSalesBase:20,marginValue:6,marginEstimated:true},
 {sales:520,previousSales:500,deltaSales:20,marginValue:null},
];
const summary=summarizeCategories(rows);
assert.equal(summary.sales,600);
assert.equal(summary.delta,-40);
assert.equal(summary.marginRows,2);
assert.equal(summary.marginValue,16);
assert.equal(summary.marginRate,16/60*100);
assert.equal(summary.estimated,true);
assert.equal(summarizeCategories([]).sales,null);
assert.equal(summarizeCategories([{sales:1,previousSales:null}]).delta,null);
const parts=contributions(rows);
assert.equal(parts[0].changeContribution,50/60*100);
assert.equal(parts[1].changeContribution,10/60*100);
assert.equal(parts[2].changeContribution,100);

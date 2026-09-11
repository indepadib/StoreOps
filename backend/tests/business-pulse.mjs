import assert from 'node:assert/strict';
import { aggregateSalesRows,salesComparisonDate } from '../services/dynamics-sales.mjs';
import { normalizeRetailInsights,quickPulse } from '../services/retail-insights.mjs';

const cfg={sign:-1,costSign:-1,fields:{transaction:'transactionId',net:'netAmountInclTax',quantity:'qty',product:'itemId',name:'name',cost:'costAmount',time:'time',department:'department',category:'category'}};
const rows=[
 {transactionId:'T1',netAmountInclTax:-100,qty:2,itemId:'A',name:'Article A',costAmount:-60,time:'09:15',department:'Épicerie',category:'Petit déjeuner'},
 {transactionId:'T1',netAmountInclTax:-50,qty:1,itemId:'B',name:'Article B',costAmount:-30,time:'09:18',department:'Épicerie',category:'Boissons'},
 {transactionId:'T2',netAmountInclTax:-75,qty:3,itemId:'A',name:'Article A',costAmount:-45,time:'10:02',department:'Épicerie',category:'Petit déjeuner'}
];
const x=aggregateSalesRows(rows,cfg);
assert.equal(x.netSales,225);
assert.equal(x.tickets,2);
assert.equal(x.units,6);
assert.equal(x.marginValue,90);
assert.equal(x.marginRate,40);
assert.equal(x.departments[0].sales,225);
assert.equal(x.categories.find(r=>r.key==='Petit déjeuner').sales,175);
assert.equal(x.products.find(r=>r.key==='A').sales,175);
assert.equal(x.hourly.find(r=>r.key==='9').sales,150);
assert.equal(salesComparisonDate('2026-09-11',7),'2026-09-04');
const snap=normalizeRetailInsights({...x,source:'TEST',storeId:'val-fleuri',businessDate:'2026-09-11',comparison:200,outOfStockCount:4});
assert.equal(snap.kpis.averageBasket,112.5);
assert.equal(snap.kpis.changeVsComparison,12.5);
assert.equal(snap.kpis.outOfStockCount,4);
assert.equal(quickPulse(snap).cards[0].key,'oos');
console.log('StoreOps business pulse aggregation contract OK');

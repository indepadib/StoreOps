import assert from 'node:assert/strict';
import {buildSalesProof,mergeDailyEvidence} from '../../frontend/analytics/sales-proof-model.js';
import {filterAndSortRows} from '../../frontend/analytics/table-analysis.js';

const data={
 period:{startDate:'2026-11-01',endDate:'2026-11-03'},
 comparison:{startDate:'2026-10-28',endDate:'2026-10-29'},
 summary:{current:{sales:300},previous:{sales:200}},
 daily:{current:[{date:'2026-11-01',sales:300,tickets:10,averageBasket:30},{date:'2026-11-03',sales:0,tickets:0}],previous:[{date:'2026-10-28',sales:200,tickets:10,averageBasket:20},{date:'2026-10-29',sales:0,tickets:0}]},
 stores:[{storeId:'A',storeName:'Trèfle',status:'READY',sales:300,previousSales:200,tickets:10,previousTickets:10},{storeId:'B',status:'UNAVAILABLE',sales:null,previousSales:0}],
 hierarchy:{department:[{key:'fruit',label:'Fruits',sales:150,previous:100,sharePct:50}]},
 products:[{key:'HS-1',label:'Pomme',sales:90,previousSales:100},{key:'HS-2',label:'Figue',sales:60,previousSales:0},{key:'HS-3',label:'Orange',sales:10,previousSales:null}],
};
const result=buildSalesProof(data);
assert.equal(result.days.length,3);
assert.deepEqual(result.days.map(row=>[row.date,row.compareDate,row.delta]),[
 ['2026-11-01','2026-10-28',100],['2026-11-02','2026-10-29',null],['2026-11-03',null,null],
]);
assert.equal(result.days[0].basketDelta,10);
assert.equal(result.days[0].ticketsDelta,0);
assert.equal(result.days[2].sales,0);
assert.equal(result.days[2].margin,null);
assert.equal(result.stores[1].delta,null);
assert.equal(result.departments[0].weight,50);
assert.equal(result.products[1].change,null);
assert.equal(result.products[2].previousSales,null);
assert.deepEqual(result.accounting.departments,{total:100,subtotal:50,gap:50,known:1,count:1});
assert.deepEqual(result.accounting.stores,{total:100,subtotal:100,gap:0,known:1,count:2});
assert.equal(buildSalesProof({}).accounting.days.subtotal,null);
const sorted=filterAndSortRows(result.products,[{key:'delta',numeric:true,value:row=>row.delta}],{delta:'<0'},{key:'delta',desc:false});
assert.deepEqual(sorted.map(row=>row.code),['HS-1']);
const daily=mergeDailyEvidence([
 {daily:{current:[{date:'2026-11-01',sales:10,tickets:1,marginSalesBase:8,marginValue:2}]}},
 {daily:{current:[{date:'2026-11-01',sales:50,tickets:2,marginSalesBase:40,marginValue:null}]}},
],'current');
assert.equal(daily.length,1);
assert.equal(daily[0].sales,60);
assert.equal(daily[0].tickets,3);
assert.equal(daily[0].averageBasket,20);
assert.equal(daily[0].marginValue,null);
assert.equal(daily[0].marginRate,null);
console.log('PASS Sales proof date alignment, nulls, period gap, store coverage and numeric filters');

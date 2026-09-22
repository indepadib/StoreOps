import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v2251-sales-quality.db';

const {aggregateSalesRows}=await import('../services/dynamics-sales.mjs');

const cfg={
 sign:-1,
 costSign:-1,
 fields:{
  transaction:'transactionId',
  net:'netAmountInclTax',
  quantity:'qty',
  product:'itemId',
  name:'',
  cost:'',
  time:'',
  department:'',
  category:'',
  status:'transactionStatus'
 }
};

const rows=[
 {transactionId:'T-SALE',itemId:'A',qty:-2,netAmountInclTax:-100,transactionStatus:'None'},
 {transactionId:'T-VOID',itemId:'B',qty:-2000007712,netAmountInclTax:-5000019280,transactionStatus:'Voided'},
 {transactionId:'T-RETURN',itemId:'C',qty:1,netAmountInclTax:20,transactionStatus:'None'}
];

const a=aggregateSalesRows(rows,cfg);
assert.equal(a.netSales,80);
assert.equal(a.tickets,2);
assert.equal(a.units,1);
assert.equal(a.rowCount,3);
assert.equal(a.includedRowCount,2);
assert.equal(a.dataQuality.excludedRows,1);
assert.equal(a.dataQuality.excludedTransactions,1);
assert.equal(a.dataQuality.excludedSalesValue,5000019280);
assert.equal(a.products.find(x=>x.key==='A')?.units,2);
assert.equal(a.products.find(x=>x.key==='C')?.units,-1);
assert(!a.products.some(x=>x.key==='B'));

console.log('V2.25.1 Business Pulse sales quality contract: OK');

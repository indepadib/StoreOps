import assert from 'node:assert/strict';
process.env.STOREOPS_DB=`/tmp/storeops-margin-units-${process.pid}.db`;

const {probeUnitAwareTransactionMargin}=await import('../services/transaction-margin.mjs');

const rows=[
 {transactionId:'T-001',itemId:'WEIGHTED',netAmountInclTax:-30,qty:1.2,salesUnit:'kg',businessDate:'2026-09-27'},
 {transactionId:'T-001',itemId:'PIECE',netAmountInclTax:-20,qty:2,salesUnit:'PC',businessDate:'2026-09-27'}
];
const mapping={
 salesSign:-1,quantitySign:1,
 fields:{transaction:'transactionId',product:'itemId',net:'netAmountInclTax',quantity:'qty',salesUnit:'salesUnit',businessDate:'businessDate'}
};
const costResolver=async(_store,sku)=>sku==='WEIGHTED'
 ?{status:'READY',unitCost:0.01,inventoryUnit:'g',unit:'g',salesUnit:'kg'}
 :{status:'READY',unitCost:5,inventoryUnit:'PC',unit:'PC',salesUnit:'PC'};

const result=await probeUnitAwareTransactionMargin({storeId:'val-fleuri',rows,mapping,costResolver});
assert.equal(result.status,'CANDIDATE');
assert.equal(result.displaySafe,false);
assert.equal(result.lineCoverage,100);
assert.equal(result.weightedConversions,1);
assert.equal(result.completeTransactions,1);
assert.equal(result.aggregateCompleteTransactions.sales,50);
assert.equal(result.aggregateCompleteTransactions.cost,22,'1.2 kg must convert to 1200 g => 12 DH, plus 10 DH piece cost');
assert.equal(result.aggregateCompleteTransactions.margin,28);
assert.equal(result.aggregateCompleteTransactions.marginRate,56);
assert.equal(result.sample[0].convertedLines,1);

const unknown=await probeUnitAwareTransactionMargin({
 storeId:'val-fleuri',
 rows:[{transactionId:'T-002',itemId:'WEIGHTED',netAmountInclTax:-30,qty:1.2,salesUnit:'',businessDate:'2026-09-27'}],
 mapping,
 costResolver:async()=>({status:'READY',unitCost:0.01,inventoryUnit:'g',unit:'g',salesUnit:'kg'})
});
assert.equal(unknown.lineCoverage,100,'product SalesUnitSymbol fallback must keep weighted valuation usable');
assert.equal(unknown.aggregateCompleteTransactions.cost,12);

console.log('V2.33 unit-aware transaction margin contract: OK');

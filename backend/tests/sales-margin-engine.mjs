import assert from 'node:assert/strict';
import { evaluateTransactionMarginRows, inferTransactionCostKind } from '../services/sales-margin-engine.mjs';

const fields={net:'net',quantity:'qty',product:'sku',date:'date',cost:'costPrice',salesUnit:'unit'};

assert.equal(inferTransactionCostKind('CostPrice'),'UNIT_COST_INVENTORY');
assert.equal(inferTransactionCostKind('CostAmount'),'LINE_AMOUNT');

{
  const refs=new Map([['W1',{inventoryUnit:'G',salesUnit:'KG'}]]);
  const result=evaluateTransactionMarginRows({
    rows:[{net:-30,qty:2,sku:'W1',date:'2026-10-01',costPrice:0.01,unit:'KG'}],
    fields,salesSign:-1,productRefs:refs,costKind:'UNIT_COST_INVENTORY'
  });
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.totalCost,20);
  assert.equal(result.marginValue,10);
  assert.equal(result.marginRate,33.33);
  assert.equal(result.weightedConversions,1);
}

{
  const refs=new Map([['P1',{inventoryUnit:'PC',salesUnit:'PC'}]]);
  const result=evaluateTransactionMarginRows({
    rows:[{net:-18,qty:3,sku:'P1',date:'2026-10-01',costPrice:4,unit:'PC'}],
    fields,salesSign:-1,productRefs:refs,costKind:'UNIT_COST_INVENTORY'
  });
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.totalCost,12);
  assert.equal(result.marginValue,6);
}

{
  const result=evaluateTransactionMarginRows({
    rows:[{net:-100,qty:1,sku:'X',date:'2026-10-01',costAmount:-80,unit:'PC'}],
    fields:{...fields,cost:'costAmount'},salesSign:-1,productRefs:new Map(),costKind:'LINE_AMOUNT'
  });
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.totalCost,80);
  assert.equal(result.marginRate,20);
}

{
  const refs=new Map([['BAD',{inventoryUnit:'G',salesUnit:'KG'}]]);
  const result=evaluateTransactionMarginRows({
    rows:[{net:-30,qty:2,sku:'BAD',date:'2026-10-01',costPrice:10,unit:'KG'}],
    fields,salesSign:-1,productRefs:refs,costKind:'UNIT_COST_INVENTORY'
  });
  assert.equal(result.available,false);
  assert.equal(result.reason,'COST_COVERAGE_BELOW_99');
  assert.equal(result.implausibleLines,1);
}

{
  const result=evaluateTransactionMarginRows({
    rows:[{netAmountInclTax:-120,netAmount:-100,taxAmount:-20,qty:1,sku:'P1',date:'2026-10-01',costAmount:-84,unit:'PC'}],
    fields:{net:'netAmountInclTax',marginNet:'netAmount',taxAmount:'taxAmount',quantity:'qty',product:'sku',date:'date',cost:'costAmount',salesUnit:'unit'},
    salesSign:-1,productRefs:new Map(),costKind:'LINE_AMOUNT'
  });
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.totalDisplaySales,120);
  assert.equal(result.valuedMarginSales,100);
  assert.equal(result.totalCost,84);
  assert.equal(result.marginValue,16);
  assert.equal(result.marginRate,16,'gross margin must be calculated on sales excluding tax');
  assert.equal(result.salesBasis,'EXCL_TAX_FIELD');
}

{
  const result=evaluateTransactionMarginRows({
    rows:[{netAmountInclTax:-120,taxAmount:-20,qty:1,sku:'P1',date:'2026-10-01',costAmount:-84,unit:'PC'}],
    fields:{net:'netAmountInclTax',taxAmount:'taxAmount',quantity:'qty',product:'sku',date:'date',cost:'costAmount',salesUnit:'unit'},
    salesSign:-1,productRefs:new Map(),costKind:'LINE_AMOUNT'
  });
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.marginRate,16);
  assert.equal(result.salesBasis,'DERIVED_TTC_MINUS_TAX');
}

{
  const result=evaluateTransactionMarginRows({
    rows:[{netAmountInclTax:-120,qty:1,sku:'P1',date:'2026-10-01',costAmount:-84,unit:'PC'}],
    fields:{net:'netAmountInclTax',quantity:'qty',product:'sku',date:'date',cost:'costAmount',salesUnit:'unit'},
    salesSign:-1,productRefs:new Map(),costKind:'LINE_AMOUNT'
  });
  assert.equal(result.available,false);
  assert.equal(result.reason,'MARGIN_NET_EXCL_TAX_COVERAGE_BELOW_99');
}

console.log('sales margin engine tests passed');

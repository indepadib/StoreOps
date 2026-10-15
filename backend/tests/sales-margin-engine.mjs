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
  assert.equal(result.reason,'COST_COVERAGE_BELOW_95');
  assert.equal(result.implausibleLines,1);
}

console.log('sales margin engine tests passed');

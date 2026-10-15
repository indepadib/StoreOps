import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTransactionMarginRows } from '../services/sales-margin-engine.mjs';

const fields={
  transaction:'transactionId',
  product:'itemId',
  date:'businessDate',
  net:'netAmountInclTax',
  marginNet:'netAmount',
  taxAmount:'taxAmount',
  quantity:'qty',
  salesUnit:'salesUnit',
  inventoryUnit:'inventoryUnit',
  cost:'costPrice'
};

test('weighted item converts KG sold to G inventory cost before margin',()=>{
  const rows=[{transactionId:'T1',itemId:'HS-WEIGHT',businessDate:'2026-10-15',netAmountInclTax:-100,netAmount:-83.33,taxAmount:-16.67,qty:-1,salesUnit:'KG',inventoryUnit:'G',costPrice:0.07}];
  const result=evaluateTransactionMarginRows({rows,fields,salesSign:-1,costKind:'UNIT_COST_INVENTORY'});
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.weightedConversions,1);
  assert.equal(result.totalCost,70);
  assert.ok(Math.abs(result.marginRate-16)<0.1,'expected ~16%, got '+result.marginRate);
});

test('piece item keeps 1:1 unit conversion',()=>{
  const rows=[{transactionId:'T2',itemId:'HS-PIECE',businessDate:'2026-10-15',netAmountInclTax:-120,netAmount:-100,taxAmount:-20,qty:-1,salesUnit:'PC',inventoryUnit:'PC',costPrice:84}];
  const result=evaluateTransactionMarginRows({rows,fields,salesSign:-1,costKind:'UNIT_COST_INVENTORY'});
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.weightedConversions,0);
  assert.equal(result.totalCost,84);
  assert.equal(result.marginRate,16);
});

test('unknown unit blocks publication instead of inventing margin',()=>{
  const rows=[{transactionId:'T3',itemId:'HS-BAD',businessDate:'2026-10-15',netAmountInclTax:-100,netAmount:-83.33,taxAmount:-16.67,qty:-1,salesUnit:'BOX',inventoryUnit:'G',costPrice:0.07}];
  const result=evaluateTransactionMarginRows({rows,fields,salesSign:-1,costKind:'UNIT_COST_INVENTORY'});
  assert.equal(result.available,false);
  assert.equal(result.marginRate,null);
  assert.ok(result.unknownUnitLines>0);
});

test('generic transaction cost field can be explicitly treated as inventory-unit cost',()=>{
  const genericFields={...fields,cost:'costAmount'};
  const rows=[{transactionId:'T4',itemId:'HS-GENERIC',businessDate:'2026-10-15',netAmountInclTax:-120,netAmount:-100,taxAmount:-20,qty:-1,salesUnit:'KG',inventoryUnit:'G',costAmount:0.084}];
  const result=evaluateTransactionMarginRows({rows,fields:genericFields,salesSign:-1,costKind:'UNIT_COST_INVENTORY'});
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.totalCost,84);
  assert.equal(result.marginValue,16);
  assert.equal(result.marginRate,16);
  assert.equal(result.weightedConversions,1);
});

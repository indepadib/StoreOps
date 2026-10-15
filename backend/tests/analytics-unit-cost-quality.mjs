import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convertQuantity,valueByBasis} from '../services/unit-conversion.mjs';
import {evaluateTransactionMarginRows,inferTransactionCostKind} from '../services/sales-margin-engine.mjs';

{
  const kgToG=convertQuantity(1,'KG','G');
  assert.equal(kgToG.status,'READY');
  assert.equal(kgToG.quantity,1000);
  assert.equal(kgToG.factor,1000);
}
{
  const gToKg=convertQuantity(1000,'G','KG');
  assert.equal(gToKg.status,'READY');
  assert.equal(gToKg.quantity,1);
  assert.equal(gToKg.factor,0.001);
}
{
  const cost=valueByBasis({quantity:1,quantityUnit:'KG',amount:0.01,basisUnit:'G',basisQuantity:1});
  assert.equal(cost.status,'READY');
  assert.equal(cost.total,10);
}
{
  assert.equal(inferTransactionCostKind('CostPrice'),'UNIT_COST_INVENTORY');
  const result=evaluateTransactionMarginRows({
    rows:[
      {net:-30,qty:1.2,sku:'WEIGHTED',date:'2026-10-01',costPrice:0.01,unit:'KG'},
      {net:-20,qty:2,sku:'PIECE',date:'2026-10-01',costPrice:5,unit:'PC'}
    ],
    fields:{net:'net',quantity:'qty',product:'sku',date:'date',cost:'costPrice',salesUnit:'unit'},
    salesSign:-1,
    productRefs:new Map([
      ['WEIGHTED',{inventoryUnit:'G',salesUnit:'KG'}],
      ['PIECE',{inventoryUnit:'PC',salesUnit:'PC'}]
    ]),
    costKind:'UNIT_COST_INVENTORY'
  });
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.totalCost,22,'1.2 kg => 1200 g × 0.01 DH/g = 12 DH, plus 2 × 5 DH');
  assert.equal(result.marginValue,28);
  assert.equal(result.marginRate,56);
  assert.equal(result.weightedConversions,1);
}
{
  const result=evaluateTransactionMarginRows({
    rows:[{net:-30,qty:1.2,sku:'W',date:'2026-10-01',costAmount:0,costPrice:0.01,unit:'KG'}],
    fields:{net:'net',quantity:'qty',product:'sku',date:'date',cost:'costAmount',costUnitPrice:'costPrice',salesUnit:'unit'},
    salesSign:-1,
    productRefs:new Map([['W',{inventoryUnit:'G',salesUnit:'KG'}]]),
    costKind:'LINE_AMOUNT'
  });
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.totalCost,12);
  assert.equal(result.fallbackUnitCostLines,1);
  assert.equal(result.method,'TRANSACTION_COST_AMOUNT_WITH_UNIT_COST_FALLBACK');
}
{
  const impossible=convertQuantity(1,'PC','KG');
  assert.equal(impossible.status,'INCOMPATIBLE_UNIT');
}
{
  const result=evaluateTransactionMarginRows({
    rows:[{net:-30,qty:2,sku:'BAD',date:'2026-10-01',costPrice:10,unit:'KG'}],
    fields:{net:'net',quantity:'qty',product:'sku',date:'date',cost:'costPrice',salesUnit:'unit'},
    salesSign:-1,
    productRefs:new Map([['BAD',{inventoryUnit:'G',salesUnit:'KG'}]]),
    costKind:'UNIT_COST_INVENTORY'
  });
  assert.equal(result.available,false,'absurd kg/g cost must never be published');
  assert.equal(result.implausibleLines,1);
}

{
  const salesSource=readFileSync(new URL('../services/dynamics-sales.mjs',import.meta.url),'utf8');
  assert.match(salesSource,/evaluateTransactionMarginRows/);
  assert.match(salesSource,/releasedProductSourcingMany/);
  assert.match(salesSource,/sales-range-v14/);
}
{
  const decisionSource=readFileSync(new URL('../../frontend/analytics/decision.js',import.meta.url),'utf8');
  assert.match(decisionSource,/TRANSACTION_MARGIN_UNAVAILABLE/);
  assert.doesNotMatch(decisionSource,/CURRENT_COST_ESTIMATE/,'UI must not invent margin from current product-master cost');
  assert.doesNotMatch(decisionSource,/IMPLAUSIBLE_CURRENT_COST/,'unsafe current-cost margin fallback must stay removed');
}

console.log('Retail Intelligence unit/cost quality contract passed.');

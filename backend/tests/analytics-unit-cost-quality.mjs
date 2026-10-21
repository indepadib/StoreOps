import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convertQuantity,valueByBasis} from '../services/unit-conversion.mjs';
import {evaluateTransactionMarginRows,inferTransactionCostKind} from '../services/sales-margin-engine.mjs';
import {aggregateValidatedMargin} from '../services/decision-intelligence.mjs';

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
  // Business-confirmed Franprix case: transaction cost is per inventory gram
  // while the sale quantity is expressed in kilograms.
  const result=evaluateTransactionMarginRows({
    rows:[{ttc:-13.2,tax:-1.2,qty:0.2,sku:'HS-00001',date:'2026-10-15',costPrice:0.05,unit:'KG'}],
    fields:{net:'ttc',taxAmount:'tax',quantity:'qty',product:'sku',date:'date',cost:'costPrice',salesUnit:'unit'},
    salesSign:-1,
    productRefs:new Map([['HS-00001',{inventoryUnit:'G',salesUnit:'KG'}]]),
    costKind:'UNIT_COST_INVENTORY'
  });
  assert.equal(result.totalCost,10,'0.2 kg => 200 g × 0.05 DH/g = 10 DH');
  assert.equal(result.valuedMarginSales,12,'13.2 TTC - 1.2 tax = 12 DH HT');
  assert.equal(result.marginValue,2);
  assert.equal(result.marginRate,16.67);
  assert.equal(result.weightedConversions,1);
}
{
  // Missing transaction unit cost may use current product-master UnitCost only for a
  // tightly bounded share of valued sales. Weighted conversion still applies.
  const result=evaluateTransactionMarginRows({
    rows:[
      {netAmount:-100,qty:2,sku:'W',date:'2026-10-15',costPrice:null,unit:'KG'},
      {netAmount:-900,qty:9,sku:'P',date:'2026-10-15',costPrice:84,unit:'PC'}
    ],
    fields:{net:'netAmount',quantity:'qty',product:'sku',date:'date',cost:'costPrice',salesUnit:'unit'},
    salesSign:-1,
    productRefs:new Map([
      ['W',{inventoryUnit:'G',salesUnit:'KG',unitCost:0.04}],
      ['P',{inventoryUnit:'PC',salesUnit:'PC',unitCost:84}]
    ]),
    costKind:'UNIT_COST_INVENTORY',
    maxProductMasterFallbackPct:15
  });
  assert.equal(result.status,'VALIDATED');
  assert.equal(result.productMasterFallbackLines,1);
  assert.equal(result.productMasterFallbackPct,10);
  assert.equal(result.totalCost,836,'2 kg => 2000 g × 0.04 = 80; 9 pieces × 84 = 756');
  assert.equal(result.marginRate,16.4);
}
{
  const result=evaluateTransactionMarginRows({
    rows:[{netAmount:-100,qty:2,sku:'W',date:'2026-10-15',costPrice:null,unit:'KG'}],
    fields:{net:'netAmount',quantity:'qty',product:'sku',date:'date',cost:'costPrice',salesUnit:'unit'},
    salesSign:-1,
    productRefs:new Map([['W',{inventoryUnit:'G',salesUnit:'KG',unitCost:0.04}]]),
    costKind:'UNIT_COST_INVENTORY',
    maxProductMasterFallbackPct:5
  });
  assert.equal(result.available,true);
  assert.equal(result.status,'ESTIMATED');
  assert.equal(result.estimated,true);
  assert.equal(result.reason,'PRODUCT_MASTER_COST_FALLBACK_ESTIMATE');
  assert.equal(result.totalCost,80,'2 kg => 2000 g × 0.04 DH/g = 80 DH');
}


{
  // When transaction cost is missing on too much CA, current product-master UnitCost
  // may complete the arithmetic, but the result must remain explicitly ESTIMATED.
  const aggregate=aggregateValidatedMargin([
    {summary:{sales:100},margin:{status:'ESTIMATED',reason:'PRODUCT_MASTER_COST_FALLBACK_ESTIMATE',costKind:'UNIT_COST_INVENTORY',marginSalesBase:100,totalCost:84,basisCoveragePct:100,coveragePct:100,productMasterFallbackMarginSales:100,productMasterFallbackLines:1,weightedConversions:1}}
  ]);
  assert.equal(aggregate.available,true);
  assert.equal(aggregate.status,'ESTIMATED');
  assert.equal(aggregate.estimated,true);
  assert.equal(aggregate.marginRate,16);
  assert.equal(aggregate.productMasterFallbackPct,100);
}

{
  // A selected multi-store scope is validated on its consolidated economics.
  // One store can be outside the local sanity band without forcing a false N/A
  // if the selected scope itself is complete, unit-consistent and business-plausible.
  const aggregate=aggregateValidatedMargin([
    {summary:{sales:100},margin:{status:'UNVALIDATED',reason:'BUSINESS_MARGIN_SANITY_FAILED',costKind:'UNIT_COST_INVENTORY',marginSalesBase:100,totalCost:50,basisCoveragePct:100,coveragePct:100,productMasterFallbackMarginSales:0,productMasterFallbackLines:0,weightedConversions:0}},
    {summary:{sales:900},margin:{status:'VALIDATED',reason:null,costKind:'UNIT_COST_INVENTORY',marginSalesBase:900,totalCost:790,basisCoveragePct:100,coveragePct:100,productMasterFallbackMarginSales:0,productMasterFallbackLines:0,weightedConversions:0}}
  ]);
  assert.equal(aggregate.available,true);
  assert.equal(aggregate.marginValue,160);
  assert.equal(aggregate.marginRate,16);
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
  assert.match(salesSource,/sales-range-v31/);
}
{
  const decisionSource=readFileSync(new URL('../../frontend/analytics/decision.js',import.meta.url),'utf8');
  assert.match(decisionSource,/TRANSACTION_MARGIN_UNAVAILABLE/);
  assert.match(decisionSource,/HYBRID_CURRENT_COST_ESTIMATE/,'hybrid current-cost fallback must be visibly marked as estimated');
  assert.match(decisionSource,/Marge brute HT estimée/,'estimated margin must never be labelled as validated historical margin');
}

console.log('Retail Intelligence unit/cost quality contract passed.');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {convertQuantity,valueByBasis} from '../services/unit-conversion.mjs';

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
  // A weighted item sold as 1 kg with a cost basis of 0.01 DH / gram costs 10 DH.
  const cost=valueByBasis({quantity:1,quantityUnit:'KG',amount:0.01,basisUnit:'G',basisQuantity:1});
  assert.equal(cost.status,'READY');
  assert.equal(cost.total,10);
}
{
  // Once the product-master unit cost has been converted to DH / kg, do not convert it a second time.
  const convertedUnitCost=valueByBasis({quantity:1,quantityUnit:'KG',amount:0.01,basisUnit:'G',basisQuantity:1});
  const saleQtyInKg=convertQuantity(1000,'G','KG');
  assert.equal(convertedUnitCost.total*saleQtyInKg.quantity,10);
}
{
  const impossible=convertQuantity(1,'PC','KG');
  assert.equal(impossible.status,'INCOMPATIBLE_UNIT');
}


{
  const salesSource=readFileSync(new URL('../services/dynamics-sales.mjs',import.meta.url),'utf8');
  assert.match(salesSource,/D365_SALES_COST_KIND/);
  assert.match(salesSource,/LINE_AMOUNT/);
  assert.match(salesSource,/TRANSACTION_COST_SEMANTICS_UNCONFIRMED/);
}
{
  const decisionSource=readFileSync(new URL('../../frontend/analytics/decision.js',import.meta.url),'utf8');
  assert.match(decisionSource,/coverage>=95/);
  assert.match(decisionSource,/IMPLAUSIBLE_CURRENT_COST/);
  assert.match(decisionSource,/rawCostBasisUnit/);
  assert.match(decisionSource,/soldQty\*factor/,'current-cost margin must convert the exact sold quantity into the inventory cost unit');
}

console.log('Retail Intelligence unit/cost quality contract passed.');

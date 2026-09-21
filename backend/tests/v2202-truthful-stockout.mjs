import assert from 'node:assert/strict';
import {normalizeRetailInsights} from '../services/retail-insights.mjs';

const unknown=normalizeRetailInsights({netSales:100,tickets:2,outOfStockCount:null});
assert.equal(unknown.kpis.outOfStockCount,null);

const zero=normalizeRetailInsights({netSales:100,tickets:2,outOfStockCount:0});
assert.equal(zero.kpis.outOfStockCount,0);

const positive=normalizeRetailInsights({netSales:100,tickets:2,outOfStockCount:7});
assert.equal(positive.kpis.outOfStockCount,7);

console.log('V2.20.2 truthful stockout KPI: OK');

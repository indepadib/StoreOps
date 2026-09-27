import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-v233-action-engine-${process.pid}.db`;
const {stockSignalRisk24h,isGhostStockCandidate}=await import('../services/stock-signals.mjs');

assert.equal(stockSignalRisk24h({type:'OUT',dailySalesValue:120}),120);
assert.equal(stockSignalRisk24h({type:'GHOST',dailySalesValue:90}),90);
assert.equal(stockSignalRisk24h({type:'LOW',dailySalesValue:100,coverageDays:.4}),60);
assert.equal(stockSignalRisk24h({type:'LOW',dailySalesValue:100,coverageDays:1.2}),0);
assert.equal(isGhostStockCandidate({available:10,dailySales:2,lastSaleDaysAgo:3,coverageDays:5,silenceDays:3,minDailySales:1,lowThreshold:2.5}),true);
assert.equal(isGhostStockCandidate({available:10,dailySales:2,lastSaleDaysAgo:2,coverageDays:5,silenceDays:3,minDailySales:1,lowThreshold:2.5}),false);
assert.equal(isGhostStockCandidate({available:2,dailySales:2,lastSaleDaysAgo:5,coverageDays:1,silenceDays:3,minDailySales:1,lowThreshold:2.5}),false,'near-stockout should not be duplicated as ghost stock');

const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const sales=read('backend/services/dynamics-sales.mjs');
const stock=read('backend/services/stock-signals.mjs');
const inbox=read('backend/services/manager-inbox-batch.mjs');
const pulseBackend=read('backend/services/business-pulse.mjs');
const today=read('frontend/js/pages/manager-home.js');
const todayCss=read('frontend/manager-today-v185.css');
const performance=read('frontend/js/pages/manager-performance.js');
const scan=read('frontend/js/pages/manager-scan.js');
const assistant=read('backend/services/item-assistant.mjs');
const repl=read('frontend/js/manager-replenishment-v2.js');

assert.match(sales,/lastSaleDate/);
assert.match(sales,/dailySalesValue7/);
assert.match(stock,/type:'GHOST'/);
assert.match(stock,/salesRisk24h/);
assert.match(stock,/recoverableWarehouseRisk24h/);
assert.match(inbox,/stock-ghost-summary/);
assert.match(inbox,/Sécuriser les ventes/);
assert.match(inbox,/Prévenir les ruptures/);
assert.match(pulseBackend,/pulseAnalysis/);
assert.match(pulseBackend,/departmentDrivers/);
assert.match(today,/function pulseExplanation/);
assert.match(today,/function salesRiskStrip/);
assert.match(today,/VENTES À SÉCURISER/);
assert.match(today,/MISSIONS PRIORITAIRES/);
assert.match(today,/items\.slice\(0,3\)/,'Today must stay cognitively limited to three primary missions');
assert.match(todayCss,/\.today-sales-risk/);
assert.match(performance,/Pourquoi le CA bouge \?/);
assert.match(performance,/Stocks fantômes/);
assert.match(performance,/CA à risque \/ 24h/);
assert.doesNotMatch(performance,/<span>Marge<\/span>/);
assert.match(scan,/DIAGNOSTIC STOREOPS/);
assert.match(scan,/CA potentiel \/ jour/);
assert.match(assistant,/operationalInsight/);
assert.match(assistant,/GHOST_STOCK/);
assert.match(repl,/x\.type==='GHOST'/);
assert.match(repl,/recommendation:'INVENTORY'/);

console.log('V2.33 Store Action Engine + UX contract: OK');

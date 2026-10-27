import assert from 'node:assert/strict';
import {detentionInsights,buildHabitIndex,habitCohort} from '../services/analytics-action-intelligence.mjs';
const rows=[{expected:true,storeAvailable:0,warehouseAvailable:8},{expected:true,storeAvailable:2,warehouseAvailable:0},{expected:false,storeAvailable:null,warehouseAvailable:0}];
let r=detentionInsights(rows,{complete:true,assortmentReady:true});assert.equal(r.expectedDetentionPct,50);assert.equal(r.referencePresencePct,null);assert.equal(r.replenishable,1);assert.ok(r.actions.some(a=>a.code==='COMPLETE_STOCK'));
r=detentionInsights(rows,{complete:false,assortmentReady:false});assert.equal(r.expectedDetentionPct,null);assert.equal(r.expected,null);assert.equal(r.replenishable,null);assert.equal(r.warehouseOut,null);
const basket=(customerToken,date,productNumber='A')=>({customerToken,date,items:[{productNumber}]});
const previous={baskets:['buyer','substitute','absent'].flatMap(id=>[basket(id,'2026-10-01'),basket(id,'2026-10-03')])},current={baskets:[basket('buyer','2026-10-10'),basket('substitute','2026-10-10','B')]};
const h=habitCohort(previous,current,'A',buildHabitIndex(previous,current,'2026-10-12'));assert.equal(h.regularBuyers,3);assert.equal(h.systematicBuyers,3);assert.equal(h.repurchased,1);assert.equal(h.returnedWithoutArticle,1);assert.equal(h.notObserved,1);assert.equal(h.overdue,1);assert.equal(JSON.stringify(h).includes('substitute'),false);
console.log('analytics action intelligence: OK');

const {supplierDetention}=await import('../../frontend/analytics/insight-models.js');
const supplierRows=rows.map(r=>({...r,storeId:'A',storeName:'A',primaryVendorAccount:'V'}));
const metrics=supplierDetention(supplierRows,[{storeId:'A',referenceComplete:true,stockComplete:true,assortmentStatus:'READY'}])[0];assert.equal(metrics.expectedDetentionPct,50);assert.equal(metrics.referencePresencePct,null);assert.equal(metrics.replenishable,1);assert.equal(supplierDetention(supplierRows,[])[0].expectedDetentionPct,null);

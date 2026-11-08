import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
process.env.STOREOPS_DB=join(mkdtempSync(join(tmpdir(),'customer-journey-v2-')),'test.db');
const {buildCustomerJourneyEvidence}=await import('../services/analytics-customer-journey-v2.mjs');
const {basketEvidenceTtl}=await import('../services/dynamics-sales.mjs');
assert.equal(basketEvidenceTtl('2026-11-04','2026-11-08'),604800,'Historical prepared tickets must survive multi-day investigation');
assert.equal(basketEvidenceTtl('2026-11-07','2026-11-08'),10800,'Recent corrected days are refreshed sooner');
assert.equal(basketEvidenceTtl('2026-11-08','2026-11-08'),900,'Current-day data stay short-lived');
const {customerResearchQuestion}=await import('../services/analytics-customer-research-intent.mjs');
const original=[],latest=[];
const add=(list,id,date,items,promotional=false)=>list.push({
 key:'T'+list.length+'-'+id,storeId:'trefle',date,customerToken:'client-secret-'+id,
 items:items.map(([sku,amount])=>({productNumber:sku,unit:'PC',units:1,sales:amount,periodicDiscountAmount:promotional?1:0,discountAmount:promotional?1:0}))
});
// Cohort 1: habitual juice buyers, 10 stopped coming, 5 returned and switched.
for(let i=1;i<=15;i++){
 add(original,i,'2026-10-02',[['JUICE',10],['BREAD',5]],i<=4);
 add(original,i,'2026-10-04',[['JUICE',10]]);
 if(i<=5){
  add(latest,i,'2026-10-13',[['MILK',6],['BREAD',5]]);
  add(latest,i,'2026-10-15',[['MILK',6]]);
 }
}
// Cohort 2: non-juice customers, mostly returning.
for(let i=16;i<=30;i++){
 add(original,i,'2026-10-01',[['MILK',6]]);
 if(i<=12+15)add(latest,i,'2026-10-12',[['MILK',6]]);
}
// New observed purchasers of juice at a higher realized price.
for(let i=31;i<=50;i++)add(latest,i,'2026-10-16',[['JUICE',13]]);
const args={previousEvidence:{baskets:original,rejectedIdentity:0},currentEvidence:{baskets:latest,rejectedIdentity:0},
 storeIds:['trefle'],period:{start:'2026-10-11',end:'2026-10-20'},comparison:{start:'2026-10-01',end:'2026-10-10'},
 productNames:{JUICE:'Jus orange 1 litre',BREAD:'Pain frais',MILK:'Lait demi-écrémé'}};
const report=buildCustomerJourneyEvidence(args);
assert.equal(report.version,'CUSTOMER_JOURNEY_V2');
assert.equal(report.causal,false);
assert.equal(report.coverage.comparable,true);
assert.equal(report.evolution.observedPrior,30);
assert.equal(report.evolution.returned,17);
assert.equal(report.evolution.nonObserved,13);
assert.equal(report.returning.frequencyDown,0);
assert.equal(report.returning.ceasedAtLeastOneProduct,5);
assert.equal(report.returning.boughtNewProduct,5);
assert(report.returning.averageBasketBefore>report.returning.averageBasketAfter);
assert.equal(report.cohorts.find(x=>x.id==='TWO_VISITS').previous,15);
assert.equal(report.cohorts.find(x=>x.id==='REGULAR').previous,0);
assert.equal(report.cohorts.find(x=>x.id==='ONE_VISIT').previous,15);
const juice=report.products.priceIncreases.find(x=>x.productNumber==='JUICE');
assert(juice,'Auto-discovery must cover all SKUs, not only named target products');
assert.equal(juice.priceChangePct,30);
assert.equal(juice.returnedButStoppedBuying,5);
assert.equal(juice.notObservedAmongPriorBuyers,10);
assert(juice.newProductsBoughtInstead.find(x=>x.productNumber==='MILK'));
assert.equal(juice.replacementIsConfirmed,false);
assert.equal(report.products.allSkusRanked,true);
assert(report.products.stoppedPurchases.some(x=>x.productNumber==='JUICE'));
assert(report.insights.some(x=>x.id==='SAME_CUSTOMERS'));
assert(report.journeys.some(x=>x.oldProductsNoLongerPurchased.includes('Jus orange 1 litre')));
assert(report.journeys.every(x=>x.sampling==='DIAGNOSTIC_NON_REPRESENTATIF'));
assert(!JSON.stringify(report).includes('client-secret-'),'Customer identifiers cannot leave server');
assert.equal(report.coverage.trueHistorySinceOpening,false);
assert.equal(report.coverage.officialPriceChangeDatesJoined,false);
assert.equal(report.coverage.stockHistoryJoined,false);
assert.equal(report.products.priceCausalImpact,null);

const incompatible={...args,currentEvidence:{baskets:latest.map(b=>({...b,items:b.items.map(i=>i.productNumber==='JUICE'?{...i,unit:'KG'}:i)}))}};
assert(!buildCustomerJourneyEvidence(incompatible).products.priceIncreases.some(x=>x.productNumber==='JUICE'),
 'Unit mismatch must not be used to assert a price increase');
const rejects=buildCustomerJourneyEvidence({...args,previousEvidence:{baskets:original,rejectedIdentity:4}});
assert.equal(rejects.coverage.rejectedRows,4);
const notMatched=buildCustomerJourneyEvidence({...args,period:{start:'2026-10-11',end:'2026-10-17'}});
assert.equal(notMatched.coverage.comparable,false);
const answer=await customerResearchQuestion([{id:'trefle',name:'Trèfle'}],{
 question:'Pourquoi les clients ne reviennent plus après les hausses de prix et les promotions ?',
 start:'2026-10-11',end:'2026-10-20',compareStart:'2026-10-01',compareEnd:'2026-10-10'
},{read:async()=>({status:'READY',customers:{observedPrevious:30,returnRate:56},products:[],diagnosis:[],limitations:[],studyConclusion:'Ne pas conclure.',journey:report})});
assert.equal(answer.engine,'CUSTOMER_RESEARCH');
assert(answer.sections.some(s=>s.title.startsWith('Avant / après')));
assert(answer.sections.some(s=>s.title.startsWith('Articles que')));
assert(answer.sections.some(s=>s.title.includes('prix')));
assert.match(answer.answer,/panier moyen en recul/);
assert.equal(answer.causal,false);
const page=readFileSync(new URL('../../frontend/analytics/customer-research.js',import.meta.url),'utf8');
const view=readFileSync(new URL('../../frontend/analytics/customer-journey-view.js',import.meta.url),'utf8');
assert.match(page,/renderCustomerJourney/);
assert.match(view,/oldProductsNoLongerPurchased/);
assert.match(view,/newProductsBoughtInstead/);
assert.match(view,/PAS du chiffre/);
assert.doesNotMatch(view,/innerHTML\s*=/);
console.log('Customer Journey V2: source-proof loyalty cohorts, basket migrations, price UOM gates, promo return and anonymous cases PASS');

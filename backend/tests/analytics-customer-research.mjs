import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.STOREOPS_DB=join(mkdtempSync(join(tmpdir(),'customer-research-')),'test.db');
delete process.env.ANTHROPIC_API_KEY;
const {buildCustomerRetentionResearch}=await import('../services/analytics-customer-research.mjs');
const {classifyCustomerResearchQuestion,customerResearchQuestion}=await import('../services/analytics-customer-research-intent.mjs');
const {answerBusinessQuestion}=await import('../services/analytics-query-agent.mjs');
const {$type}=globalThis;void $type;
const before=[],after=[];
function basket(arr,id,day,items){
 arr.push({key:'B'+arr.length+'|'+id,storeId:'trefle',date:day,customerToken:'C'+id,
  items:items.map(([productNumber,sales])=>({productNumber,unit:'PC',units:1,sales,discountAmount:0,periodicDiscountAmount:0}))});
}
for(let i=1;i<=30;i++){
 const products=i<=15?[['JUICE-1',10],...(i<=10?[['CHICKEN-1',20]]:[])]:[['MILK-1',7]];
 basket(before,i,'2026-10-01',products)
}
for(let i=1;i<=3;i++)basket(after,i,'2026-10-12',[['JUICE-1',13],...(i<=2?[['CHICKEN-1',24]]:[])]);
for(let i=16;i<=27;i++)basket(after,i,'2026-10-12',[['MILK-1',7]]);
for(let i=31;i<=45;i++)basket(after,i,'2026-10-12',[['JUICE-1',13],...(i<=42?[['CHICKEN-1',24]]:[])]);
const params={previousEvidence:{baskets:before,rejectedIdentity:0},
 currentEvidence:{baskets:after,rejectedIdentity:0},
 storeIds:['trefle'],
 productNames:{'JUICE-1':"Jus d’Orange 1L",'CHICKEN-1':'Poulet rôti','MILK-1':'Lait entier'},
 comparison:{start:'2026-10-01',end:'2026-10-10'},
 period:{start:'2026-10-11',end:'2026-10-20'}};
const r=buildCustomerRetentionResearch(params);
assert.equal(r.status,'READY');assert.equal(r.causal,false);
assert.equal(r.customers.observedPrevious,30);
assert.equal(r.customers.observedCurrent,30);
assert.equal(r.customers.returned,15);
assert.equal(r.customers.notObserved,15);
assert.equal(r.customers.oneVisitShare,100);
assert.equal(r.customers.oneVisitNotObservedRate,50);
assert.equal(r.customers.priceIncreaseExposedPrevious,15);
assert.equal(r.customers.priceIncreaseExposedNotObserved,12);
assert.equal(r.customers.nonreturnObservedWithPriceExposureShare,80);
const juice=r.products.find(p=>p.productNumber==='JUICE-1'),chicken=r.products.find(p=>p.productNumber==='CHICKEN-1');
assert(juice&&chicken,'Both individual product matches must be visible');
assert.equal(juice.group,'JUICE_ORANGE');
assert.equal(chicken.group,'CHICKEN');
assert.equal(juice.priceChangePct,30);
assert.equal(juice.signal,'PRICE_UP_LOWER_RETURN_ASSOCIATION');
assert.equal(juice.returnedWithoutArticle,0);
assert.equal(juice.control.exposedReturnRate,20);
assert.equal(juice.control.controlReturnRate,80);
assert.equal(juice.control.deltaPoints,-60);
assert(Array.isArray(juice.control.ci95));
assert.equal(r.diagnosis.find(x=>x.id==='STOCKOUT').state,'SOURCE_REQUIRED');
assert.equal(r.diagnosis.find(x=>x.id==='SERVICE').state,'SOURCE_REQUIRED');
assert.match(r.studyConclusion,/causal|causalité/i);
assert(!JSON.stringify(r).includes('"C1"'),'No personal customer token may appear in research response');
assert(!JSON.stringify(r).includes('"C30"'));
assert.equal(r.coverage.lifetimeCertified,false,'Two 10-day windows cannot masquerade as lifetime from opening');

const invalidUnit={...params,currentEvidence:{...params.currentEvidence,baskets:after.map(b=>({
 ...b,items:b.items.map(i=>i.productNumber==='JUICE-1'?{...i,unit:'KG'}:i)
}))}};
const incompatible=buildCustomerRetentionResearch(invalidUnit);
assert.equal(incompatible.products.find(x=>x.productNumber==='JUICE-1').priceChangePct,null);
assert.equal(incompatible.products.find(x=>x.productNumber==='JUICE-1').signal,'NO_CONSISTENT_PRICE_UP_SIGNAL');
assert.equal(buildCustomerRetentionResearch({...params,currentEvidence:{...params.currentEvidence,rejectedIdentity:2}}).status,'PARTIAL');
assert.equal(classifyCustomerResearchQuestion('Combien de clients recrutés depuis ouverture ?').kind,'CUSTOMER_LIFETIME');
assert.equal(classifyCustomerResearchQuestion('Explique pourquoi les clients reviennent plus après la hausse du jus d’orange et du poulet').kind,'CUSTOMER_RETENTION_RESEARCH');
assert.equal(classifyCustomerResearchQuestion('Quel impact augmentation des prix du jus orange et poulet sur la fréquentation ?').kind,'CUSTOMER_RETENTION_RESEARCH');
assert.equal(classifyCustomerResearchQuestion('Les clients sont-ils revenus ?'),null,'Simple question must retain classic query agent');
assert.equal(classifyCustomerResearchQuestion('Top 10 articles'),null);
const stores=[{id:'trefle',name:'Trèfle'}],input={start:'2026-10-11',end:'2026-10-20',compareStart:'2026-10-01',compareEnd:'2026-10-10',question:'Impact de la hausse du prix du jus orange et poulet sur les clients ?'};
const key='customer-research-v1|trefle|2026-10-11|2026-10-20|2026-10-01|2026-10-10';
const hit=await customerResearchQuestion(stores,input,{read:async k=>k===key?r:null});
assert.equal(hit.engine,'CUSTOMER_RESEARCH');
assert.equal(hit.causal,false);assert.match(hit.answer,/causal/);
assert(hit.sections.some(s=>s.title.includes('Jus')));
assert(hit.sections[1].rows.some(row=>row[0].includes('Orange')));
assert(!JSON.stringify(hit).includes('"C1"'));
const missing=await customerResearchQuestion(stores,input,{read:async()=>null});
assert.equal(missing.status,'NEEDS_RESEARCH');
assert.equal(missing.suggestedSection,'crm');
const lifetime=await customerResearchQuestion(stores,{...input,question:'Combien recrutés depuis ouverture ?'},{read:async()=>null});
assert.equal(lifetime.status,'NEEDS_HISTORICAL_START');
assert.match(lifetime.answer,/date.*officielle|date historique vérifiée/i);
const agent=await answerBusinessQuestion(stores,input,{allowedStores:stores,read:async k=>k===key?r:null});
assert.equal(agent.engine,'CUSTOMER_RESEARCH','Complex question must not turn into generic CA list');
const source=readFileSync(new URL('../services/analytics-customer-bi-api.mjs',import.meta.url),'utf8');
assert.match(source,/customer-research-v1/);assert.match(source,/PREPARATION_REQUIRED/);
assert.match(source,/customer-base\/prepare/);
assert.match(source,/readStoreLoyaltyEnrollments/);
assert.match(source,/openingDateCertified:false/,'Cumulative enrollments cannot claim certified opening dates');
assert.match(source,/distinctRegisteredCustomers/);
assert.match(source,/identityComplete/);
const html=readFileSync(new URL('../../frontend/analytics/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../../frontend/analytics/customer-research.js',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../../frontend/analytics/bootstrap.js',import.meta.url),'utf8');
assert.match(html,/id="customerResearch"/);
assert.match(html,/id="customerHistoryStart"/);
assert.match(html,/id="customerBaseCancel"/);
assert.match(bootstrap,/customer-research\.js/);
assert.match(js,/customer-base\/prepare/);
assert.match(js,/noRetry:true,signal/);
assert.doesNotMatch(js,/\binnerHTML\s*=/,'No raw customer strings may be injected as HTML');
console.log('PASS customer retention, price association, matched visits, no causal claims, longitudinal enrollment safety, natural language routing and UI contracts');

import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.STOREOPS_DB=join(mkdtempSync(join(tmpdir(),'analytics-tools-')),'qa.db');
delete process.env.ANTHROPIC_API_KEY;
const {db}=await import('../db.mjs');
const {analyticsCacheKey,writeAnalyticsCache}=await import('../services/analytics-persistent-cache.mjs');
const {assistantFacts,answerAnalytics,validateAnalyticsAnswer,validateAnalyticsPlan,renderAnalyticsPlan,analyticsPlanRequest,extractAnalyticsPlan,analyticsAiFailure,compatibleAnalyticsPlanRequest}=await import('../services/analytics-assistant.mjs');
const {handleDecisionToolsApi}=await import('../services/analytics-decision-tools-api.mjs');
const {competitorObservations}=await import('../services/analytics-competitors.mjs');
const {basketEvidence,compareBasketEvidence}=await import('../services/customer-product-intelligence.mjs');
const {releasedProductProfile}=await import('../services/released-product-sourcing.mjs');
for(const id of ['qa-A','qa-B'])db.prepare('INSERT OR IGNORE INTO stores(id,name,code,active) VALUES(?,?,?,1)').run(id,id,id);
const stores=[{id:'qa-A',name:'Magasin test'}],user={id:'qa-user',role:'store_manager',store_id:'qa-A'};
const input={start:'2026-10-20',end:'2026-10-21',compareStart:'2026-10-18',compareEnd:'2026-10-19'};
const part={coverage:{currentStoresReady:1,comparisonStoresReady:1},summary:{current:{sales:200,tickets:10,identifiedSales:100,identifiedTickets:6,marginValue:40,marginSalesBase:170},previous:{sales:160,tickets:8,identifiedSales:80}},products:[{key:'SKU',label:'Produit test',sales:200,previousSales:160}],stores:[{storeId:'qa-A',storeName:'Magasin test',sales:200,previousSales:160,tickets:10}],crm:{customerMergeRows:[{customerAccount:'PRIVATE_ACCOUNT',customerName:'PRIVATE_NAME'}]},margin:{status:'ESTIMATED',coveragePct:99},quality:{status:'OK'},generatedAt:'2026-10-22T10:00:00Z'};
const cache=analyticsCacheKey('decision-v32',['qa-A',input.start,input.end,input.compareStart,input.compareEnd]);
await writeAnalyticsCache(cache,'decision-v32',part,300);
const f=await assistantFacts(stores,{...input,sales:999999});assert.equal(f.sales.current,200);assert.equal(f.sales.delta,40);assert.equal(f.sales.averageBasket,20);assert.equal(f.sales.identifiedCustomers,1);assert.ok(!JSON.stringify(f).includes('PRIVATE_'));
const answer=await answerAnalytics('Quel CA ?',f);assert.equal(answer.engine,'CALCULATED');assert.match(answer.answer,/200 DH/);assert.match(answer.answer,/\[S1\]/);
await assert.rejects(assistantFacts(stores,{...input,compareStart:'2026-08-01'}),{status:400});
await assert.rejects(assistantFacts(stores,{...input,slices:'wrong'}),{status:400});
const slice={storeIds:['qa-B'],period:{startDate:input.start,endDate:input.end},comparison:{startDate:input.compareStart,endDate:input.compareEnd}};
await assert.rejects(assistantFacts(stores,{...input,slices:[slice]}),{status:403});
await assert.rejects(assistantFacts(stores,{...input,slices:[{...slice,storeIds:['qa-A','qa-A']}]}),{status:400});
await assert.rejects(assistantFacts(stores,{...input,slices:[{...slice,storeIds:['qa-A'],period:{startDate:input.start,endDate:input.start}}]}),{status:409});
await writeAnalyticsCache(cache,'decision-v32',{...part,coverage:{currentStoresReady:0,comparisonStoresReady:1}},300);await assert.rejects(assistantFacts(stores,input),{status:409});
await writeAnalyticsCache(cache,'decision-v32',{...part,summary:{current:{sales:null,tickets:10},previous:part.summary.previous}},300);const unknown=await assistantFacts(stores,input);assert.equal(unknown.sales.delta,null);assert.equal(unknown.sales.averageBasket,null);
const req=(method,value)=>({method,async *[Symbol.asyncIterator](){yield JSON.stringify(value)}});
let r=await handleDecisionToolsApi({req:req('GET'),user,url:new URL('https://test/api/analytics/operational-summary?storeId=qa-B')});assert.equal(r.status,403);
r=await handleDecisionToolsApi({req:req('GET'),user,url:new URL('https://test/api/analytics/pricing-context?storeId=qa-A&product=SKU&date=2026-02-31')});assert.equal(r.status,400);
await assert.rejects(handleDecisionToolsApi({req:req('POST',null),user,url:new URL('https://test/api/analytics/assistant')}),{status:400});
const observation={product:'SKU',retailer:'Marjane',city:'Casablanca',shop:'Magasin test',matchType:'EQUIVALENT',price:'12.5',unit:'L',priceQuantity:1,currency:'MAD',observedAt:'2026-10-20',sourceUrl:'https://www.marjane.ma/promotions'};
await assert.rejects(competitorObservations(stores,observation,{...user,role:'employee'},'POST'),{status:403});
for(const overrides of [{observedAt:'2026-02-31'},{sourceUrl:'http://example.com'},{sourceUrl:'https://name:password@example.com'},{price:''},{price:-1},{priceQuantity:0},{city:'Rabat'}])await assert.rejects(competitorObservations(stores,{...observation,...overrides},user,'POST'),{status:400});
assert.equal((await competitorObservations(stores,observation,user,'POST')).status,'RECORDED');const found=await competitorObservations(stores,{product:'SKU'},user,'GET');assert.equal(found.items.length,1);assert.equal(found.items[0].matchType,'EQUIVALENT');assert.equal((await competitorObservations([{id:'qa-B'}],{product:'SKU'},user,'GET')).items.length,0);
const fields={product:'sku',customer:'customer',date:'date',salesUnit:'unit',quantity:'qty',discount:'disc',periodicDiscount:'periodic'};
const row={dataAreaId:'X',store:'qa-A',terminalId:'T',transactionId:'1',sku:'SKU',unit:'PC',qty:1,date:'2026-10-20',sales:10,periodic:1,disc:1};
const evidence=basketEvidence([row,{...row,sales:20,periodic:0},{...row,date:'2026-10-21',sales:5}],fields,{storeId:'qa-A',amount:r=>r.sales});const report=compareBasketEvidence(evidence,{baskets:[]});assert.equal(report.summary.tickets,2);assert.equal(report.summary.promotionSales,15,'only discounted lines, never every line of the same SKU');assert.equal(report.summary.sales,35);assert.equal(report.products[0].current.promotionSales,15);
assert.equal(releasedProductProfile({ItemNumber:'SKU',SalesPrice:12,SalesPriceDate:'2026-10-21T12:00:00Z'}).salesPriceDate,'2026-10-21T12:00:00Z');assert.equal(releasedProductProfile({ItemNumber:'SKU',SalesPrice:null}).salesPrice,null);
console.log('PASS assistant server evidence, privacy, dates and scope; competitor provenance and management; exact discounted lines and daily tickets; master price date');

assert.equal(f.currency,'MAD');assert.equal(f.moneyUnit,'DH');assert.equal(f.salesBasis,'TTC');assert.equal(f.marginBasis,'HT');
for(const text of ['CA : 200 € [S1]','CA : 200 EUR','200 euros','200 USD','200 dollars','$200','200 £','200 ¥'])assert.throws(()=>validateAnalyticsAnswer(text),{code:'INVALID_AI_CURRENCY'});assert.equal(validateAnalyticsAnswer('CA TTC : 200 DH [S1]'),'CA TTC : 200 DH [S1]');

const rejectedAI=await answerAnalytics('Fixture devise invalide',f,{generate:async()=> 'CA : 200 € [S1]'});assert.equal(rejectedAI.engine,'CALCULATED');assert.equal(rejectedAI.aiValidationFailed,true);assert.ok(!rejectedAI.answer.includes('€'));assert.match(rejectedAI.answer,/200 DH/);
const validAI=await answerAnalytics('Fixture devise valide',f,{generate:async()=> JSON.stringify({topics:['SALES'],productIds:[],actions:['TRAFFIC']})});assert.equal(validAI.engine,'AI_GROUNDED');assert.equal(validAI.aiValidationFailed,false);

assert.equal(f.margin.valueHT,40);assert.equal(f.margin.salesBaseHT,170);assert.equal(f.margin.accountingCertified,false);assert.equal(f.margin.estimated,true);assert.match(f.ticketDefinition,/pas un client unique/);assert.equal(validateAnalyticsAnswer('## Résultat\n**200 DH** [S1]'),'Résultat\n200 DH [S1]');const marginAnswer=await answerAnalytics('Fixture marge calculée',f);assert.match(marginAnswer.answer,/40 DH/);

const plan={topics:['SALES','CUSTOMERS','MARGIN'],productIds:[],actions:[]};const rendered=renderAnalyticsPlan(validateAnalyticsPlan(JSON.stringify(plan),f),f);assert.match(rendered,/6 sur 10 \(60 %\)/);assert.match(rendered,/40 DH/);assert.ok(!rendered.includes('1 sur 10'));for(const extra of [{answer:'999999 DH'},{ratio:999999}])assert.throws(()=>validateAnalyticsPlan(JSON.stringify({...plan,...extra}),f),{code:'INVALID_AI_PLAN'});assert.throws(()=>validateAnalyticsPlan(JSON.stringify({...plan,productIds:['UNKNOWN']}),f),{code:'INVALID_AI_PLAN'});assert.throws(()=>validateAnalyticsPlan(JSON.stringify({...plan,actions:['INVENT_A_CAUSE']}),f),{code:'INVALID_AI_PLAN'});const invented=await answerAnalytics('Fixture tentative montant inventé',f,{generate:async()=>JSON.stringify({...plan,answer:'999999 DH'})});assert.equal(invented.engine,'CALCULATED');assert.equal(invented.aiValidationFailed,true);assert.ok(!invented.answer.includes('999999'));

assert.ok(rendered.includes('\n\n'),'answers must contain real paragraph breaks');assert.ok(!rendered.includes('\\n'));

const basketUnits=renderAnalyticsPlan({topics:['SALES'],productIds:[],actions:[]},{...f,sales:{...f.sales,current:200,tickets:10,previous:90,previousTickets:9,delta:110}});assert.match(basketUnits,/variation 10 DH/);assert.ok(!basketUnits.includes('points'));

const request=analyticsPlanRequest('Question',f);assert.equal(request.tool_choice.name,'select_analysis');assert.equal(request.tools[0].strict,true);assert.equal(request.tools[0].input_schema.additionalProperties,false);
const compatible=compatibleAnalyticsPlanRequest(request);assert.equal(compatible.tool_choice.name,'select_analysis');assert.equal(compatible.tools[0].strict,undefined);assert.equal(compatible.tools[0].input_schema.properties.topics.maxItems,undefined);assert.equal(compatible.tools[0].input_schema.additionalProperties,false);assert.equal(request.tools[0].strict,true);
assert.deepEqual(validateAnalyticsPlan(extractAnalyticsPlan({content:[{type:'tool_use',name:'select_analysis',input:plan}]}),f),plan);
assert.throws(()=>extractAnalyticsPlan({content:[{type:'text',text:'999999 DH'}]}),{code:'INVALID_AI_PLAN'});
assert.deepEqual(validateAnalyticsPlan('```json\n'+JSON.stringify(plan)+'\n```',f),plan);
assert.match(basketUnits,/effet nombre de tickets 10 DH ; effet panier 100 DH/);assert.match(basketUnits,/Somme : 110 DH/);
assert.equal(analyticsAiFailure({status:401,message:'secret'}),'PROVIDER_ACCESS');assert.equal(analyticsAiFailure({status:400}),'PROVIDER_CONFIGURATION');assert.equal(analyticsAiFailure({name:'APIConnectionTimeoutError'}),'TIMEOUT');
const unavailable=await answerAnalytics('Fixture fournisseur indisponible',f,{generate:async()=>{throw {status:400,message:'PRIVATE_SECRET'}}});assert.equal(unavailable.aiStatus,'PROVIDER_CONFIGURATION');assert.ok(!JSON.stringify(unavailable).includes('PRIVATE_SECRET'));
const {commonReferenceAssortment,detentionRows}=await import('../services/analytics-detention.mjs');
const common=commonReferenceAssortment({products:['A','B','C'],complete:true});assert.equal(common.status,'READY');
const positions=detentionRows({storeId:'qa-A',referenceProducts:['A','B','C'],assortment:common,local:{complete:true,items:[{productNumber:'A',availableOnHandQuantity:5},{productNumber:'ORPHAN',availableOnHandQuantity:2}]},supply:{complete:true,items:[{productNumber:'B',availableOnHandQuantity:12}]}});
assert.equal(positions.filter(r=>r.expected).length,3);assert.equal(positions.find(r=>r.productNumber==='ORPHAN').expected,false);assert.equal(positions.find(r=>r.productNumber==='C').storeAvailable,0);
const {detentionInsights}=await import('../services/analytics-action-intelligence.mjs');const commonKpi=detentionInsights(positions,{complete:true,assortmentReady:true});assert.equal(commonKpi.expectedDetentionPct,33.33);assert.equal(commonKpi.replenishable,1);
assert.equal(commonReferenceAssortment({products:['A'],complete:false}).status,'INCOMPLETE');assert.equal(commonReferenceAssortment({products:[],complete:true}).status,'INCOMPLETE');
console.log('PASS common full-reference assortment, orphan exclusion, exact revenue drivers, structured provider plan and safe failure diagnosis');

const dcKpi=detentionInsights(positions,{complete:true,warehouseComplete:true,assortmentReady:true});assert.equal(dcKpi.warehouseExpectedDetentionPct,33.33);assert.equal(commonKpi.warehouseExpectedDetentionPct,null);

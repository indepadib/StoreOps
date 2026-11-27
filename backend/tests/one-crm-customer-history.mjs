import assert from 'node:assert/strict';
import {readCustomerPositiveHistory} from '../services/one-crm-customer-history.mjs';
import {makeCustomerDirectoryGateway} from '../services/one-crm-customer-directory.mjs';
const company='C1',accountRef="ACC'1",stores=[{id:'a'},{id:'b'}];
const row=(store,tx,net=10,date='2025-01-01')=>({dataAreaId:company,store,terminalId:'T',transactionId:tx,custAccount:accountRef,businessDate:date,itemId:'SKU',net,qty:2,unit:'EA'});
let rows=[row('A','t1'),row('A','t1',5),row('A','void'),row('A','ret',-5),row('B','t2',20,'2026-11-25')],calls=[];
const deps={now:()=> '2026-11-26T12:00:00Z',salesConfig:()=>({ready:true,entity:'RetailTransactionSalesTransBIEntities',fields:{store:'store',customer:'custAccount',date:'businessDate',product:'itemId',net:'net',quantity:'qty',salesUnit:'unit'}}),settings:id=>({d365:{storeNumber:id.toUpperCase(),legalEntityId:company}}),amount:r=>r.net,eligible:r=>r.net>0,readCollection:async(entity,opts)=>{calls.push(opts.filter);const store=opts.filter.includes("store eq 'A'")?'A':'B';if(entity==='RetailTransactionSalesTransBIEntities')return rows.filter(r=>r.store===store);return [...new Set(rows.filter(r=>r.store===store&&opts.filter.includes("transactionId eq '"+r.transactionId+"'")).map(r=>r.transactionId))].map(transactionId=>({dataAreaId:company,store,terminal:'T',transactionId,type:'SALES',entryStatus:transactionId==='void'?'VOIDED':'POSTED'}))}};
const scope={accountRef,company,stores,page:1};
let x=await readCustomerPositiveHistory(scope,deps);assert.equal(x.status,'READY');assert.equal(x.totalTickets,2);assert.equal(x.positiveTtc,35);assert.equal(x.behavior.averageBasket,17.5);assert.equal(x.behavior.recencyDays,1);assert.equal(x.behavior.shoppingDays,2);assert.equal(x.behavior.ticketsLast30Days,1);assert.equal(x.behavior.ticketsLast90Days,1);assert.equal(x.behavior.favoriteStore,null);assert.equal(x.behavior.topProducts[0].tickets,2);assert.equal(x.behavior.topProducts[0].positiveTtc,35);assert.equal(x.firstPurchase,'2025-01-01');assert.equal(x.rows[1].items[0].quantity,4);assert.equal(x.rows[1].items[0].positiveTtc,15);assert.ok(calls[0].includes("custAccount eq 'ACC''1'"));assert.ok(!calls[0].includes('businessDate'));assert.ok(!JSON.stringify(x).includes('terminal'));
const observedBurn=await readCustomerPositiveHistory(scope,{...deps,readTicketBurn:async(storeId,{company:area,tickets})=>{assert.equal(area,company);assert.ok(tickets.every(t=>t.storeId===storeId));return {basis:'ANALYTICS_WALLET_TENDER_ON_OBSERVED_TICKETS',currency:'MAD',receipts:tickets.map(t=>({terminal:t.terminal,transactionRef:t.transactionRef,date:t.date,status:'READY',burn:storeId==='a'?5:0}))}}});assert.equal(observedBurn.totalTickets,2);assert.deepEqual(observedBurn.rows.map(t=>t.walletBurn.amount),[0,5]);assert.ok(!JSON.stringify(observedBurn).includes('terminal'));
const failedBurn=await readCustomerPositiveHistory(scope,{...deps,readTicketBurn:async()=>{throw Error('payment unavailable')}});assert.equal(failedBurn.totalTickets,2);assert.ok(failedBurn.rows.every(t=>t.walletBurn.status==='UNAVAILABLE'&&t.walletBurn.amount===null));
rows.push({...row('A','bad'),custAccount:'OTHER'});assert.equal((await readCustomerPositiveHistory(scope,deps)).status,'UNAVAILABLE');rows=[];
x=await readCustomerPositiveHistory(scope,deps);assert.equal(x.totalTickets,0);assert.equal(x.positiveTtc,0);assert.equal(x.firstPurchase,null);assert.equal(x.behavior.averageBasket,null);assert.equal(x.behavior.recencyDays,null);assert.equal(x.behavior.averageDaysBetweenVisits,null);assert.equal(x.behavior.shoppingDays,0);assert.deepEqual(x.behavior.topProducts,[]);
assert.equal((await readCustomerPositiveHistory(scope,{...deps,settings:()=>({d365:{storeNumber:'A',legalEntityId:company}})})).status,'UNAVAILABLE');
// Histories above the former 500-ticket limit retain all tickets and the last page.
rows=Array.from({length:501},(_,i)=>row('A','long-'+String(i).padStart(4,'0'),10));
x=await readCustomerPositiveHistory({...scope,page:26},deps);assert.equal(x.status,'READY');assert.equal(x.totalTickets,501);assert.equal(x.positiveTtc,5010);assert.equal(x.rows.length,1);
const missingParent={...deps,readCollection:async(entity,opts)=>{const value=await deps.readCollection(entity,opts);return entity==='RetailTransactionTableBIEntities'?value.slice(1):value}};
assert.equal((await readCustomerPositiveHistory(scope,missingParent)).status,'UNAVAILABLE');
rows=Array.from({length:2001},(_,i)=>row('A','over-'+i));
assert.equal((await readCustomerPositiveHistory(scope,deps)).reason,'HISTORY_PARENT_LIMIT');
rows=[];
let reads=0;const gateway=makeCustomerDirectoryGateway({listStores:()=>[...stores,{id:'c'}],canAccessStore:()=>true,readMaster:async()=>({rows:[{accountRef}]}),readHistory:async(r,s,p)=>{reads++;assert.deepEqual(s,stores);assert.equal(p,1);return {status:'READY',accountRef:r.accountRef}},pilotStores:'a,b'});
const req={session:{mode:'entra',user:{role:'ops_director'}},dynamicsMode:'live',method:'GET',query:new URLSearchParams({accountRef,history:'1',page:'1'})};assert.equal((await gateway(req)).data.status,'READY');assert.equal((await gateway({...req,query:new URLSearchParams({accountRef:'OTHER',history:'1'})})).status,404);assert.equal((await gateway({...req,session:{mode:'local',user:{role:'store_manager'}}})).status,403);assert.equal(reads,1);
console.log('CRM customer positive history contract passed');

import {summarizeCustomerBehavior} from '../services/one-crm-customer-behavior.mjs';
const item=(productNumber,positiveTtc)=>({productNumber,productName:null,positiveTtc});
const t=(storeId,date,items)=>({storeId,date,items,positiveTtc:items.reduce((n,i)=>n+i.positiveTtc,0)});
const b=summarizeCustomerBehavior([t('a','2026-11-26',[item('X',5),item('X',3)]),t('a','2026-11-26',[item('Y',8)]),t('b','2026-11-16',[item('X',8)])],'2026-11-26T12:00:00Z');
assert.equal(b.shoppingDays,2);assert.equal(b.averageDaysBetweenVisits,10);assert.equal(b.favoriteStore,'a');assert.equal(b.topProducts[0].tickets,2);assert.equal(b.distinctProducts,2);assert.equal(b.recencyDays,0);assert.equal(b.ticketsLast30Days,3);

import {projectRfmPopulation,isPreparedRfmRange} from '../services/one-crm-rfm-population.mjs';
assert.equal(b.rfm.positiveTtc90,24);assert.equal(b.rfm.tickets90,3);assert.equal(b.rfm.segment,'REGULAR_ACTIVE');
const populationAccounts=[{accountRef:'A'},{accountRef:'B'},{accountRef:'C'}];
const sourceRange={status:'READY',source:'D365/RetailTransactionSalesTransBIEntities',storeId:'a',startDate:'2026-08-29',endDate:'2026-11-26',diagnostics:{truncated:false,filterCoverage:{parentTransaction:true},mappedFields:{customer:true}},customers:[{customerAccount:'A',sales:1200,tickets:8,lastDate:'2026-11-25'},{customerAccount:'OUTSIDE',sales:10,tickets:1,lastDate:'2026-11-25'}]};
const population=projectRfmPopulation({accounts:populationAccounts,stores:['a','b'],asOf:'2026-11-26',ranges:[sourceRange,{...sourceRange,storeId:'b',customers:[{customerAccount:'A',sales:300,tickets:2,lastDate:'2026-11-26'},{customerAccount:'B',sales:90,tickets:1,lastDate:'2026-10-01'}]}]});
assert.equal(population.totalAccounts,3);assert.equal(population.coverage.coveredStoreDays,180);assert.equal(population.coverage.unmatchedPurchaseAccounts,1);assert.equal(population.rows[0].rfm.tickets90,10);assert.equal(population.rows[0].rfm.positiveTtc90,1500);assert.equal(population.rows[0].rfm.recencyDays,0);assert.equal(population.rows[2].status,'NO_PURCHASE_IN_OBSERVED_90_DAYS');assert.equal(population.rows[2].recencyLowerBoundDays,90);
const incomplete=projectRfmPopulation({accounts:populationAccounts,stores:['a','b'],asOf:'2026-11-26',ranges:[sourceRange]});assert.equal(incomplete.status,'PARTIAL');assert.ok(incomplete.rows.every(x=>x.status==='HISTORY_INCOMPLETE'&&x.rfm===null));
assert.throws(()=>projectRfmPopulation({accounts:populationAccounts,stores:['a'],asOf:'2026-11-26',ranges:[sourceRange,sourceRange]}));

const dayRanges=Array.from({length:90},(_,i)=>{const date=new Date(Date.parse('2026-08-29')+i*86400000).toISOString().slice(0,10);return {...sourceRange,startDate:date,endDate:date,customers:i===89?[{customerAccount:'A',sales:25,tickets:1,lastDate:date}]:[]}});
assert.ok(isPreparedRfmRange(dayRanges[0],'a','2026-08-29','2026-08-29'));assert.ok(!isPreparedRfmRange(dayRanges[0],'b','2026-08-29','2026-08-29'));assert.ok(!isPreparedRfmRange({...dayRanges[0],diagnostics:{...dayRanges[0].diagnostics,truncated:true}},'a','2026-08-29','2026-08-29'));
const dailyPopulation=projectRfmPopulation({accounts:populationAccounts,stores:['a'],asOf:'2026-11-26',ranges:dayRanges});assert.equal(dailyPopulation.status,'READY');assert.equal(dailyPopulation.rows[0].rfm.positiveTtc90,25);assert.equal(dailyPopulation.rows[1].status,'NO_PURCHASE_IN_OBSERVED_90_DAYS');
assert.equal(projectRfmPopulation({accounts:populationAccounts,stores:['a'],asOf:'2026-11-26',ranges:dayRanges.slice(1)}).status,'PARTIAL');

assert.equal(population.segmentCounts.HIGH_VALUE_ACTIVE,1);assert.equal(population.segmentCounts.INACTIVE_30_PLUS,1);assert.equal(population.segmentCounts.NO_RECENT_PURCHASE,1);assert.deepEqual(incomplete.segmentCounts,{});

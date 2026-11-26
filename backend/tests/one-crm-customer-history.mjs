import assert from 'node:assert/strict';
import {readCustomerPositiveHistory} from '../services/one-crm-customer-history.mjs';
import {makeCustomerDirectoryGateway} from '../services/one-crm-customer-directory.mjs';
const company='C1',accountRef="ACC'1",stores=[{id:'a'},{id:'b'}];
const row=(store,tx,net=10,date='2025-01-01')=>({dataAreaId:company,store,terminalId:'T',transactionId:tx,custAccount:accountRef,businessDate:date,itemId:'SKU',net,qty:2,unit:'EA'});
let rows=[row('A','t1'),row('A','t1',5),row('A','void'),row('A','ret',-5),row('B','t2',20,'2026-11-25')],calls=[];
const deps={now:()=> '2026-11-26T12:00:00Z',salesConfig:()=>({ready:true,entity:'RetailTransactionSalesTransBIEntities',fields:{store:'store',customer:'custAccount',date:'businessDate',product:'itemId',net:'net',quantity:'qty',salesUnit:'unit'}}),settings:id=>({d365:{storeNumber:id.toUpperCase(),legalEntityId:company}}),amount:r=>r.net,eligible:r=>r.net>0,readCollection:async(entity,opts)=>{calls.push(opts.filter);const store=opts.filter.includes("store eq 'A'")?'A':'B';if(entity==='RetailTransactionSalesTransBIEntities')return rows.filter(r=>r.store===store);return [...new Set(rows.filter(r=>r.store===store).map(r=>r.transactionId))].map(transactionId=>({dataAreaId:company,store,terminal:'T',transactionId,type:'SALES',entryStatus:transactionId==='void'?'VOIDED':'POSTED'}))}};
const scope={accountRef,company,stores,page:1};
let x=await readCustomerPositiveHistory(scope,deps);assert.equal(x.status,'READY');assert.equal(x.totalTickets,2);assert.equal(x.positiveTtc,35);assert.equal(x.behavior.averageBasket,17.5);assert.equal(x.behavior.recencyDays,1);assert.equal(x.behavior.shoppingDays,2);assert.equal(x.behavior.ticketsLast30Days,1);assert.equal(x.behavior.ticketsLast90Days,1);assert.equal(x.behavior.favoriteStore,null);assert.equal(x.behavior.topProducts[0].tickets,2);assert.equal(x.behavior.topProducts[0].positiveTtc,35);assert.equal(x.firstPurchase,'2025-01-01');assert.equal(x.rows[1].items[0].quantity,4);assert.equal(x.rows[1].items[0].positiveTtc,15);assert.ok(calls[0].includes("custAccount eq 'ACC''1'"));assert.ok(!calls[0].includes('businessDate'));assert.ok(!JSON.stringify(x).includes('terminal'));
rows.push({...row('A','bad'),custAccount:'OTHER'});assert.equal((await readCustomerPositiveHistory(scope,deps)).status,'UNAVAILABLE');rows=[];
x=await readCustomerPositiveHistory(scope,deps);assert.equal(x.totalTickets,0);assert.equal(x.positiveTtc,0);assert.equal(x.firstPurchase,null);assert.equal(x.behavior.averageBasket,null);assert.equal(x.behavior.recencyDays,null);assert.equal(x.behavior.averageDaysBetweenVisits,null);assert.equal(x.behavior.shoppingDays,0);assert.deepEqual(x.behavior.topProducts,[]);
assert.equal((await readCustomerPositiveHistory(scope,{...deps,settings:()=>({d365:{storeNumber:'A',legalEntityId:company}})})).status,'UNAVAILABLE');
let reads=0;const gateway=makeCustomerDirectoryGateway({listStores:()=>[...stores,{id:'c'}],canAccessStore:()=>true,readMaster:async()=>({rows:[{accountRef}]}),readHistory:async(r,s,p)=>{reads++;assert.deepEqual(s,stores);assert.equal(p,1);return {status:'READY',accountRef:r.accountRef}},pilotStores:'a,b'});
const req={session:{mode:'entra',user:{role:'ops_director'}},dynamicsMode:'live',method:'GET',query:new URLSearchParams({accountRef,history:'1',page:'1'})};assert.equal((await gateway(req)).data.status,'READY');assert.equal((await gateway({...req,query:new URLSearchParams({accountRef:'OTHER',history:'1'})})).status,404);assert.equal((await gateway({...req,session:{mode:'local',user:{role:'store_manager'}}})).status,403);assert.equal(reads,1);
console.log('CRM customer positive history contract passed');

import {summarizeCustomerBehavior} from '../services/one-crm-customer-behavior.mjs';
const item=(productNumber,positiveTtc)=>({productNumber,productName:null,positiveTtc});
const t=(storeId,date,items)=>({storeId,date,items,positiveTtc:items.reduce((n,i)=>n+i.positiveTtc,0)});
const b=summarizeCustomerBehavior([t('a','2026-11-26',[item('X',5),item('X',3)]),t('a','2026-11-26',[item('Y',8)]),t('b','2026-11-16',[item('X',8)])],'2026-11-26T12:00:00Z');
assert.equal(b.shoppingDays,2);assert.equal(b.averageDaysBetweenVisits,10);assert.equal(b.favoriteStore,'a');assert.equal(b.topProducts[0].tickets,2);assert.equal(b.distinctProducts,2);assert.equal(b.recencyDays,0);assert.equal(b.ticketsLast30Days,3);

import {scoreObservedRfm} from '../services/one-crm-customer-rfm.mjs';
const high=scoreObservedRfm({recencyDays:7,tickets90:12,positiveTtc90:2500});assert.deepEqual(high.scores,{r:5,f:5,m:5});assert.equal(high.segment,'HIGH_VALUE_ACTIVE');
const old=scoreObservedRfm({recencyDays:100,tickets90:0,positiveTtc90:0});assert.equal(old.segment,'NO_RECENT_PURCHASE');assert.deepEqual(old.scores,{r:1,f:1,m:1});
assert.equal(scoreObservedRfm({recencyDays:null,tickets90:0,positiveTtc90:0}).scores,null);
assert.throws(()=>scoreObservedRfm({recencyDays:5,tickets90:0,positiveTtc90:0}));
assert.equal(b.rfm.positiveTtc90,24);assert.equal(b.rfm.tickets90,3);assert.equal(b.rfm.segment,'REGULAR_ACTIVE');

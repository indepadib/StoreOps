import assert from 'node:assert/strict';
import {readCrmAudience} from '../services/one-crm-readonly-adapter.mjs';
import {makeVerifiedDayReader} from '../services/one-crm-reconciliation.mjs';
const tenantId='synthetic',storeIds=['demo-a'],allowedStoreIds=['demo-a'],windowStart='2026-11-01',asOf='2026-11-02';
const readVerifiedDay=async ({tenantId,storeId,date})=>({tenantId,storeId,date,currency:'MAD',netAmountBasis:'verified-net-signed',coverageComplete:true,rejectedIdentity:0,tickets:[{tenantId,storeId,date,ticketId:date,customerToken:'synthetic-id',netMinor:10000}]});
const input={tenantId,storeIds,allowedStoreIds,windowStart,asOf,readVerifiedDay,rules:{minPurchaseTickets:2}};
const output=await readCrmAudience(input);
assert.equal(output.audienceCount,1);assert.equal(output.audienceNetMinor,20000);assert.equal(output.activationEnabled,false);assert.ok(!JSON.stringify(output).includes('synthetic-id'));
await assert.rejects(()=>readCrmAudience({...input,allowedStoreIds:[]}),/Forbidden/);
for(const patch of [{coverageComplete:false},{currency:'EUR'},{rejectedIdentity:1},{netAmountBasis:'unknown'},{date:'2026-11-03'}])await assert.rejects(()=>readCrmAudience({...input,readVerifiedDay:async q=>({...await readVerifiedDay(q),...patch})}),/unverified/);
await assert.rejects(()=>readCrmAudience({...input,readVerifiedDay:async q=>({...await readVerifiedDay(q),tickets:[{tenantId:'other',storeId:q.storeId,date:q.date}]})}),/partition/);
const categoryRule={kind:'rule',field:'preferredCategories',op:'contains',value:'A'};
const itemReader=async q=>{const d=await readVerifiedDay(q);return {...d,itemEvidenceComplete:true,tickets:d.tickets.map(t=>({...t,ticketId:'repeat-register-id',items:[{lineId:'1',productId:'P1',category:'A',netMinor:t.netMinor}]}))}};
const itemInput={...input,readVerifiedDay:itemReader,rules:{expression:categoryRule}};
const itemOutput=await readCrmAudience(itemInput);assert.equal(itemOutput.audienceCount,1);assert.equal(itemOutput.uniqueTickets,2);assert.equal(itemOutput.audienceNetMinor,20000);assert.ok(!JSON.stringify(itemOutput).includes('synthetic-id'));
await assert.rejects(()=>readCrmAudience({...itemInput,readVerifiedDay}),/item evidence/);
await assert.rejects(()=>readCrmAudience({...itemInput,readVerifiedDay:async q=>({...await itemReader(q),itemEvidenceComplete:false})}),/item evidence/);
await assert.rejects(()=>readCrmAudience({...itemInput,readVerifiedDay:async q=>{const d=await itemReader(q);d.tickets[0].items[0].netMinor=1;return d}}),/reconcile/);
const zero=await readCrmAudience({...itemInput,rules:{expression:{...categoryRule,value:'Other'}}});assert.equal(zero.audienceCount,0);
const verifiedReader=makeVerifiedDayReader({
 loadSignedBatch:async q=>({...q,source:'synthetic-source',currency:'MAD',closed:true,coverageComplete:true,basis:'signed-retail-net',rejectedIdentity:0,itemEvidenceComplete:true,tickets:[{...q,ticketId:'1',customerToken:'synthetic-id',netMinor:10000,items:[{lineId:'1',productId:'P1',category:'A',netMinor:10000}]}]}),
 loadIndependentControl:async q=>({...q,source:'synthetic-control',currency:'MAD',closed:true,basis:'signed-retail-net',tickets:1,positiveMinor:10000,refundMinor:0,netMinor:10000})
});
const through=await readCrmAudience({...itemInput,readVerifiedDay:verifiedReader});
assert.equal(through.audienceCount,1);assert.equal(through.audienceNetMinor,20000);assert.equal(through.uniqueTickets,2);assert.ok(!JSON.stringify(through).includes('synthetic-id'));
let reads=0;
for(const rules of [null,[],{expression:null},{expression:categoryRule,minNetMinor:100},{unknown:1},{minPurchaseTickets:4,maxPurchaseTickets:2}]){
 await assert.rejects(()=>readCrmAudience({...input,rules,readVerifiedDay:async q=>{reads++;return readVerifiedDay(q)}}));
}
assert.equal(reads,0);
console.log('CRM read-only source boundary passed');

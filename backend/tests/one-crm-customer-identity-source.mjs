import assert from 'node:assert/strict';
import {readCustomerIdentity,readCustomerNames,searchCustomerIdentity} from '../services/one-crm-customer-identity-source.mjs';
import {makeCustomerDirectoryGateway} from '../services/one-crm-customer-directory.mjs';
const accountRef="ACCOUNT'1",company='5001';
const row={CustomerAccount:accountRef,dataAreaId:company,CustomerGroupId:'Retail',PartyType:'Person',PersonFirstName:'Test',PersonLastName:'Client',PrimaryContactEmail:'sample@example.invalid',PrimaryContactPhone:'+212000000000',OrganizationName:'wrong',PrivateOtherField:'never return'};
let reads=0;
const read=async(entity,opts)=>{reads++;assert.equal(entity,'CustomersV3');assert.ok(opts.filter.includes("CustomerAccount eq 'ACCOUNT''1'"));assert.ok(opts.filter.includes("dataAreaId eq '5001'"));assert.ok(opts.filter.includes("CustomerGroupId eq 'Retail'"));assert.equal(opts.top,2);return {value:[row]}};
const input={accountRef,company,read};
const x=await readCustomerIdentity(input);assert.equal(x.status,'READY');assert.equal(x.firstName,'Test');assert.equal(x.lastName,'Client');assert.equal(x.organizationName,null);assert.equal(x.email,row.PrimaryContactEmail);assert.equal(x.phone,row.PrimaryContactPhone);assert.equal(x.consentStatus,'NOT_VERIFIED');assert.ok(!JSON.stringify(x).includes('never return'));assert.equal(reads,1);
for(const r of [{...row,dataAreaId:'other'},{...row,CustomerGroupId:'Wholesale'},{...row,CustomerAccount:'wrong'}]){const y=await readCustomerIdentity({...input,read:async()=>({value:[r]})});assert.equal(y.status,'UNAVAILABLE');assert.equal(y.email,null)}
const partial=await readCustomerIdentity({...input,read:async(_,o)=>{if(o.select.includes('PrimaryContactEmail'))throw Object.assign(Error('private data'),{details:{httpStatus:400}});return {value:[row]}}});assert.equal(partial.status,'PARTIAL');assert.equal(partial.firstName,'Test');assert.equal(partial.email,null);
const unavailable=await readCustomerIdentity({...input,read:async()=>{throw Object.assign(Error('private'),{code:'D365_REQUEST_TIMEOUT'})}});assert.equal(unavailable.reason,'IDENTITY_SOURCE_TIMEOUT');assert.ok(!JSON.stringify(unavailable).includes('private'));
let calls=0;
const gate=makeCustomerDirectoryGateway({listStores:()=>[{id:'a'}],canAccessStore:()=>true,pilotStores:'a',readPage:async()=>null,readCount:async()=>null,findAccount:async a=>a===accountRef?{accountRef}:null,readIdentity:async()=>{calls++;return x}});
const req={session:{mode:'entra',user:{role:'ops_director'}},dynamicsMode:'live',method:'GET',query:new URLSearchParams({accountRef,identity:'1'})};
assert.equal((await gate(req)).data.firstName,'Test');assert.equal((await gate({...req,session:{mode:'local',user:{role:'store_manager'}}})).status,403);assert.equal((await gate({...req,query:new URLSearchParams({accountRef:'missing',identity:'1'})})).status,404);assert.equal((await gate({...req,query:new URLSearchParams({accountRef,identity:'1',history:'1'})})).status,400);assert.equal(calls,1);
console.log('CRM exact account identity source and authorization passed');

const accounts=Array.from({length:50},(_,i)=>'AC-'+i);let batchCalls=0;
const names=await readCustomerNames({accounts,company,read:async(_,opts)=>{batchCalls++;const ids=accounts.filter(a=>opts.filter.includes("CustomerAccount eq '"+a+"'"));assert.ok(ids.length<=10);return {value:ids.map(a=>({...row,CustomerAccount:a}))}}});assert.equal(batchCalls,5);assert.equal(names.rows.length,50);assert.ok(names.rows.every(r=>r.displayName==='Test Client'));assert.ok(!JSON.stringify(names).includes(row.PrimaryContactEmail));
const bad=await readCustomerNames({accounts:['AC-1'],company,read:async()=>({value:[{...row,CustomerAccount:'AC-1',dataAreaId:'other'}]})});assert.equal(bad.rows[0].displayName,null);assert.equal(bad.status,'PARTIAL');
const pageGate=makeCustomerDirectoryGateway({listStores:()=>[{id:'a'}],canAccessStore:()=>true,pilotStores:'a',readPage:async()=>({status:'READY',rows:[{accountRef}]}),readCount:async()=>null,findAccount:async()=>null,readNames:async a=>{assert.deepEqual(a,[accountRef]);return names}});
assert.equal((await pageGate({...req,query:new URLSearchParams({names:'1',page:'1'})})).data.status,'READY');assert.equal((await pageGate({...req,query:new URLSearchParams({names:'1',accountRef})})).status,400);

let searchCalls=0;
const nameSearch=await searchCustomerIdentity({company,query:'Test Client',by:'name',page:1,read:async(_,opts)=>{searchCalls++;assert.ok(opts.filter.includes("contains(PersonFirstName,'Test')"));assert.ok(opts.filter.includes("contains(PersonLastName,'Client')"));assert.equal(opts.top,51);return {value:[row]}}});assert.equal(nameSearch.rows[0].displayName,'Test Client');assert.equal(nameSearch.rows[0].accountRef,accountRef);
const phoneSearch=await searchCustomerIdentity({company,query:'+212000',by:'phone',page:1,read:async(_,opts)=>{assert.ok(opts.filter.includes("contains(PrimaryContactPhone,'+212000')"));return {value:[row]}}});assert.equal(phoneSearch.rows.length,1);assert.ok(!JSON.stringify(phoneSearch).includes(row.PrimaryContactPhone));
assert.equal((await searchCustomerIdentity({company,query:'Te',by:'name',read:async()=>{throw Error('must not call')}})).reason,'IDENTITY_SEARCH_INVALID');
assert.equal((await searchCustomerIdentity({company,query:'Test',by:'name',read:async()=>({value:[{...row,dataAreaId:'other'}]})})).status,'UNAVAILABLE');
const searchGate=makeCustomerDirectoryGateway({listStores:()=>[{id:'a'}],canAccessStore:()=>true,pilotStores:'a',readPage:async()=>null,readCount:async()=>null,findAccount:async()=>null,searchIdentity:async b=>{assert.deepEqual(b,{query:'Test Client',by:'name',page:1});return nameSearch}});
const request={...req,method:'POST',query:new URLSearchParams(),identitySearch:{query:'Test Client',by:'name',page:1}};assert.equal((await searchGate(request)).data.status,'READY');assert.equal((await searchGate({...request,session:{mode:'local',user:{role:'store_manager'}}})).status,403);assert.equal((await searchGate({...request,query:new URLSearchParams({q:'Test'})})).status,400);assert.equal(searchCalls,1);

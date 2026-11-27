import assert from 'node:assert/strict';
import {readDirectorySourcePage,readDirectorySourceCount,findDirectorySourceAccount,customerSourceError} from '../services/one-crm-customer-source.mjs';
import {makeCustomerDirectoryGateway} from '../services/one-crm-customer-directory.mjs';
const company='5001',rows=Array.from({length:53},(_,i)=>({AccountNum:'CLT-'+String(i+1).padStart(2,'0'),SysCreatedDateTime:i===1?null:'2025-01-01T00:00:00Z',SysDataAreaId:company}));
const read=async(entity,opts)=>{assert.equal(entity,'CustTableCDREntities');assert.match(opts.filter,/CustGroup eq 'Retail'/);assert.ok(opts.filter.includes("AccountNum eq 'CLT*'"));assert.ok(opts.top<=51);assert.ok(!opts.filter.includes('SysCreatedDateTime'));if(opts.extra.includes('$count=true'))return {value:[rows[0]],'@odata.count':53};const skip=Number(new URLSearchParams(opts.extra).get('$skip')||0);return {value:rows.slice(skip,skip+opts.top)}};
const a=await readDirectorySourcePage({company,page:1,read});assert.equal(a.rows.length,50);assert.equal(a.hasMore,true);assert.equal(a.totalAccounts,null);assert.equal(a.rows[1].createdAt,null);
const b=await readDirectorySourcePage({company,page:2,read});assert.equal(b.rows.length,3);assert.equal(b.hasMore,false);assert.equal((await readDirectorySourceCount({company,read})).totalAccounts,53);
assert.equal((await findDirectorySourceAccount({company,accountRef:'CLT-01',read:async()=>({value:[rows[0]]})})).accountRef,'CLT-01');
await assert.rejects(()=>readDirectorySourcePage({company,page:1,read:async()=>({value:[{...rows[0],SysDataAreaId:'OTHER'}]})}),/PARTITION_INVALID/);
assert.equal(customerSourceError({code:'D365_REQUEST_TIMEOUT'}),'D365_REQUEST_TIMEOUT');assert.equal(customerSourceError({code:'D365_REQUEST_FAILED',details:{httpStatus:400}}),'CRM_D365_HTTP_400');
const gate=makeCustomerDirectoryGateway({listStores:()=>[{id:'a'}],canAccessStore:()=>true,pilotStores:'a',readPage:async()=>a,readCount:async()=>{throw Object.assign(Error('private raw message'),{code:'D365_REQUEST_TIMEOUT'})},findAccount:async()=>null,readProfile:async()=>null});
const req={session:{mode:'entra',user:{role:'ops_director'}},dynamicsMode:'live',method:'GET',query:new URLSearchParams({page:'1'})};assert.equal((await gate(req)).data.rows.length,50);const count=await gate({...req,query:new URLSearchParams({summary:'1'})});assert.equal(count.status,503);assert.equal(count.data.code,'D365_REQUEST_TIMEOUT');assert.ok(!JSON.stringify(count).includes('private'));assert.equal((await gate({...req,query:new URLSearchParams({summary:'1',page:'1'})})).status,400);
console.log('CRM bounded source page and independent count passed');

assert.equal(await findDirectorySourceAccount({company,accountRef:'CAC0001',read:async()=>{throw Error('must not read')}}),null);
await assert.rejects(()=>readDirectorySourcePage({company,page:1,read:async()=>({value:[{...rows[0],AccountNum:'CAC0001'}]})}),/PARTITION_INVALID/);

await readDirectorySourcePage({company,page:1,search:'CLT-01',read:async(_,o)=>{assert.ok(o.filter.includes("AccountNum eq '*CLT-01*'"));assert.ok(!o.filter.includes('startswith('));return {value:[rows[0]]}}});
await assert.rejects(()=>readDirectorySourceCount({company,read:async()=>({value:[{AccountNum:'CAC0001'}],'@odata.count':1})}),/COUNT_UNAVAILABLE/);

const mixed=[...Array.from({length:520},(_,i)=>({...rows[0],AccountNum:'CAC'+String(i).padStart(4,'0')})),...rows];
const fallbackRead=async(_,opts)=>{
 if(opts.filter.includes("AccountNum eq 'CLT*'"))throw Object.assign(Error('Unsupported filter'),{details:{httpStatus:400}});
 assert.ok(!opts.filter.includes("AccountNum"));
 const skip=Number(new URLSearchParams(opts.extra).get('$skip')||0);return {value:mixed.slice(skip,skip+opts.top)};
};
const fallbackPage=await readDirectorySourcePage({company,page:1,read:fallbackRead});assert.equal(fallbackPage.rows.length,50);assert.equal(fallbackPage.hasMore,true);assert.ok(fallbackPage.rows.every(r=>r.accountRef.startsWith('CLT')));
const fallbackSecond=await readDirectorySourcePage({company,page:2,read:fallbackRead});assert.equal(fallbackSecond.rows.length,3);assert.equal(fallbackSecond.hasMore,false);
assert.equal((await readDirectorySourceCount({company,read:fallbackRead})).totalAccounts,53);
assert.equal((await readDirectorySourcePage({company,page:1,search:'CLT-01',read:fallbackRead})).rows.length,1);
await assert.rejects(()=>readDirectorySourcePage({company,page:1,read:async()=>{throw Object.assign(Error('Forbidden'),{details:{httpStatus:403}})}}),/Forbidden/);

const {readMasterImportPage,advanceMasterImport}=await import('../services/one-crm-customer-source.mjs');
const rawMaster=[{AccountNum:'CLT-1',SysDataAreaId:'C1',SysCreatedDateTime:'2025-01-01'},{AccountNum:'CLT-2',SysDataAreaId:'C1',SysCreatedDateTime:'2025-01-01'}];const inputMaster={company:'C1',batch:1,read:async(entity,options)=>({value:rawMaster.slice(Number(options.extra.split('$skip=')[1]),Number(options.extra.split('$skip=')[1])+1)})};let stateMaster={offset:0,rows:[],complete:false};stateMaster=advanceMasterImport(stateMaster,await readMasterImportPage({...inputMaster,offset:stateMaster.offset}));assert.equal(stateMaster.complete,false);stateMaster=advanceMasterImport(stateMaster,await readMasterImportPage({...inputMaster,offset:stateMaster.offset}));stateMaster=advanceMasterImport(stateMaster,await readMasterImportPage({...inputMaster,offset:stateMaster.offset}));assert.equal(stateMaster.complete,true);assert.equal(stateMaster.rows.length,2);assert.throws(()=>advanceMasterImport({offset:1,rows:stateMaster.rows},{nextOffset:2,rows:[stateMaster.rows[0]],complete:false}));await assert.rejects(()=>readMasterImportPage({...inputMaster,read:async()=>({value:[{...rawMaster[0],SysDataAreaId:'C2'}]})}));

const {readMasterImportControl}=await import('../services/one-crm-customer-source.mjs');assert.equal(await readMasterImportControl({company:'C1',mode:'RETAIL',read:async()=>({'@odata.count':3,value:[{AccountNum:'CASH',SysDataAreaId:'C1'}]})}),3);await assert.rejects(()=>readMasterImportControl({company:'C1',mode:'CLT',read:async()=>({'@odata.count':3,value:[{AccountNum:'CASH',SysDataAreaId:'C1'}]})}));

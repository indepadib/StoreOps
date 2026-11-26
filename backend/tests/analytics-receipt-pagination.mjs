import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.STOREOPS_DB=join(mkdtempSync(join(tmpdir(),'receipt-pagination-')),'test.db');
const {prepareReceiptHistory}=await import('../services/analytics-receipt-history.mjs');
const mapping=type=>({type,entity:type,product:'sku',document:'doc',line:'line',warehouse:'warehouse',received:'received'});
function dependencies(get,resolve=mapping){const cache=new Map();return{cache,deps:{warehouse:'MAG',read:async k=>cache.get(k),write:async(k,g,value)=>{cache.set(k,structuredClone(value));return true},resolve:async type=>resolve(type),get}}}
async function finish(deps){let response=await prepareReceiptHistory('test',{},deps),steps=0;while(response.nextCursor!=null){assert.ok(++steps<15);response=await prepareReceiptHistory('test',{cursor:response.nextCursor,snapshot:response.snapshot},deps)}return response}
let calls=0;
const paged=dependencies(async(entity,q)=>{calls++;if(entity==='TO')return{value:[]};if(!q.continuation)return{value:[{sku:'A',received:1}],'@odata.nextLink':'https://example.test/data/PO?$skiptoken=opaque'};assert.match(q.filter,/warehouse eq 'MAG'/);return{value:[{sku:'B',received:1}]}});
const ready=await finish(paged.deps);assert.equal(ready.complete,true);assert.equal(calls,3);assert.equal(ready.paginationVersion,2);
assert.deepEqual([...paged.cache.values()].find(v=>v.status==='READY').products.map(p=>p.productNumber),['A','B'],'short first page with continuation must not end the history');
const invalid=dependencies(async()=>({}));assert.equal((await finish(invalid.deps)).complete,false,'invalid collection is not an empty complete history');
const repeated=dependencies(async entity=>entity==='TO'?{value:[]}:{value:[{sku:'A',received:1}],'@odata.nextLink':'https://example.test/data/PO?repeat'});assert.equal((await finish(repeated.deps)).complete,false,'repeated continuation blocks absence claims');
let headerCalls=0,documents;
const headers=dependencies(async(entity,q)=>{
 if(entity==='HEAD'){headerCalls++;return q.continuation?{value:[{doc:'D2',warehouse:'MAG'}]}:{value:[{doc:'D1',warehouse:'MAG'}],'@odata.nextLink':'https://example.test/data/HEAD?next'}}
 if(entity==='PO'){documents=q.filter;return{value:[{sku:'A',received:1}]}}return{value:[]};
},type=>type==='PO'?{...mapping(type),warehouse:null,header:'HEAD',headerDocument:'doc',headerWarehouse:'warehouse'}:mapping(type));
assert.equal((await finish(headers.deps)).complete,true);assert.equal(headerCalls,2);assert.match(documents,/D1/);assert.match(documents,/D2/);
console.log('PASS complete receipt continuation chains for lines/headers, invalid responses and repeated cursors remain partial');

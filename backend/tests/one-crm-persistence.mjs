import assert from 'node:assert/strict';
import {persistVerifiedStoreDay} from '../services/one-crm-persistence.mjs';
const scope={tenantId:'demo',storeId:'s',date:'2026-11-20'},id='00000000-0000-4000-8000-000000000001';
const batch={...scope,source:'lines',currency:'MAD',closed:true,coverageComplete:true,basis:'signed-retail-net',rejectedIdentity:0,tickets:[{...scope,ticketId:'t',netMinor:100,customerToken:'opaque'}]};
const control={...scope,source:'control',currency:'MAD',closed:true,basis:'signed-retail-net',tickets:1,positiveMinor:100,refundMinor:0,netMinor:100};
function mock({existing=false,failInsert=false}={}){
 const calls=[];const client={async query(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT 1'))return {rowCount:existing?1:0};if(sql.startsWith('SELECT'))return {rowCount:1};if(failInsert&&sql.startsWith('INSERT INTO one_crm.tickets'))throw Error('write failed');return {rowCount:1}},release(){calls.push({sql:'release'})}};
 return {calls,pool:{connect:async()=>client}};
}
const run=(pool,patch={})=>persistVerifiedStoreDay({...scope,pool,batch,control,allowedStoreIds:['s'],resolveCustomer:async()=>id,...patch});
const a=mock();const result=await run(a.pool);assert.equal(result.status,'PERSISTED');assert.equal(a.calls[0].sql,'BEGIN');assert.equal(a.calls.at(-2).sql,'COMMIT');assert.equal(a.calls.at(-1).sql,'release');assert.ok(!JSON.stringify(result).includes('opaque'));
const b=mock({existing:true});await assert.rejects(()=>run(b.pool),/already persisted/);assert.equal(b.calls.at(-2).sql,'ROLLBACK');
const c=mock({failInsert:true});await assert.rejects(()=>run(c.pool),/write failed/);assert.equal(c.calls.at(-2).sql,'ROLLBACK');
const d=mock();await assert.rejects(()=>run(d.pool,{resolveCustomer:async()=>null}),/unresolved/);assert.ok(!d.calls.some(x=>x.sql.startsWith('INSERT')));
const e=mock();await assert.rejects(()=>run(e.pool,{allowedStoreIds:[]}),/Unauthorized/);assert.equal(e.calls.length,0);
console.log('CRM persistence contract passed (mock transaction client)');

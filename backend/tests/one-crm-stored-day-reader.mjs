import assert from 'node:assert/strict';
import {makeStoredDayReader} from '../services/one-crm-stored-day-reader.mjs';
const scope={tenantId:'demo',storeId:'s',date:'2026-11-20'};
const id='00000000-0000-4000-8000-000000000001';
function mock({missing=false,corrupt=false,quarantine=false,unsafe=false}={}){
 const calls=[],client={async query(sql,args){calls.push({sql,args});if(sql.startsWith('SELECT source_ref'))return {rowCount:missing?0:1,rows:[{source_ref:'lines',control_ref:'control',ticket_count:'2',positive_minor:'10000',refund_minor:'2500',net_minor:'7500',item_evidence_complete:true}]};
 if(sql.startsWith('SELECT t.ticket_id'))return {rows:[{ticket_id:'a',customer_token:id,customer_status:quarantine?'quarantined':'active',net_minor:unsafe?'9007199254740992':'10000'},{ticket_id:'b',customer_token:null,customer_status:null,net_minor:'-2500'}]};
 if(sql.startsWith('SELECT ticket_id'))return {rows:[{ticket_id:'a',line_id:'1',product_id:'P1',category:'A',net_minor:corrupt?'1':'10000'},{ticket_id:'b',line_id:'1',product_id:'P2',category:'B',net_minor:'-2500'}]};
 return {rowCount:0}},release(){calls.push({sql:'release'})}};
 return {calls,pool:{connect:async()=>client}};
}
const make=m=>makeStoredDayReader({pool:m.pool,tenantId:'demo',allowedStoreIds:['s']});
const m=mock(),read=make(m),ok=await read(scope);
assert.equal(ok.itemEvidenceComplete,true);assert.equal(ok.tickets[0].items[0].netMinor,10000);assert.equal(ok.tickets[1].netMinor,-2500);assert.equal(ok.tickets[1].customerToken,null);
assert.equal(m.calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(m.calls.at(-2).sql,'COMMIT');assert.equal(m.calls.at(-1).sql,'release');assert.deepEqual(m.calls[1].args,['demo','s','2026-11-20']);
await assert.rejects(()=>read({...scope,tenantId:'other'}),/Forbidden/);
await assert.rejects(()=>read({...scope,storeId:'other'}),/Forbidden/);
for(const [options,re] of [[{missing:true},/not found/],[{corrupt:true},/reconciliation/],[{quarantine:true},/Inactive/],[{unsafe:true},/Unsafe/]]){const x=mock(options);await assert.rejects(()=>make(x)(scope),re);assert.equal(x.calls.at(-2).sql,'ROLLBACK');assert.equal(x.calls.at(-1).sql,'release')}
console.log('CRM stored-day reader passed (mock transaction client)');

// Integration test against disposable PostgreSQL only. Never run on a business database.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {persistVerifiedStoreDay} from '../services/one-crm-persistence.mjs';
import {makeStoredDayReader} from '../services/one-crm-stored-day-reader.mjs';
import {readCrmAudience} from '../services/one-crm-readonly-adapter.mjs';
if(process.env.CRM_DISPOSABLE_DB!=='crm_test'||!process.env.CRM_PG_MODULE||!process.env.PGPORT)throw Error('Disposable database required');
const require=createRequire(import.meta.url),{Pool}=require(process.env.CRM_PG_MODULE);
const pool=new Pool({host:'127.0.0.1',port:Number(process.env.PGPORT),user:'postgres',password:'synthetic-ci-only',database:'crm_test',max:2});
const scope={tenantId:'roundtrip-demo',storeId:'store-demo',date:'2026-11-20'},customerId='00000000-0000-4000-8000-000000000011';
try{
 await pool.query('INSERT INTO one_crm.tenants(tenant_id,label,currency) VALUES ($1,$2,$3)',[scope.tenantId,'Synthetic roundtrip','MAD']);
 await pool.query('INSERT INTO one_crm.stores VALUES ($1,$2,$3)',[scope.tenantId,scope.storeId,'Synthetic store']);
 await pool.query('INSERT INTO one_crm.customers(tenant_id,customer_id) VALUES ($1,$2)',[scope.tenantId,customerId]);
 const meta={...scope,currency:'MAD',closed:true,basis:'signed-retail-net'};
 const ticket=(ticketId,netMinor,customerToken,productId,category)=>({...scope,ticketId,netMinor,customerToken,items:[{lineId:'1',productId,category,netMinor}]});
 const batch={...meta,source:'synthetic-lines',coverageComplete:true,rejectedIdentity:0,itemEvidenceComplete:true,tickets:[ticket('a',10000,'synthetic-token','P1','A'),ticket('b',-2500,'synthetic-token','P1','A'),ticket('c',5000,null,'P2','B')]};
 const control={...meta,source:'synthetic-control',tickets:3,positiveMinor:15000,refundMinor:2500,netMinor:12500};
 const input={pool,...scope,batch,control,allowedStoreIds:[scope.storeId],resolveCustomer:async()=>customerId};
 const written=await persistVerifiedStoreDay(input);assert.equal(written.status,'PERSISTED');
 const reader=makeStoredDayReader({pool,tenantId:scope.tenantId,allowedStoreIds:[scope.storeId]});
 const day=await reader(scope);assert.equal(day.itemEvidenceComplete,true);assert.equal(day.tickets.length,3);assert.equal(day.tickets[1].items[0].netMinor,-2500);
 const audience=await readCrmAudience({tenantId:scope.tenantId,storeIds:[scope.storeId],allowedStoreIds:[scope.storeId],windowStart:scope.date,asOf:scope.date,readVerifiedDay:reader,rules:{expression:{kind:'rule',field:'preferredCategories',op:'contains',value:'A'}}});
 assert.equal(audience.audienceCount,1);assert.equal(audience.audienceNetMinor,7500);assert.equal(audience.anonymousTickets,1);assert.equal(audience.activationEnabled,false);assert.ok(!JSON.stringify(audience).includes(customerId));
 await assert.rejects(()=>persistVerifiedStoreDay(input),/already persisted/);
 await assert.rejects(()=>reader({...scope,tenantId:'other'}),/Forbidden/);
 await pool.query('UPDATE one_crm.ticket_items SET net_minor=1 WHERE tenant_id=$1 AND ticket_id=$2',[scope.tenantId,'b']);
 await assert.rejects(()=>reader(scope),/reconciliation/);
 await pool.query('UPDATE one_crm.ticket_items SET net_minor=-2500 WHERE tenant_id=$1 AND ticket_id=$2',[scope.tenantId,'b']);
 await pool.query("UPDATE one_crm.customers SET status='quarantined' WHERE tenant_id=$1",[scope.tenantId]);
 await assert.rejects(()=>reader(scope),/Inactive/);
 const {createCrmArchive}=await import('../services/one-crm-purchase-archive.mjs');
 const sql=async(strings,...values)=>{const query=strings.reduce((s,v,i)=>s+(i?'$'+i:'')+v,'');assert.ok(!/\bCREATE\s+TABLE\b/i.test(query),'Runtime must not execute schema DDL');return (await pool.query(query,values)).rows};
 const archive=createCrmArchive(sql),evidence={status:'READY',source:'D365/RetailTransactionSalesTransBIEntities',storeId:'A',startDate:scope.date,endDate:scope.date,diagnostics:{truncated:false,filterCoverage:{parentTransaction:true},mappedFields:{customer:true}},customers:[{customerAccount:'CLT-1',sales:10,tickets:1,lastDate:scope.date}]};
 await archive.put('C1',evidence);assert.equal((await archive.read('C1',['A'],scope.date,scope.date))[0].detailed,false);await archive.put('C1',{...evidence,purchaseLines:[{account:'CLT-1',terminal:'T1',transaction:'TX1',product:'P1',positiveTtcMinor:1000}]});await archive.put('C1',evidence);assert.equal((await archive.read('C1',['A'],scope.date,scope.date))[0].detailed,true);assert.equal((await archive.read('C2',['A'],scope.date,scope.date)).length,0);await assert.rejects(()=>archive.put('C1',{...evidence,purchaseLines:[]}),/reconciliation/);const {readArchivedCustomerHistory}=await import('../services/one-crm-archived-history.mjs');const archivedInput={accountRef:'CLT-1',company:'C1',stores:[{id:'A'}],page:1,asOf:scope.date,readCustomerLines:archive.readCustomerLines};const history=await readArchivedCustomerHistory(archivedInput);assert.equal(history.totalTickets,1);assert.equal(history.positiveTtc,10);assert.equal(history.archiveCoverage.coveredStoreDays,1);assert.equal(history.archiveCoverage.complete,false);assert.equal(history.behavior,null);assert.equal(history.rows[0].items[0].productNumber,'P1');assert.ok(!JSON.stringify(history).includes('T1'));assert.equal((await readArchivedCustomerHistory({...archivedInput,accountRef:'CLT-2'})).totalTickets,0);assert.equal((await readArchivedCustomerHistory({...archivedInput,company:'C2'})).archiveCoverage.coveredStoreDays,0);
 console.log('CRM PostgreSQL import/read/segment roundtrip passed');
}finally{await pool.end()}

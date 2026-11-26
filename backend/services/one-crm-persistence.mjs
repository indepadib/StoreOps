// Internal persistence contract. Requires a dedicated CRM database and a trusted,
// separately authorized transaction client. Never expose this as an HTTP endpoint.
import {reconcileStoreDay} from './one-crm-reconciliation.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function persistVerifiedStoreDay({pool,tenantId,storeId,date,batch,control,allowedStoreIds,resolveCustomer}){
 if(!Array.isArray(allowedStoreIds)||!allowedStoreIds.includes(storeId)||typeof resolveCustomer!=='function'||typeof pool?.connect!=='function')throw Error('Unauthorized persistence scope');
 const {report,verifiedDay}=reconcileStoreDay({tenantId,storeId,date,batch,control});
 if(!verifiedDay)throw Error('Reconciliation blocked');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  // Serializes writers per store; cannot race another ingestion using this contract.
  const lock=await client.query('SELECT store_id FROM one_crm.stores WHERE tenant_id=$1 AND store_id=$2 FOR UPDATE',[tenantId,storeId]);
  if(lock.rowCount!==1)throw Error('Store not registered');
  const existing=await client.query('SELECT 1 FROM one_crm.verified_days WHERE tenant_id=$1 AND store_id=$2 AND business_day=$3',[tenantId,storeId,date]);
  // Fail closed: a replay or correction requires a separate audited workflow.
  if(existing.rowCount)throw Error('Store-day already persisted; correction required');
  const mapping=new Map(),rows=[];
  for(const t of verifiedDay.tickets){
   let customerId=null;
   if(t.customerToken){
    if(!mapping.has(t.customerToken)){
     const id=await resolveCustomer({tenantId,customerToken:t.customerToken,client});
     if(!uuid(id))throw Error('Customer identity unresolved');
     const resolved=await client.query("SELECT customer_id FROM one_crm.customers WHERE tenant_id=$1 AND customer_id=$2 AND status='active' FOR SHARE",[tenantId,id]);
     if(resolved.rowCount!==1)throw Error('Customer outside active tenant scope');
     mapping.set(t.customerToken,id);
    }
    customerId=mapping.get(t.customerToken);
   }
   rows.push({ticketId:t.ticketId,netMinor:t.netMinor,customerId});
  }
  const m=report.metrics;
  await client.query('INSERT INTO one_crm.verified_days(tenant_id,store_id,business_day,source_ref,control_ref,verified_at,ticket_count,positive_minor,refund_minor,net_minor) VALUES ($1,$2,$3,$4,$5,now(),$6,$7,$8,$9)',[tenantId,storeId,date,batch.source,control.source,m.tickets,m.positiveMinor,m.refundMinor,m.netMinor]);
  for(let i=0;i<rows.length;i+=500){
   const part=rows.slice(i,i+500);
   await client.query('INSERT INTO one_crm.tickets(tenant_id,store_id,business_day,ticket_id,customer_id,net_minor) SELECT $1,$2,$3,x.ticket_id,x.customer_id,x.net_minor FROM unnest($4::text[],$5::uuid[],$6::bigint[]) AS x(ticket_id,customer_id,net_minor)',[tenantId,storeId,date,part.map(r=>r.ticketId),part.map(r=>r.customerId),part.map(r=>r.netMinor)]);
  }
  await client.query('COMMIT');
  return {status:'PERSISTED',tenantId,storeId,date,metrics:m,activationEnabled:false};
 }catch(error){try{await client.query('ROLLBACK')}catch{}throw error}finally{client.release()}
}

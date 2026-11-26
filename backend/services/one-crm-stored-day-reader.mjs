// Internal reader for the isolated CDP. Authorization must be derived on the server.
// Read and re-reconcile the persisted day in a consistent database snapshot.
import {reconcileStoreDay} from './one-crm-reconciliation.mjs';
const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().slice(0,10)===s;
const integer=v=>{if(typeof v!=='number'&&!(typeof v==='string'&&/^-?\d+$/.test(v)))throw Error('Invalid stored integer');const n=Number(v);if(!Number.isSafeInteger(n))throw Error('Unsafe stored integer');return n};
export function makeStoredDayReader({pool,tenantId,allowedStoreIds}){
 if(typeof pool?.connect!=='function'||typeof tenantId!=='string'||!tenantId.trim()||!Array.isArray(allowedStoreIds)||allowedStoreIds.some(s=>typeof s!=='string'||!s.trim()))throw Error('Invalid reader scope');
 const stores=new Set(allowedStoreIds);
 return async scope=>{
  if(scope?.tenantId!==tenantId||!stores.has(scope.storeId)||!day(scope.date))throw Error('Forbidden store-day scope');
  const args=[tenantId,scope.storeId,scope.date],client=await pool.connect();
  try{
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const d=await client.query('SELECT source_ref,control_ref,ticket_count,positive_minor,refund_minor,net_minor,item_evidence_complete FROM one_crm.verified_days WHERE tenant_id=$1 AND store_id=$2 AND business_day=$3',args);
   if(d.rowCount!==1)throw Error('Verified day not found');
   const row=d.rows[0];
   const t=await client.query('SELECT t.ticket_id,t.customer_id::text AS customer_token,t.net_minor,c.status AS customer_status FROM one_crm.tickets t LEFT JOIN one_crm.customers c ON c.tenant_id=t.tenant_id AND c.customer_id=t.customer_id WHERE t.tenant_id=$1 AND t.store_id=$2 AND t.business_day=$3 ORDER BY t.ticket_id',args);
   const tickets=t.rows.map(x=>{
    if(x.customer_token!==null&&x.customer_status!=='active')throw Error('Inactive or unresolved customer in stored day');
    return {...scope,ticketId:x.ticket_id,customerToken:x.customer_token,netMinor:integer(x.net_minor),...(row.item_evidence_complete===true?{items:[]}:{})};
   });
   if(row.item_evidence_complete===true){
    const byTicket=new Map(tickets.map(t=>[t.ticketId,t]));
    const lines=await client.query('SELECT ticket_id,line_id,product_id,category,net_minor FROM one_crm.ticket_items WHERE tenant_id=$1 AND store_id=$2 AND business_day=$3 ORDER BY ticket_id,line_id',args);
    for(const x of lines.rows){
     const ticket=byTicket.get(x.ticket_id);if(!ticket)throw Error('Orphan stored item');
     ticket.items.push({lineId:x.line_id,productId:x.product_id,category:x.category,netMinor:integer(x.net_minor)});
    }
   }
   const meta={...scope,currency:'MAD',closed:true,basis:'signed-retail-net'};
   const {verifiedDay}=reconcileStoreDay({...scope,batch:{...meta,source:row.source_ref,coverageComplete:true,rejectedIdentity:0,itemEvidenceComplete:row.item_evidence_complete===true,tickets},control:{...meta,source:row.control_ref,tickets:integer(row.ticket_count),positiveMinor:integer(row.positive_minor),refundMinor:integer(row.refund_minor),netMinor:integer(row.net_minor)}});
   if(!verifiedDay)throw Error('Stored day reconciliation blocked');
   await client.query('COMMIT');
   return verifiedDay;
  }catch(error){try{await client.query('ROLLBACK')}catch{}throw error}finally{client.release()}
 };
}

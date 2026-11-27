// Aggregate observed purchases and identity coverage. No contact/outcome claims.
const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
const safe=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=160&&!/[\x00-\x1f]/.test(v);
export async function readMarketingInsights(sql,{company,stores,start,end}){
 if(!safe(company)||!Array.isArray(stores)||!stores.length||stores.length>100||!stores.every(safe)||new Set(stores).size!==stores.length||!validDay(start)||!validDay(end)||start>end||Date.parse(end)-Date.parse(start)>89*86400000)throw Error('Invalid scope');
 const expected=stores.length*(1+Math.round((Date.parse(end)-Date.parse(start))/86400000));
 const rows=await sql`WITH days AS (
  SELECT store_id,business_day,evidence FROM crm_purchase_day_archive WHERE company=${company} AND store_id IN(SELECT jsonb_array_elements_text(${JSON.stringify(stores)}::jsonb)) AND business_day BETWEEN ${start}::date AND ${end}::date AND purchase_lines IS NOT NULL
 ), visits AS (
  SELECT d.store_id,d.business_day,c->>'customerAccount' AS account,(c->>'tickets')::int AS tickets,(c->>'sales')::numeric AS sales FROM days d CROSS JOIN LATERAL jsonb_array_elements(d.evidence->'customers') a(c)
 ), day_stats AS (
  SELECT d.store_id,d.business_day,COALESCE(SUM(v.tickets),0) AS tickets,COALESCE(SUM(v.sales),0) AS sales FROM days d LEFT JOIN visits v USING(store_id,business_day) GROUP BY d.store_id,d.business_day
 ), week AS (
  SELECT EXTRACT(ISODOW FROM business_day)::int AS weekday,COUNT(*)::int AS store_days,SUM(tickets)::float8 AS tickets,SUM(sales)::float8 AS sales FROM day_stats GROUP BY 1
 ), master AS (
  SELECT accounts,checked_at FROM crm_customer_master_snapshot WHERE company=${company} AND checked_at>NOW()-INTERVAL '30 minutes'
 ), identities AS (
  SELECT COUNT(*)::int AS named,COUNT(*) FILTER(WHERE i.identity->>'phoneStatus'='READY')::int AS phone_ready FROM master m CROSS JOIN LATERAL jsonb_array_elements(m.accounts) a(v) JOIN crm_customer_identity_snapshot i ON i.company=${company} AND i.account_ref=a.v->>'accountRef' AND i.checked_at>NOW()-INTERVAL '24 hours' AND i.identity->>'status'='READY'
 )
 SELECT (SELECT COUNT(*)::int FROM days) AS covered,(SELECT COUNT(DISTINCT account)::int FROM visits) AS buyers,(SELECT COALESCE(SUM(tickets),0)::float8 FROM visits) AS tickets,(SELECT COALESCE(SUM(sales),0)::float8 FROM visits) AS sales,(SELECT jsonb_array_length(accounts) FROM master) AS total,(SELECT checked_at::text FROM master) AS master_at,(SELECT named FROM identities) AS named,(SELECT phone_ready FROM identities) AS phone_ready,COALESCE((SELECT jsonb_agg(w ORDER BY weekday) FROM week w),'[]'::jsonb) AS weekdays`;
 const r=rows[0];if(!r||!Number.isSafeInteger(r.covered)||r.covered<0||r.covered>expected||!Array.isArray(r.weekdays)||![r.buyers,r.tickets,r.sales].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0))throw Error('Invalid evidence');
 const complete=r.covered===expected,masterReady=Number.isSafeInteger(r.total)&&r.total>=0;
 return {status:complete?'READY':'PARTIAL',start,end,storeIds:stores,currency:'MAD',coverage:{covered:r.covered,expected},observed:{buyers:r.covered?r.buyers:null,tickets:r.covered?r.tickets:null,positiveTtc:r.covered?r.sales:null,averageBasket:r.tickets?Math.round(r.sales/r.tickets*100)/100:null},identity:{total:masterReady?r.total:null,named:masterReady?r.named:null,phoneReady:masterReady?r.phone_ready:null,checkedAt:masterReady?r.master_at:null},weekdays:r.weekdays.map(w=>({weekday:w.weekday,storeDays:w.store_days,tickets:w.tickets,positiveTtc:w.sales,ticketsPerStoreDay:Math.round(w.tickets/w.store_days*100)/100})),basis:'OBSERVED_POSITIVE_IDENTIFIED_PURCHASES_EXCLUDES_RETURNS',contactHistory:{status:'NOT_CONNECTED',recommendation:null},activationEnabled:false};
}

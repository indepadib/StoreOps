// Multi-day receipt explorer. Identified positive purchase lines only; not fiscal receipts.
const safe=v=>typeof v==='string'&&v.length>0&&v.length<=160&&v.trim()===v&&!/[\x00-\x1f]/.test(v);
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString().slice(0,10)===v;
export async function readTicketExplorer(sql,{company,stores,start,end,store=null,search='',page=1}){
 if(!safe(company)||!Array.isArray(stores)||!stores.length||!stores.every(safe)||new Set(stores).size!==stores.length||!day(start)||!day(end)||start>end||Date.parse(end)-Date.parse(start)>89*86400000||store!==null&&!stores.includes(store)||search!==''&&!safe(search)||!Number.isSafeInteger(page)||page<1||page>5000)throw Error('Invalid explorer scope');
 const ids=store?[store]:stores,expected=ids.length*(1+Math.round((Date.parse(end)-Date.parse(start))/86400000)),scope=JSON.stringify(ids);
 const result=await sql`WITH days AS MATERIALIZED (
  SELECT store_id,business_day,purchase_lines FROM crm_purchase_day_archive WHERE company=${company} AND store_id IN(SELECT jsonb_array_elements_text(${scope}::jsonb)) AND business_day BETWEEN ${start}::date AND ${end}::date AND purchase_lines IS NOT NULL
 ), lines AS MATERIALIZED (
  SELECT store_id,business_day,l->>'terminal' AS terminal,l->>'transaction' AS tx,l->>'account' AS account,l->>'product' AS product,l->>'productName' AS name,l->>'unit' AS unit,(l->>'quantity')::numeric AS qty,(l->>'positiveTtcMinor')::bigint AS minor FROM days CROSS JOIN LATERAL jsonb_array_elements(purchase_lines) a(l)
 ), tickets AS (
  SELECT store_id,business_day,terminal,tx,account,SUM(minor)::bigint AS total,COUNT(*)::int AS line_count,COUNT(DISTINCT product)::int AS products FROM lines GROUP BY store_id,business_day,terminal,tx,account HAVING ${search}='' OR bool_or(strpos(lower(product),lower(${search}))>0 OR strpos(lower(COALESCE(name,'')),lower(${search}))>0 OR strpos(lower(tx),lower(${search}))>0 OR lower(account)=lower(${search}))
 ), selected AS (
  SELECT * FROM tickets ORDER BY business_day DESC,store_id,tx,terminal,account OFFSET ${(page-1)*25} LIMIT 25
 ), items AS (
  SELECT s.store_id,s.business_day,s.terminal,s.tx,s.account,jsonb_agg(jsonb_build_object('product',l.product,'name',l.name,'unit',l.unit,'quantity',l.qty,'positiveTtc',l.minor/100.0) ORDER BY l.product,l.unit,l.minor) AS items FROM selected s JOIN lines l USING(store_id,business_day,terminal,tx,account) GROUP BY s.store_id,s.business_day,s.terminal,s.tx,s.account
 ), projected AS (
  SELECT s.store_id AS "storeId",s.business_day::text AS date,s.tx AS "transactionRef",s.account AS "accountRef",CASE WHEN m.company IS NOT NULL AND i.identity->>'status'='READY' THEN i.identity->>'displayName' END AS "displayName",s.total/100.0 AS "positiveTtc",s.products,s.line_count AS "lineCount",CASE WHEN s.line_count<=500 THEN t.items ELSE NULL END AS items,s.terminal FROM selected s JOIN items t USING(store_id,business_day,terminal,tx,account) LEFT JOIN crm_customer_identity_snapshot i ON i.company=${company} AND i.account_ref=s.account AND i.checked_at>NOW()-INTERVAL '24 hours' LEFT JOIN crm_customer_master_snapshot m ON m.company=${company} AND m.checked_at>NOW()-INTERVAL '30 minutes' AND m.accounts @> jsonb_build_array(jsonb_build_object('accountRef',s.account))
 )
 SELECT (SELECT COUNT(*)::int FROM days) AS covered,(SELECT COUNT(*)::int FROM tickets) AS total,(SELECT COALESCE(SUM(total),0)::float8/100 FROM tickets) AS amount,COALESCE((SELECT jsonb_agg(to_jsonb(p)-'terminal' ORDER BY date DESC,"storeId","transactionRef",terminal,"accountRef") FROM projected p),'[]'::jsonb) AS rows`;
 const r=result[0];if(!r||!Number.isSafeInteger(r.covered)||r.covered<0||r.covered>expected||!Number.isSafeInteger(r.total)||r.total<0||!Number.isFinite(r.amount)||r.amount<0||!Array.isArray(r.rows)||r.rows.length>25)throw Error('Invalid explorer evidence');
 return {status:r.covered===expected?'READY':'PARTIAL',start,end,storeIds:ids,coverage:{covered:r.covered,expected},totalTickets:r.total,positiveTtc:r.amount,page,pageSize:25,rows:r.rows,activationEnabled:false,basis:'ARCHIVED_POSITIVE_IDENTIFIED_PURCHASES_EXCLUDES_RETURNS'};
}

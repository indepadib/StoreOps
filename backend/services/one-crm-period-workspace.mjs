// Read-only analysis of verified archive partitions. No activation or simulated clients.
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(Date.parse(x)).toISOString().slice(0,10)===x;
const safe=x=>typeof x==='string'&&x.length>0&&x.length<=160&&!/[\x00-\x1f]/.test(x);
const modes=new Set(['transactions','loyalty','churn','purchase','basket','agent']);
export async function readCrmPeriodWorkspace(sql,{company,stores,start,end,mode,page=1}){
 if(!safe(company)||!Array.isArray(stores)||!stores.length||!stores.every(safe)||new Set(stores).size!==stores.length||!day(start)||!day(end)||start>end||Date.parse(end)-Date.parse(start)>89*86400000||!modes.has(mode)||!Number.isSafeInteger(page)||page<1||page>1000)throw Error('Invalid period scope');
 const expected=stores.length*(1+Math.round((Date.parse(end)-Date.parse(start))/86400000)),scope=JSON.stringify(stores);
 const coverageRows=await sql`SELECT COUNT(*)::int AS covered FROM crm_purchase_day_archive WHERE company=${company} AND store_id IN (SELECT jsonb_array_elements_text(${scope}::jsonb)) AND business_day BETWEEN ${start}::date AND ${end}::date AND purchase_lines IS NOT NULL`;
 const covered=coverageRows[0]?.covered;if(!Number.isSafeInteger(covered)||covered<0||covered>expected)throw Error('Invalid coverage');
 const base={status:covered===expected?'READY':'PARTIAL',mode,start,end,storeIds:stores,coverage:{covered,expected},currency:'MAD',activationEnabled:false,basis:'ARCHIVED_POSITIVE_IDENTIFIED_PURCHASES_EXCLUDES_RETURNS'};
 if(mode==='transactions'){
  const rows=await sql`SELECT business_day::text AS day,store_id,COALESCE((SELECT SUM((v->>'tickets')::int) FROM jsonb_array_elements(evidence->'customers') a(v)),0)::int AS tickets,COALESCE((SELECT SUM((v->>'sales')::numeric) FROM jsonb_array_elements(evidence->'customers') a(v)),0)::float8 AS amount,jsonb_array_length(evidence->'customers') AS accounts FROM crm_purchase_day_archive WHERE company=${company} AND store_id IN (SELECT jsonb_array_elements_text(${scope}::jsonb)) AND business_day BETWEEN ${start}::date AND ${end}::date AND purchase_lines IS NOT NULL ORDER BY business_day DESC,store_id`;
  return {...base,rows};
 }
 if(mode==='loyalty'){
  const earn=await sql`SELECT COUNT(*)::int AS covered,COALESCE(SUM((SELECT SUM((v->>'earn')::numeric) FROM jsonb_array_elements(accounts) a(v))),0)::float8 AS amount FROM crm_loyalty_earn_day WHERE company=${company} AND store_id IN (SELECT jsonb_array_elements_text(${scope}::jsonb)) AND business_day BETWEEN ${start}::date AND ${end}::date`;
  const burn=await sql`SELECT COUNT(*)::int AS covered,COALESCE(SUM((SELECT SUM((v->>'positive')::int) FROM jsonb_array_elements(b.accounts) a(v))),0)::int AS positive,COALESCE(SUM((SELECT SUM((v->>'negative')::int) FROM jsonb_array_elements(b.accounts) a(v))),0)::int AS negative,COALESCE(SUM((SELECT SUM((v->>'netMinor')::numeric) FROM jsonb_array_elements(b.accounts) a(v))),0)::float8 AS net FROM crm_wallet_burn_day b JOIN crm_purchase_day_archive p ON p.company=b.company AND p.store_id=b.store_id AND p.business_day=b.business_day AND p.captured_at=b.purchase_captured_at WHERE b.company=${company} AND b.store_id IN (SELECT jsonb_array_elements_text(${scope}::jsonb)) AND b.business_day BETWEEN ${start}::date AND ${end}::date`;
  const e=earn[0],b=burn[0];return {...base,status:e.covered===expected&&b.covered===expected&&!(b.positive&&b.negative)?'READY':'PARTIAL',earn:{covered:e.covered,expected,amount:e.covered===expected?e.amount:null},burn:{covered:b.covered,expected,amount:b.covered===expected&&!(b.positive&&b.negative)?Math.abs(b.net)/100:null,signConflict:!!(b.positive&&b.negative)},balance:null,rows:[]};
 }
 if(covered!==expected)return {...base,rows:[],reason:'INCOMPLETE_ARCHIVE'};
 if(mode==='basket'){
  // Bound pair analysis; never publish small customer cohorts.
  if(Date.parse(end)-Date.parse(start)>30*86400000)return {...base,status:'UNAVAILABLE',rows:[],reason:'BASKET_MAX_31_DAYS'};
  const rows=await sql`WITH lines AS (
   SELECT p.store_id,p.business_day,l->>'terminal' AS terminal,l->>'transaction' AS tx,l->>'account' AS account,l->>'product' AS product FROM crm_purchase_day_archive p CROSS JOIN LATERAL jsonb_array_elements(p.purchase_lines) a(l) WHERE p.company=${company} AND p.store_id IN (SELECT jsonb_array_elements_text(${scope}::jsonb)) AND p.business_day BETWEEN ${start}::date AND ${end}::date AND p.purchase_lines IS NOT NULL
  ), items AS (SELECT DISTINCT store_id,business_day,terminal,tx,account,product FROM lines), pairs AS (
   SELECT a.product AS "productA",b.product AS "productB",COUNT(*)::int AS together,COUNT(DISTINCT a.account)::int AS customers FROM items a JOIN items b ON a.store_id=b.store_id AND a.business_day=b.business_day AND a.terminal=b.terminal AND a.tx=b.tx AND a.account=b.account AND a.product<b.product GROUP BY a.product,b.product HAVING COUNT(DISTINCT a.account)>=10
  ) SELECT * FROM pairs ORDER BY together DESC,"productA","productB" LIMIT 30`;
  return {...base,rows};
 }
 // Empirical cadence, not a trained propensity model. At least three distinct purchase days.
 const rows=await sql`WITH visits AS (
 SELECT c->>'customerAccount' AS account,business_day,SUM((c->>'sales')::numeric) AS sales FROM crm_purchase_day_archive p CROSS JOIN LATERAL jsonb_array_elements(p.evidence->'customers') a(c) WHERE p.company=${company} AND p.store_id IN (SELECT jsonb_array_elements_text(${scope}::jsonb)) AND p.business_day BETWEEN ${start}::date AND ${end}::date AND p.purchase_lines IS NOT NULL GROUP BY c->>'customerAccount',business_day
 ), cadence AS (
 SELECT account,COUNT(*)::int AS visits,MAX(business_day) AS last_day,SUM(sales)::float8 AS amount,((MAX(business_day)-MIN(business_day))::numeric/(COUNT(*)-1)) AS interval FROM visits GROUP BY account HAVING COUNT(*)>=3
 ), scored AS (
 SELECT account,visits,last_day,amount,ROUND(interval,1)::float8 AS cadence,(${end}::date-last_day)::int AS recency,(last_day+GREATEST(1,ROUND(interval)::int))::text AS next_day,ROUND((${end}::date-last_day)/GREATEST(1,interval),2)::float8 AS delay_ratio FROM cadence
 ) SELECT s.account AS "accountRef",s.visits,s.last_day::text AS "lastPurchase",s.amount,s.cadence,s.recency,s.next_day AS "nextPurchase",s.delay_ratio AS "delayRatio",i.identity->>'displayName' AS "displayName" FROM scored s LEFT JOIN crm_customer_identity_snapshot i ON i.company=${company} AND i.account_ref=s.account AND i.checked_at>NOW()-INTERVAL '24 hours' JOIN crm_customer_master_snapshot m ON m.company=${company} AND m.checked_at>NOW()-INTERVAL '30 minutes' AND m.accounts @> jsonb_build_array(jsonb_build_object('accountRef',s.account)) WHERE (${mode}::text='purchase' OR s.delay_ratio>=1.5) ORDER BY CASE WHEN ${mode}::text='purchase' THEN s.next_day END ASC,s.delay_ratio DESC,s.account OFFSET ${(page-1)*50} LIMIT 51`;
 return {...base,basis:'OBSERVED_PURCHASE_DAY_CADENCE_NOT_VALIDATED_PREDICTION',page,hasMore:rows.length>50,rows:rows.slice(0,50)};
}

import {isLoyaltyCustomerAccount} from './one-crm-customer-source.mjs';
import {normalizeCustomerPhone} from './one-crm-customer-identity-source.mjs';
const source='D365/CustomersV3',scope='LEGAL_ENTITY_RETAIL';
const safe=(v,n=160)=>typeof v==='string'&&v.length>0&&v.length<=n&&!/[\x00-\x1f\x7f]/.test(v);
const account=v=>safe(v)&&isLoyaltyCustomerAccount(v)&&v===v.trim();
const base={source,scope,activationEnabled:false};
function project(r){if(!r||!account(r.accountRef)||r.status!=='READY'||!safe(r.displayName,320)||!['PERSON','ORGANIZATION'].includes(r.partyType)||!['READY','MISSING','FORMAT_UNVERIFIED','UNAVAILABLE'].includes(r.phoneStatus)||!(r.phone==null||safe(r.phone,80)))return null;
 const phone=r.phone??null,phoneNormalized=normalizeCustomerPhone(phone);if((r.phoneNormalized??null)!==phoneNormalized||r.phoneStatus==='READY'&&!phoneNormalized)return null;
 return {accountRef:r.accountRef,displayName:r.displayName,partyType:r.partyType,phone,phoneNormalized,phoneStatus:r.phoneStatus,status:'READY'};}
export function createCrmIdentityStore(sql){
 async function put(company,rows,checkedAt=new Date().toISOString()){
  if(!safe(company)||!Array.isArray(rows)||rows.length>100||!Number.isFinite(Date.parse(checkedAt)))throw Error('Invalid identity batch');
  const verified=rows.map(project).filter(Boolean);if(new Set(verified.map(r=>r.accountRef)).size!==verified.length)throw Error('Duplicate identity');
  if(!verified.length)return 0;
  const written=await sql`INSERT INTO crm_customer_identity_snapshot(company,account_ref,identity,checked_at)
   SELECT ${company},v->>'accountRef',v,${checkedAt}::timestamptz FROM jsonb_array_elements(${JSON.stringify(verified)}::jsonb) AS a(v)
   WHERE EXISTS(SELECT 1 FROM crm_customer_master_snapshot m WHERE m.company=${company} AND m.checked_at>NOW()-INTERVAL '8 days' AND m.accounts @> jsonb_build_array(jsonb_build_object('accountRef',v->>'accountRef')))
   ON CONFLICT(company,account_ref) DO UPDATE SET identity=EXCLUDED.identity,checked_at=EXCLUDED.checked_at WHERE crm_customer_identity_snapshot.checked_at<=EXCLUDED.checked_at RETURNING account_ref`;
  return written.length;
 }
 async function pending(company,limit=100,{includeCooling=false}={}){
  if(!safe(company)||!Number.isSafeInteger(limit)||limit<1||limit>100||typeof includeCooling!=='boolean')throw Error('Invalid sync scope');
  const rows=await sql`SELECT a.v->>'accountRef' AS account_ref FROM crm_customer_master_snapshot m CROSS JOIN LATERAL jsonb_array_elements(m.accounts) AS a(v)
  LEFT JOIN crm_customer_identity_snapshot i ON i.company=m.company AND i.account_ref=a.v->>'accountRef'
  WHERE m.company=${company} AND m.checked_at>NOW()-INTERVAL '8 days' AND (i.checked_at IS NULL OR i.checked_at<=NOW()-INTERVAL '24 hours')
  AND (${includeCooling}::boolean OR NOT EXISTS (SELECT 1 FROM retail_intelligence_cache retry WHERE retry.cache_key=concat('["crm-identity-retry",',to_json(m.company)::text,',',to_json(a.v->>'accountRef')::text,']') AND retry.expires_at>NOW()))
  ORDER BY i.checked_at NULLS FIRST,a.v->>'accountRef' LIMIT ${limit}`;
  return rows.map(r=>r.account_ref).filter(account);
 }
 async function names(company,accounts){
  if(!safe(company)||!Array.isArray(accounts)||accounts.length>50||!accounts.every(account)||new Set(accounts).size!==accounts.length)throw Error('Invalid identity scope');
  const rows=await sql`SELECT i.identity FROM crm_customer_identity_snapshot i JOIN crm_customer_master_snapshot m ON m.company=i.company AND m.checked_at>NOW()-INTERVAL '8 days' AND m.accounts @> jsonb_build_array(jsonb_build_object('accountRef',i.account_ref))
   WHERE i.company=${company} AND i.checked_at>NOW()-INTERVAL '24 hours' AND i.account_ref IN (SELECT jsonb_array_elements_text(${JSON.stringify(accounts)}::jsonb))`;
  const found=new Map();for(const r of rows){const v=project(r.identity);if(!v||!accounts.includes(v.accountRef)||found.has(v.accountRef))throw Error('Invalid stored identity');found.set(v.accountRef,v)}
  return found;
 }

 // Only serve an authoritative local search when the entire fresh master is
 // covered by fresh, relevant identity evidence. Otherwise keep the ERP fallback.
 async function search(company,{query,by,page=1}={}){
  if(!safe(company)||!safe(query,100)||!['name','phone'].includes(by)||!Number.isSafeInteger(page)||page<1||page>1000)return null;
  const q=query.trim(),terms=q.split(/\s+/),digits=q.replace(/\D/g,'');
  if(/[\*?]/.test(q)||(by==='name'&&(q.length<3||terms.length>5))||(by==='phone'&&(!/^[+0-9 ()-]+$/.test(q)||digits.length<5)))return null;
  const normalized=by==='phone'?normalizeCustomerPhone(q):null;
  const rows=await sql`WITH master AS (
   SELECT company,accounts,checked_at FROM crm_customer_master_snapshot WHERE company=${company} AND checked_at>NOW()-INTERVAL '8 days'
  ), eligible AS (
   SELECT a.v->>'accountRef' AS account_ref,i.identity
   FROM master m CROSS JOIN LATERAL jsonb_array_elements(m.accounts) AS a(v)
   LEFT JOIN crm_customer_identity_snapshot i ON i.company=m.company AND i.account_ref=a.v->>'accountRef' AND i.checked_at>NOW()-INTERVAL '24 hours'
  ), coverage AS (
   SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE identity IS NOT NULL AND identity->>'status'='READY' AND (${by}::text='name' OR identity->>'phoneStatus' IN ('READY','MISSING','FORMAT_UNVERIFIED')))::int AS covered FROM eligible
  ), matches AS (
   SELECT account_ref,identity FROM eligible WHERE
   CASE WHEN ${by}::text='name' THEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(${JSON.stringify(terms)}::jsonb) AS t(v) WHERE strpos(lower(COALESCE(identity->>'displayName','')),lower(t.v))=0)
   ELSE strpos(COALESCE(identity->>'phone',''),${q})>0 OR (${normalized}::text IS NOT NULL AND identity->>'phoneNormalized'=${normalized}::text) END
   ORDER BY account_ref COLLATE "C" OFFSET ${(page-1)*50} LIMIT 51
  )
  SELECT m.checked_at::text AS checked_at,c.total,c.covered,COALESCE((SELECT jsonb_agg(identity ORDER BY account_ref COLLATE "C") FROM matches),'[]'::jsonb) AS matches FROM master m CROSS JOIN coverage c`;
  const r=rows?.[0];if(!r||!Number.isSafeInteger(r.total)||r.total!==r.covered||!Array.isArray(r.matches)||r.matches.length>51)return null;
  const matches=r.matches.map(project);if(matches.some(v=>!v)||new Set(matches.map(v=>v.accountRef)).size!==matches.length)return null;
  return {...base,status:'READY',storage:'POSTGRES_IDENTITY',checkedAt:new Date(r.checked_at).toISOString(),by,page,pageSize:50,hasMore:matches.length>50,rows:matches.slice(0,50).map(({accountRef,displayName,partyType})=>({accountRef,displayName,partyType}))};
 }
 return {put,pending,names,search};
}

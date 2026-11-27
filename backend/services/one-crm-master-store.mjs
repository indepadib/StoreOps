import {isLoyaltyCustomerAccount} from './one-crm-customer-source.mjs';
const SOURCE='D365/CustTableCDREntities',scope='LEGAL_ENTITY_RETAIL';
const validCompany=v=>typeof v==='string'&&v.length>0&&v.length<=160;
const validRow=r=>r&&typeof r.accountRef==='string'&&r.accountRef===r.accountRef.trim()&&r.accountRef.length<=160&&isLoyaltyCustomerAccount(r.accountRef)&&!/[\x00-\x1f]/.test(r.accountRef)&&(r.createdAt===null||typeof r.createdAt==='string'&&Number.isFinite(Date.parse(r.createdAt)));
const fresh=v=>Number.isFinite(Date.parse(v))&&Date.now()-Date.parse(v)<1800000&&Date.parse(v)<=Date.now()+60000;
const base=checkedAt=>({status:'READY',source:SOURCE,scope,checkedAt,storage:'POSTGRES_MASTER',identityBasis:'D365_LEGAL_ENTITY_ACCOUNT',historyStatus:'NOT_CONNECTED',activationEnabled:false});
export function createCrmMasterStore(sql){
 async function put(company,master){
  if(!validCompany(company)||master?.source!==SOURCE||master.scope!==scope||!fresh(master.checkedAt)||!Array.isArray(master.rows)||master.rows.length>=100000||!master.rows.every(validRow)||new Set(master.rows.map(r=>r.accountRef)).size!==master.rows.length)throw Error('Invalid complete master');
  const rows=master.rows.map(({accountRef,createdAt})=>({accountRef,createdAt})).sort((a,b)=>a.accountRef<b.accountRef?-1:a.accountRef>b.accountRef?1:0);
  await sql`INSERT INTO crm_customer_master_snapshot(company,checked_at,accounts) VALUES(${company},${master.checkedAt}::timestamptz,${JSON.stringify(rows)}::jsonb) ON CONFLICT(company) DO UPDATE SET checked_at=EXCLUDED.checked_at,accounts=EXCLUDED.accounts WHERE crm_customer_master_snapshot.checked_at<=EXCLUDED.checked_at`;
 }
 async function read(company){if(!validCompany(company))throw Error('Invalid company');const rows=await sql`SELECT checked_at::text AS checked_at,accounts FROM crm_customer_master_snapshot WHERE company=${company} AND checked_at>NOW()-INTERVAL '30 minutes' LIMIT 1`;const r=rows?.[0];if(!r||!fresh(r.checked_at))return null;if(!Array.isArray(r.accounts)||!r.accounts.every(validRow)||new Set(r.accounts.map(x=>x.accountRef)).size!==r.accounts.length)throw Error('Invalid stored master');return {source:SOURCE,scope,checkedAt:new Date(r.checked_at).toISOString(),rows:r.accounts};}
 async function page(company,page,search=''){
  if(!validCompany(company)||!Number.isSafeInteger(page)||page<1||page>99999||typeof search!=='string'||search.length>160)throw Error('Invalid directory request');
  const rows=await sql`SELECT checked_at::text AS checked_at,COALESCE((SELECT jsonb_agg(v ORDER BY ord) FROM (SELECT v,ord FROM jsonb_array_elements(accounts) WITH ORDINALITY AS a(v,ord) WHERE strpos(lower(v->>'accountRef'),lower(${search}))>0 OR ${search}='' ORDER BY ord OFFSET ${(page-1)*50} LIMIT 51) AS matched),'[]'::jsonb) AS rows FROM crm_customer_master_snapshot WHERE company=${company} AND checked_at>NOW()-INTERVAL '30 minutes' LIMIT 1`;
  const r=rows?.[0];if(!r||!fresh(r.checked_at))return null;if(!Array.isArray(r.rows)||r.rows.length>51||!r.rows.every(validRow))throw Error('Invalid stored page');
  return {...base(new Date(r.checked_at).toISOString()),page,pageSize:50,search,totalAccounts:null,matchedAccounts:null,hasMore:r.rows.length>50,rows:r.rows.slice(0,50)};
 }
 async function count(company){if(!validCompany(company))throw Error('Invalid company');const rows=await sql`SELECT checked_at::text AS checked_at,jsonb_array_length(accounts) AS total FROM crm_customer_master_snapshot WHERE company=${company} AND checked_at>NOW()-INTERVAL '30 minutes' LIMIT 1`;const r=rows?.[0];if(!r||!fresh(r.checked_at))return null;if(!Number.isSafeInteger(r.total)||r.total<0)throw Error('Invalid stored count');return {...base(new Date(r.checked_at).toISOString()),totalAccounts:r.total};}
 return {put,read,page,count};
}

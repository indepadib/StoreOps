const memory=new Map();
let databasePromise=null;
async function getAnalyticsDatabase(){
  if(!databasePromise)databasePromise=import('@netlify/database').then(m=>m.getDatabase()).catch(error=>{databasePromise=null;throw error});
  return databasePromise
}
const clean=v=>String(v??'').trim();
const now=()=>Date.now();

function memoryRead(key){
  const hit=memory.get(key);
  if(!hit)return null;
  if(hit.expiresAt<=now()){memory.delete(key);return null}
  return hit.payload
}

export async function readAnalyticsCache(key){
  const k=clean(key);if(!k)return null;
  const hot=memoryRead(k);if(hot)return hot;
  try{
    const database=await getAnalyticsDatabase();
    const rows=await database.sql`SELECT payload, EXTRACT(EPOCH FROM expires_at)*1000 AS expires_ms FROM retail_intelligence_cache WHERE cache_key=${k} AND expires_at>NOW() LIMIT 1`;
    const row=rows?.[0];if(!row)return null;
    const payload=row.payload,expiresAt=Number(row.expires_ms)||now()+60_000;
    memory.set(k,{payload,expiresAt});
    return payload
  }catch{return null}
}

export async function writeAnalyticsCache(key,group,payload,ttlSeconds){
  const k=clean(key),g=clean(group)||'generic',ttl=Math.max(30,Math.min(group==='crm-rfm-day-v1'?2592000:604800,Number(ttlSeconds)||300));
  if(!k||payload===undefined)return false;
  const expiresAt=now()+ttl*1000;memory.set(k,{payload,expiresAt});
  try{
    const database=await getAnalyticsDatabase();
    const payloadJson=JSON.stringify(payload);
    await database.sql`
      INSERT INTO retail_intelligence_cache(cache_key,cache_group,payload,generated_at,expires_at)
      VALUES(${k},${g},CAST(${payloadJson} AS JSONB),NOW(),NOW()+${ttl}*INTERVAL '1 second')
      ON CONFLICT(cache_key) DO UPDATE
      SET cache_group=EXCLUDED.cache_group,payload=EXCLUDED.payload,generated_at=NOW(),expires_at=EXCLUDED.expires_at
    `;
    return true
  }catch{return false}
}

export async function deleteAnalyticsCache(key){
  const k=clean(key);if(!k)return false;memory.delete(k);
  try{const database=await getAnalyticsDatabase();await database.sql`DELETE FROM retail_intelligence_cache WHERE cache_key=${k}`;return true}catch{return false}
}

export function analyticsCacheKey(group,parts=[]){
  return [clean(group),...(parts||[]).map(v=>clean(v))].join('|')
}

// Compare-and-set for paged operational reads. Prevents a slower instance from
// replacing a newer cursor with an older page after concurrent requests.
export async function readAnalyticsCacheFresh(key,{strict=false}={}){
 // Export job state is shared between Netlify instances. Never return an old
 // memory snapshot when the caller requires the latest persisted job state.
 try{
  const database=await getAnalyticsDatabase();
  const rows=await database.sql`SELECT payload FROM retail_intelligence_cache WHERE cache_key=${key} AND expires_at>NOW() LIMIT 1`;
  return rows?.[0]?.payload||null
 }catch(cause){
  if(strict)throw Object.assign(new Error('État de l’export temporairement indisponible.'),{status:503,code:'EXPORT_STATE_STORE_UNAVAILABLE',cause});
  return memoryRead(key)
 }
}
export async function compareAnalyticsCache(key,payload,expectedRevision){
 const json=JSON.stringify(payload),expected=expectedRevision==null?null:String(expectedRevision);
 try{
  const database=await getAnalyticsDatabase();
  const rows=await database.sql`INSERT INTO retail_intelligence_cache(cache_key,cache_group,payload,generated_at,expires_at)
   VALUES(${key},'operational-stock-v1',CAST(${json} AS JSONB),NOW(),NOW()+INTERVAL '15 minutes')
   ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,generated_at=NOW(),expires_at=EXCLUDED.expires_at
   WHERE (${expected}::text IS NULL AND retail_intelligence_cache.expires_at<=NOW()) OR retail_intelligence_cache.payload->>'revision'=${expected}::text RETURNING cache_key`;
  if(!rows?.length)return false;
 }catch{const old=memoryRead(key);if((old?.revision??null)!==expectedRevision)return false}
 memory.set(key,{payload,expiresAt:now()+900000});return true;
}

// One persisted read for a bounded set of exact cache keys; never substitute memory for coverage.
export async function readAnalyticsCacheManyFresh(keys){
 if(!Array.isArray(keys)||keys.length>250||keys.some(k=>typeof k!=='string'||!k)||new Set(keys).size!==keys.length)throw Error('Invalid cache keys');
 if(!keys.length)return new Map();
 const database=await getAnalyticsDatabase();
 const rows=await database.sql`SELECT cache_key,payload FROM retail_intelligence_cache WHERE expires_at>NOW() AND cache_key IN (SELECT jsonb_array_elements_text(CAST(${JSON.stringify(keys)} AS JSONB)))`;
 return new Map(rows.map(r=>[r.cache_key,r.payload]));
}

export async function readRfmSnapshotPage(key,page,segment='ALL'){
 const database=await getAnalyticsDatabase();const {readFilteredRfmSnapshot}=await import('./one-crm-rfm-snapshot-reader.mjs');return readFilteredRfmSnapshot((strings,...values)=>database.sql(strings,...values),key,page,segment);
}
export async function claimRfmSync(key){
 const {randomUUID}=await import('node:crypto');const token=randomUUID();
 const database=await getAnalyticsDatabase();
 const rows=await database.sql`INSERT INTO retail_intelligence_cache(cache_key,cache_group,payload,generated_at,expires_at) VALUES(${key},'crm-rfm-sync-lock',jsonb_build_object('token',${token}::text),NOW(),NOW()+INTERVAL '90 seconds') ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at,generated_at=NOW() WHERE retail_intelligence_cache.expires_at<=NOW() RETURNING cache_key`;
 return rows?.length?token:null;
}
export async function releaseRfmSync(key,token){const database=await getAnalyticsDatabase();await database.sql`DELETE FROM retail_intelligence_cache WHERE cache_key=${key} AND payload->>'token'=${token}`;}
export async function readRfmEvidenceMany(keys){
 if(!Array.isArray(keys)||keys.length>200||keys.some(k=>typeof k!=='string'||!k)||new Set(keys).size!==keys.length)throw Error('Invalid RFM evidence keys');
 if(!keys.length)return new Map();const database=await getAnalyticsDatabase();
 const rows=await database.sql`SELECT cache_key,jsonb_build_object('status',payload->'status','source',payload->'source','storeId',payload->'storeId','startDate',payload->'startDate','endDate',payload->'endDate','diagnostics',payload->'diagnostics','customers',COALESCE((SELECT jsonb_agg(jsonb_build_object('customerAccount',v->'customerAccount','sales',v->'sales','tickets',v->'tickets','lastDate',v->'lastDate')) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payload->'customers')='array' THEN payload->'customers' ELSE '[]'::jsonb END) AS a(v)),'[]'::jsonb)) AS payload FROM retail_intelligence_cache WHERE expires_at>NOW() AND jsonb_typeof(payload->'customers')='array' AND cache_key IN (SELECT jsonb_array_elements_text(CAST(${JSON.stringify(keys)} AS JSONB)))`;
 return new Map(rows.map(r=>[r.cache_key,r.payload]));
}

let crmArchivePromise;
export async function crmPurchaseArchive(){if(!crmArchivePromise)crmArchivePromise=(async()=>{const {createCrmArchive}=await import('./one-crm-purchase-archive.mjs');const database=await getAnalyticsDatabase();return createCrmArchive((strings,...values)=>database.sql(strings,...values))})().catch(e=>{crmArchivePromise=null;throw e});return crmArchivePromise;}

let crmMasterStorePromise;
export async function crmMasterStore(){if(!crmMasterStorePromise)crmMasterStorePromise=(async()=>{const {createCrmMasterStore}=await import('./one-crm-master-store.mjs');const database=await getAnalyticsDatabase();return createCrmMasterStore((strings,...values)=>database.sql(strings,...values))})().catch(e=>{crmMasterStorePromise=null;throw e});return crmMasterStorePromise;}

let crmIdentityStorePromise;
export async function crmIdentityStore(){if(!crmIdentityStorePromise)crmIdentityStorePromise=(async()=>{const {createCrmIdentityStore}=await import('./one-crm-identity-store.mjs');const database=await getAnalyticsDatabase();return createCrmIdentityStore((strings,...values)=>database.sql(strings,...values))})().catch(e=>{crmIdentityStorePromise=null;throw e});return crmIdentityStorePromise;}

let crmEarnStorePromise;
export async function crmEarnStore(){if(!crmEarnStorePromise)crmEarnStorePromise=(async()=>{const {createCrmEarnStore}=await import('./one-crm-earn-store.mjs');const database=await getAnalyticsDatabase();return createCrmEarnStore((strings,...values)=>database.sql(strings,...values))})().catch(e=>{crmEarnStorePromise=null;throw e});return crmEarnStorePromise;}

let crmBurnStorePromise;
export async function crmBurnStore(){if(!crmBurnStorePromise)crmBurnStorePromise=(async()=>{const {createCrmBurnStore}=await import('./one-crm-burn-store.mjs');const database=await getAnalyticsDatabase();return createCrmBurnStore((strings,...values)=>database.sql(strings,...values))})().catch(e=>{crmBurnStorePromise=null;throw e});return crmBurnStorePromise;}

export async function crmMarketingDraftStore(){const db=await getAnalyticsDatabase();const {createMarketingDraftStore}=await import('./one-crm-marketing-drafts.mjs');return createMarketingDraftStore((strings,...values)=>db.sql(strings,...values))}

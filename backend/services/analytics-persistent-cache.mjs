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
  const k=clean(key),g=clean(group)||'generic',ttl=Math.max(30,Math.min(604800,Number(ttlSeconds)||300));
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
export async function readAnalyticsCacheFresh(key){
 try{const database=await getAnalyticsDatabase();const rows=await database.sql`SELECT payload FROM retail_intelligence_cache WHERE cache_key=${key} AND expires_at>NOW() LIMIT 1`;return rows?.[0]?.payload||null}catch{return memoryRead(key)}
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

import { getDatabase } from '@netlify/database';

const memory=new Map();
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
    const database=getDatabase();
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
    const database=getDatabase();
    await database.sql`
      INSERT INTO retail_intelligence_cache(cache_key,cache_group,payload,generated_at,expires_at)
      VALUES(${k},${g},${payload},NOW(),NOW()+${ttl}*INTERVAL '1 second')
      ON CONFLICT(cache_key) DO UPDATE
      SET cache_group=EXCLUDED.cache_group,payload=EXCLUDED.payload,generated_at=NOW(),expires_at=EXCLUDED.expires_at
    `;
    return true
  }catch{return false}
}

export async function deleteAnalyticsCache(key){
  const k=clean(key);if(!k)return false;memory.delete(k);
  try{const database=getDatabase();await database.sql`DELETE FROM retail_intelligence_cache WHERE cache_key=${k}`;return true}catch{return false}
}

export function analyticsCacheKey(group,parts=[]){
  return [clean(group),...(parts||[]).map(v=>clean(v))].join('|')
}

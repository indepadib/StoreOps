import {readStoreLoyaltyEnrollments,readStoreLoyaltyRecruitmentsByStaff} from './dynamics-loyalty.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';

const clean=v=>String(v??'').trim();

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let cursor=0;
  const run=async()=>{while(true){const i=cursor++;if(i>=items.length)return;out[i]=await worker(items[i],i)}};
  await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length))},run));
  return out;
}

export async function readLoyaltyRange(stores,{startDate,endDate,includeStaff=false,force=false}={}){
  const ids=(stores||[]).map(s=>s.id).filter(Boolean),key=analyticsCacheKey('loyalty-range-v2',[ids.sort().join(','),startDate,endDate,includeStaff?'staff':'total']);
  if(!force){const hit=await readAnalyticsCache(key);if(hit)return{...hit,cache:{status:'PERSISTENT_HIT'}}}
  const rows=await mapLimit(stores||[],2,async store=>{
    const enroll=await readStoreLoyaltyEnrollments(store.id,{startDate,endDate});
    let staff=null;
    if(includeStaff)staff=await readStoreLoyaltyRecruitmentsByStaff(store.id,{startDate,endDate});
    return{
      storeId:store.id,storeName:store.name,storeCode:store.code,
      status:enroll?.status||'UNAVAILABLE',
      recruitments:enroll?.status==='READY'?Number(enroll.total||0):null,
      source:enroll?.source||null,
      enrollmentRows:enroll?.rowCount??null,
      truncated:!!enroll?.truncated,
      staff:staff?.status==='READY'?staff.items||[]:[],
      staffStatus:staff?.status||null,
      error:enroll?.error||null
    }
  });
  const ready=rows.filter(x=>x.status==='READY'),recruitments=ready.length?ready.reduce((s,x)=>s+Number(x.recruitments||0),0):null;
  const value={status:ready.length?'READY':'UNAVAILABLE',startDate,endDate,recruitments,stores:rows,coverage:{ready:ready.length,total:rows.length},generatedAt:new Date().toISOString()};
  const today=new Date().toISOString().slice(0,10),ttl=endDate>=today?1800:24*3600;
  await writeAnalyticsCache(key,'loyalty-range-v2',value,ttl);
  return{...value,cache:{status:'MISS'}}
}

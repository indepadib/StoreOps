import {readStoreLoyaltyEnrollments,readStoreLoyaltyRecruitmentsByStaff} from './dynamics-loyalty.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';

const accountCreationStatus='ACCOUNT_CREATION_SOURCE_UNVERIFIED';

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let cursor=0;
  const run=async()=>{while(true){const i=cursor++;if(i>=items.length)return;out[i]=await worker(items[i],i)}};
  await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length))},run));
  return out;
}

export async function readLoyaltyRange(stores,{startDate,endDate,includeStaff=false,force=false}={},
  {readEnrollments=readStoreLoyaltyEnrollments,readStaff=readStoreLoyaltyRecruitmentsByStaff,readCache=readAnalyticsCache,writeCache=writeAnalyticsCache}={}){
  const ids=(stores||[]).map(s=>s.id).filter(Boolean),key=analyticsCacheKey('loyalty-range-v3',[ids.sort().join(','),startDate,endDate,includeStaff?'staff':'total']);
  if(!force){const hit=await readCache(key);if(hit)return{...hit,cache:{status:'PERSISTENT_HIT'}}}
  const rows=await mapLimit(stores||[],2,async store=>{
    const enroll=await readEnrollments(store.id,{startDate,endDate});
    let staff=null;
    if(includeStaff)staff=await readStaff(store.id,{startDate,endDate});
    return{
      storeId:store.id,storeName:store.name,storeCode:store.code,
      status:enroll?.truncated?'TRUNCATED':enroll?.missingIdentityRows?'INCOMPLETE_IDENTITY':enroll?.status||'UNAVAILABLE',
      recruitments:null,
      accountCreations:null,accountCreationStatus,
      enrollments:enroll?.status==='READY'&&!enroll.truncated&&!enroll.missingIdentityRows?enroll.total:null,
      enrollmentIdentityBasis:enroll?.identityBasis||null,
      source:enroll?.source||null,
      enrollmentRows:enroll?.rowCount??null,
      truncated:!!enroll?.truncated,
      staff:staff?.status==='READY'&&!staff.truncated?(staff.items||[]).map(({staffId,recruitments})=>({staffId,cardEnrollments:recruitments,recruitments:null})):[],
      staffStatus:staff?.truncated?'TRUNCATED':staff?.status||null,
      error:enroll?.error||null
    }
  });
  const ready=rows.filter(x=>x.status==='READY'&&x.enrollments!=null);
  const status=ready.length===0?'UNAVAILABLE':ready.length===rows.length?'READY':'PARTIAL';
  const value={status,startDate,endDate,recruitments:null,accountCreations:null,accountCreationStatus,stores:rows,
    enrollmentMetric:{dateBasis:'LOYALTY_ENROLLMENT_DATE',scope:'PER_STORE',networkTotal:null},
    coverage:{ready:ready.length,total:rows.length},generatedAt:new Date().toISOString()};
  const today=new Date().toISOString().slice(0,10),ttl=endDate>=today?1800:24*3600;
  await writeCache(key,'loyalty-range-v3',value,ttl);
  return{...value,cache:{status:'MISS'}}
}

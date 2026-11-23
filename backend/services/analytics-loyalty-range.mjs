import {readStoreLoyaltyRecruitmentsByStaff} from './dynamics-loyalty.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
import {readAccountCreations} from './dynamics-account-creations.mjs';
import {readStoreWalletEarn} from './dynamics-wallet-earn.mjs';
import {config} from '../config.mjs';
import {storeOperationalSettings} from './store-settings.mjs';

const accountCreationStatus='ACCOUNT_CREATION_SOURCE_UNVERIFIED';

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let cursor=0;
  const run=async()=>{while(true){const i=cursor++;if(i>=items.length)return;out[i]=await worker(items[i],i)}};
  await Promise.all(Array.from({length:Math.max(1,Math.min(limit,items.length))},run));
  return out;
}

export async function readLoyaltyRange(stores,{startDate,endDate,includeStaff=false,force=false,networkScope=false}={},
  {readEnrollments=null,readStaff=readStoreLoyaltyRecruitmentsByStaff,readAccounts=readAccountCreations,readEarn=readStoreWalletEarn,readCache=readAnalyticsCache,writeCache=writeAnalyticsCache}={}){
  const ids=(stores||[]).map(s=>s.id).filter(Boolean),key=analyticsCacheKey('loyalty-range-v4',[config.dynamics.baseUrl,config.dynamics.dataAreaId,config.dynamics.mode,ids.sort().map(id=>id+':'+storeOperationalSettings(id)?.d365?.operatingUnitNumber).join(','),startDate,endDate,includeStaff?'staff':'total',networkScope?'network':'stores']);
  if(!force){const hit=await readCache(key);if(hit)return{...hit,cache:{status:'PERSISTENT_HIT'}}}
  const accountPromise=readAccounts(stores,{startDate,endDate});
  const rows=await mapLimit(stores||[],2,async store=>{
    const [enroll,earn]=await Promise.all([readEnrollments?readEnrollments(store.id,{startDate,endDate}):accountPromise.then(a=>a.enrollments?.find(r=>r.storeId===store.id)),readEarn(store.id,{startDate,endDate})]);
    let staff=null;
    if(includeStaff)staff=await readStaff(store.id,{startDate,endDate});
    return{
      storeId:store.id,storeName:store.name,storeCode:store.code,
      status:enroll?.truncated?'TRUNCATED':enroll?.missingIdentityRows?'INCOMPLETE_IDENTITY':enroll?.status||'UNAVAILABLE',
      recruitments:null,
      accountCreations:null,accountCreationStatus,
      earn:earn?.status==='READY'?earn.earn:null,earnStatus:earn?.status||'UNAVAILABLE',earnSource:earn?.source||null,earnProvenance:earn?.provenance||null,
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
  const accounts=await accountPromise;
  const accountsReady=['READY','PARTIAL'].includes(accounts?.status);
  for(const row of rows){const count=accounts?.stores?.find(s=>s.storeId===row.storeId)?.total;row.accountCreations=accountsReady?count??null:null;row.recruitments=row.accountCreations;row.accountCreationStatus=accountsReady?accounts.status:'UNAVAILABLE';}
  const ready=rows.filter(x=>x.status==='READY'&&x.enrollments!=null);
  const status=ready.length===0?'UNAVAILABLE':ready.length===rows.length?'READY':'PARTIAL';
  const accountTotal=accountsReady?(networkScope?accounts.networkTotal:accounts.total):null;
  const earnReady=rows.length>0&&rows.every(r=>r.earnStatus==='READY'&&r.earn!=null);
  const value={status,startDate,endDate,recruitments:accountTotal,accountCreations:accountTotal,accountCreationStatus:accountsReady?(networkScope?'READY':accounts.status):accountCreationStatus,
    accountCreationEvidence:{source:accounts?.source||null,dateField:accounts?.dateField||null,timeZone:accounts?.timeZone||null,attribution:accounts?.attribution||null,scope:networkScope?'NETWORK':'SELECTED_STORES',unattributed:networkScope?accounts?.unattributed??null:null,storeAttributionStatus:accounts?.status||'UNAVAILABLE'},
    earn:earnReady?Math.round(rows.reduce((sum,r)=>sum+r.earn,0)*100)/100:null,earnStatus:earnReady?'READY':'UNAVAILABLE',stores:rows,
    enrollmentMetric:{dateBasis:'LOYALTY_ENROLLMENT_DATE',scope:'PER_STORE',networkTotal:null},
    coverage:{ready:ready.length,total:rows.length},generatedAt:new Date().toISOString()};
  const today=new Date().toISOString().slice(0,10),ttl=endDate>=today?1800:24*3600;
  if(accountsReady&&earnReady)await writeCache(key,'loyalty-range-v4',value,Math.min(ttl,1800));
  return{...value,cache:{status:'MISS'}}
}

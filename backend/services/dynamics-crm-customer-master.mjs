import {isLoyaltyCustomerAccount,loyaltyCustomerFilter,isCltFilterRejected,scanCltAccounts} from './one-crm-customer-source.mjs';
import {config} from '../config.mjs';
import {odataGet} from './dynamics.mjs';
import {readCompleteCollection} from './dynamics-account-creations.mjs';
import {normalizeCustomerMaster} from './one-crm-customer-directory.mjs';
import {isPreparedRfmRange} from './one-crm-rfm-population.mjs';
let cache=null,inflight=null;
export async function readCustomerMaster(){
 const company=String(config.dynamics.dataAreaId||'').trim();
 if(config.dynamics.mode!=='live'||!company)throw Error('Live company required');
 const key=JSON.stringify([config.dynamics.baseUrl,company]);
 if(cache?.key===key&&cache.expires>Date.now())return cache.value;
 if(inflight?.key===key)return inflight.promise;
 const promise=(async()=>{
  let rows;
  try{rows=await readCompleteCollection('CustTableCDREntities',{filter:"SysDataAreaId eq '"+company.replaceAll("'","''")+"' and CustGroup eq 'Retail' and "+loyaltyCustomerFilter('AccountNum'),select:'AccountNum,SysCreatedDateTime,SysDataAreaId,CustGroup',extra:'cross-company=true'},odataGet)}
  catch(e){if(!isCltFilterRejected(e))throw e;const result=await scanCltAccounts({company,read:odataGet});if(!result.complete)throw Error('Incomplete CLT master');rows=result.rows.map(r=>({AccountNum:r.accountRef,SysCreatedDateTime:r.createdAt,SysDataAreaId:company,CustGroup:'Retail'}))}

  const value=normalizeCustomerMaster(rows,{company,checkedAt:new Date().toISOString()});
  cache={key,value,expires:Date.now()+300000};return value;
 })();
 inflight={key,promise};try{return await promise}finally{if(inflight?.promise===promise)inflight=null}
}

export async function readCustomerProfile(row){
 const company=String(config.dynamics.dataAreaId||'').trim(),accountRef=row.accountRef;
 const base={status:'READY',accountRef,createdAt:row.createdAt,source:'D365/CustTableCDREntities',scope:'LEGAL_ENTITY_RETAIL',historyStatus:'NOT_CONNECTED',activationEnabled:false};
 const unavailable={status:'UNAVAILABLE',cardCount:null,firstEnrollmentAt:null};
 if(config.dynamics.mode!=='live'||!company||!isLoyaltyCustomerAccount(accountRef))return {...base,loyalty:unavailable};
 try{
  const esc=v=>String(v).replaceAll("'","''");
  const accounts=await readCompleteCollection('CustTableCDREntities',{filter:"SysDataAreaId eq '"+esc(company)+"' and CustGroup eq 'Retail' and AccountNum eq '"+esc(accountRef)+"'",select:'AccountNum,Party,SysCreatedDateTime,SysDataAreaId',extra:'cross-company=true'},odataGet);
  if(accounts.length!==1||String(accounts[0].AccountNum).trim()!==accountRef||String(accounts[0].SysDataAreaId).trim()!==company||(row.createdAt!==null&&new Date(accounts[0].SysCreatedDateTime).toISOString()!==row.createdAt))return {...base,loyalty:unavailable};
  const partyKey=String(accounts[0].Party??'').trim();
  if(!partyKey)return {...base,loyalty:{status:'UNVERIFIED',cardCount:null,firstEnrollmentAt:null}};
  // SourceKey is a Dynamics numeric record reference in some environments; do not assume EDM type.
  const filters=["SourceKey eq '"+esc(partyKey)+"'",...(/^\d+$/.test(partyKey)?['SourceKey eq '+partyKey]:[])];
  let parties=null,lastError=null;
  for(const filter of filters){try{parties=await readCompleteCollection('DirPartyTableBiEntities',{filter,select:'PartyNumber,SourceKey'},odataGet);break}catch(e){lastError=e;if(e?.details?.httpStatus!==400)throw e}}
  if(!parties)throw lastError||Error('Party lookup failed');
  const partyNumbers=[...new Set(parties.filter(p=>String(p.SourceKey).trim()===partyKey).map(p=>String(p.PartyNumber??'').trim()))];
  if(partyNumbers.length!==1||!partyNumbers[0])return {...base,loyalty:{status:'UNVERIFIED',cardCount:null,firstEnrollmentAt:null}};
  const cards=await readCompleteCollection('RetailLoyaltyCards',{filter:"PartyNumber eq '"+esc(partyNumbers[0])+"'",select:'CardNumber,PartyNumber,LoyaltyEnrollmentDate'},odataGet);
  if(cards.some(c=>String(c.PartyNumber??'').trim()!==partyNumbers[0]))return {...base,loyalty:unavailable};
  const {projectLoyaltyIdentity}=await import('./one-crm-customer-profile.mjs');
  return {...base,loyalty:projectLoyaltyIdentity({account:accounts[0],parties,cards})};
 }catch{return {...base,loyalty:unavailable}}
}

import {readDirectorySourcePage,readDirectorySourceCount,findDirectorySourceAccount} from './one-crm-customer-source.mjs';
const sourceDeps=()=>({company:String(config.dynamics.dataAreaId||'').trim(),read:odataGet});
export const readCustomerPage=(page,search)=>readDirectorySourcePage({...sourceDeps(),page,search});
let countCache=null;
export async function readCustomerCount(){
 const deps=sourceDeps(),key=JSON.stringify([config.dynamics.baseUrl,deps.company]);
 if(countCache?.key===key&&countCache.expires>Date.now())return countCache.value;
 const value=await readDirectorySourceCount(deps);countCache={key,value,expires:Date.now()+300000};return value;
}
export const findCustomerAccount=accountRef=>findDirectorySourceAccount({...sourceDeps(),accountRef});

export async function readCrmCustomerIdentity(row){
 const {readCustomerIdentity}=await import('./one-crm-customer-identity-source.mjs');
 return readCustomerIdentity({...sourceDeps(),accountRef:row.accountRef});
}

export async function readCrmCustomerWallet(row,stores){
 const {readCustomerWallet}=await import('./one-crm-customer-wallet.mjs');
 const {storeOperationalSettings}=await import('./store-settings.mjs');
 return readCustomerWallet({accountRef:row.accountRef,company:sourceDeps().company,stores,settings:storeOperationalSettings,readCollection:readCompleteCollection});
}

export async function readCrmCustomerNames(accounts){
 const {readCustomerNames}=await import('./one-crm-customer-identity-source.mjs');
 return readCustomerNames({...sourceDeps(),accounts});
}

export async function searchCrmCustomerIdentity({query,by,page}){
 const {searchCustomerIdentity}=await import('./one-crm-customer-identity-source.mjs');
 return searchCustomerIdentity({...sourceDeps(),query,by,page});
}

/** Reuse already prepared Analytics ranges; never launch a network-wide live scan on page load. */
export async function readCrmRfmPopulation(stores,page,{asOf=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date(Date.now()-86400000)),allRows=false}={}){
 const {projectRfmPopulation,selectPreparedRfmDays,summarizePreparedRfmEvidence}=await import('./one-crm-rfm-population.mjs');
 const {analyticsCacheKey,readRfmEvidenceMany,crmPurchaseArchive}=await import('./analytics-persistent-cache.mjs');
 const {salesIntegrationConfig}=await import('./dynamics-sales.mjs');
 if(config.dynamics.mode!=='live'||!sourceDeps().company)return {status:'UNAVAILABLE',reason:'LIVE_SOURCE_REQUIRED',activationEnabled:false};
 const storeIds=stores.map(s=>s.id),startDate=new Date(Date.parse(asOf+'T00:00:00Z')-89*86400000).toISOString().slice(0,10);
 const partitions=[];for(const id of storeIds){for(let i=0;i<3;i++){const start=new Date(Date.parse(startDate+'T00:00:00Z')+i*30*86400000).toISOString().slice(0,10),end=new Date(Date.parse(start+'T00:00:00Z')+29*86400000).toISOString().slice(0,10);partitions.push({id,start,end,days:Array.from({length:30},(_,j)=>new Date(Date.parse(start+'T00:00:00Z')+j*86400000).toISOString().slice(0,10))})}}
 const dayKey=(id,date)=>analyticsCacheKey('crm-rfm-day-v1',[sourceDeps().company,id,date]),rangeKey=(id,start,end)=>analyticsCacheKey('sales-range-v32',[id,start,end]);
 const keys=[...new Set(partitions.flatMap(p=>[rangeKey(p.id,p.start,p.end),...p.days.flatMap(d=>[dayKey(p.id,d),rangeKey(p.id,d,d)])]))];
 let cached=new Map();try{for(let i=0;i<keys.length;i+=200){for(const [key,value] of await readRfmEvidenceMany(keys.slice(i,i+200)))cached.set(key,value)}}catch{return {status:'UNAVAILABLE',reason:'RFM_CACHE_UNAVAILABLE',activationEnabled:false}};
 const archive=await crmPurchaseArchive(),archived=await archive.read(sourceDeps().company,storeIds,startDate,asOf);
 const archiveByKey=new Map(archived.map(a=>[dayKey(a.store_id,a.day),a]));
 const detailPending=[];for(const p of partitions)for(const date of p.days){const saved=archiveByKey.get(dayKey(p.id,date)),recent=date>=new Date(Date.parse(asOf+'T00:00:00Z')-86400000).toISOString().slice(0,10);if(!saved?.detailed||recent&&Date.now()-Date.parse(saved.captured_at)>=10800000)detailPending.push({storeId:p.id,date})}
 // Promote daily evidence already fetched by the old system before it expires.
 const promote=[];for(const p of partitions)for(const date of p.days){const key=dayKey(p.id,date),saved=archiveByKey.get(key),recent=date>=new Date(Date.parse(asOf+'T00:00:00Z')-86400000).toISOString().slice(0,10);if(saved&&(!recent||Date.now()-Date.parse(saved.captured_at)<10800000)){cached.set(key,saved.evidence);continue}const existing=cached.get(key)||cached.get(rangeKey(p.id,date,date));if(!saved&&isPreparedRfmRange(existing,p.id,date,date))promote.push(existing);}
 for(let i=0;i<promote.length;i+=8)await Promise.all(promote.slice(i,i+8).map(x=>archive.put(sourceDeps().company,x)));
 const {ranges,missing,unmappedStores}=selectPreparedRfmDays({partitions,cached,dayKey,rangeKey,readyStore:id=>{const cfg=salesIntegrationConfig(id);return cfg.ready&&cfg.entity==='RetailTransactionSalesTransBIEntities'}});
 const coveredStoreDays=ranges.reduce((n,r)=>n+Math.round((Date.parse(r.endDate)-Date.parse(r.startDate))/86400000)+1,0),expectedStoreDays=storeIds.length*90;
 const coverage={expectedStoreDays,coveredStoreDays,rejectedRanges:0,unmatchedPurchaseAccounts:null},progress={basis:'OBSERVED_POSITIVE_90_DAY_PILOT_RANGES',asOf,startDate,storeIds,coverage,nextMissing:missing[0]||null,missingStoreDays:missing,detailPending,archiveCoverage:{detailedStoreDays:archived.filter(a=>a.detailed).length,expectedStoreDays},unmappedStores,preview:summarizePreparedRfmEvidence(ranges,asOf),activationEnabled:false};
 // Do not read the entire customer master or names until coverage is ready.
 if(coveredStoreDays!==expectedStoreDays)return {...progress,status:'PREPARING',totalAccounts:null,counts:{},page,pageSize:50,rows:[]};
 let master;try{master=await readCustomerMaster()}catch{return {...progress,status:'MASTER_UNAVAILABLE',reason:'RFM_CUSTOMER_MASTER_UNAVAILABLE',totalAccounts:null,counts:{},page,pageSize:50,rows:[]}};
 const population=projectRfmPopulation({accounts:master.rows,stores:storeIds,ranges,asOf,page,allRows});
 return {...population,nextMissing:null,missingStoreDays:[],detailPending,archiveCoverage:progress.archiveCoverage,unmappedStores};
}

export async function prepareCrmRfmDay(storeId,date){
 const asOf=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date(Date.now()-86400000)),start=new Date(Date.parse(asOf+'T00:00:00Z')-89*86400000).toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<start||date>asOf||!Number.isFinite(Date.parse(date))||new Date(Date.parse(date)).toISOString().slice(0,10)!==date)return {status:'INVALID_DATE'};
 const {readStoreRfmDay}=await import('./dynamics-sales.mjs');
 const {analyticsCacheKey,readAnalyticsCacheFresh,writeAnalyticsCache,crmPurchaseArchive}=await import('./analytics-persistent-cache.mjs');
 const key=analyticsCacheKey('crm-rfm-day-v1',[sourceDeps().company,storeId,date]);
 if(isPreparedRfmRange(await readAnalyticsCacheFresh(key,{strict:true}),storeId,date,date))return {status:'READY',storeId,date,reused:true};
 const analytics=await readAnalyticsCacheFresh(analyticsCacheKey('sales-range-v32',[storeId,date,date]),{strict:true});
 if(isPreparedRfmRange(analytics,storeId,date,date))return {status:'READY',storeId,date,reused:true};
 const r=await readStoreRfmDay(storeId,date);
 if(!isPreparedRfmRange(r,storeId,date,date))return {status:'UNAVAILABLE',reason:r.reason||'DAY_SOURCE_INCOMPLETE'};
 const {status,source,startDate,endDate,diagnostics}=r,customers=r.customers.map(({customerAccount,sales,tickets,lastDate})=>({customerAccount,sales,tickets,lastDate}));
 await (await crmPurchaseArchive()).put(sourceDeps().company,{status,source,storeId,startDate,endDate,diagnostics,customers});
 const stored=await writeAnalyticsCache(key,'crm-rfm-day-v1',{status,source,storeId,startDate,endDate,diagnostics:{truncated:diagnostics.truncated,filterCoverage:{parentTransaction:diagnostics.filterCoverage.parentTransaction},mappedFields:{customer:diagnostics.mappedFields.customer}},customers},date>=new Date(Date.parse(asOf+'T00:00:00Z')-86400000).toISOString().slice(0,10)?10800:2592000);
 return stored?{status:'READY',storeId,date}:{status:'UNAVAILABLE',reason:'DAY_STORAGE_UNAVAILABLE'};
}

const rfmAsOf=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date(Date.now()-86400000));
const rfmSnapshotKey=(stores,asOf)=>['crm-rfm-snapshot-v1',sourceDeps().company,...stores.map(s=>s.id).sort(),asOf].join('|');
export async function readCrmRfmSnapshot(stores,page){
 const {readRfmSnapshotPage}=await import('./analytics-persistent-cache.mjs');
 if(config.dynamics.mode!=='live'||!sourceDeps().company)return {status:'UNAVAILABLE',reason:'LIVE_SOURCE_REQUIRED',activationEnabled:false};
 const asOf=rfmAsOf(),startDate=new Date(Date.parse(asOf+'T00:00:00Z')-89*86400000).toISOString().slice(0,10),storeIds=stores.map(s=>s.id);
 const snapshot=await readRfmSnapshotPage(rfmSnapshotKey(stores,asOf),page);
 if(snapshot)return snapshot;
 const yesterday=new Date(Date.parse(asOf+'T00:00:00Z')-86400000).toISOString().slice(0,10),previous=await readRfmSnapshotPage(rfmSnapshotKey(stores,yesterday),page);
 if(previous?.status==='READY')return {...previous,staleSnapshot:true,missingStoreDays:[]};
 return {status:'PREPARING',basis:'OBSERVED_POSITIVE_90_DAY_PILOT_RANGES',asOf,startDate,storeIds,coverage:{expectedStoreDays:storeIds.length*90,coveredStoreDays:0},coverageUnknown:true,missingStoreDays:[],totalAccounts:null,counts:{},page,pageSize:50,rows:[],activationEnabled:false};
}
export async function runCrmRfmSync(stores){
 const {claimRfmSync,releaseRfmSync,readRfmSnapshotPage,writeAnalyticsCache,readAnalyticsCacheManyFresh}=await import('./analytics-persistent-cache.mjs');
 const {planRfmBackfill}=await import('./one-crm-rfm-population.mjs');
 if(config.dynamics.mode!=='live'||!sourceDeps().company||!stores.length)return {status:'DISABLED'};
 const key=rfmSnapshotKey(stores,rfmAsOf()),lock=await claimRfmSync(key+'|lock');if(!lock)return {status:'BUSY'};
 try{
 const last=await readRfmSnapshotPage(key,1);if(last?.status==='READY'&&!last.detailPending?.length&&Date.now()-Date.parse(last.snapshotAt)<900000)return {status:'READY',reused:true};
 const result=await readCrmRfmPopulation(stores,1,{allRows:true});
 if(!['READY','PREPARING','MASTER_UNAVAILABLE'].includes(result.status))return {status:'UNAVAILABLE',reason:result.reason||'RFM_SOURCE_UNAVAILABLE'};
 if(last?.status!=='READY'||result.status==='READY'){if(!await writeAnalyticsCache(key,'crm-rfm-snapshot-v1',{...result,snapshotAt:new Date().toISOString()},172800))return {status:'UNAVAILABLE',reason:'RFM_SNAPSHOT_STORAGE_FAILED'}}
 const missing=result.missingStoreDays?.length?result.missingStoreDays:result.detailPending||[],failureKey=x=>key+'|retry|'+x.storeId+'|'+x.date,blocked=new Set();
 for(let i=0;i<missing.length;i+=200){const failed=await readAnalyticsCacheManyFresh(missing.slice(i,i+200).map(failureKey));for(const x of missing.slice(i,i+200))if(failed.has(failureKey(x)))blocked.add(x.storeId+'|'+x.date)}
 const groups=planRfmBackfill(missing,blocked,5,2);
 const outcomes=await Promise.all(groups.map(async group=>{
  let outcome;try{outcome=await prepareCrmRfmBatch(group.storeId,group.dates)}catch{outcome={prepared:[],failed:group.dates,reason:'RFM_BATCH_FAILED'}}
  // If a grouped read fails, try the newest single day in a subsequent run;
  // cooldown the group except that day, so a large query cannot starve progress.
  if(!outcome.prepared.length&&group.dates.length>1){const newest=group.dates[0];await Promise.all(group.dates.slice(1).map(date=>writeAnalyticsCache(failureKey({storeId:group.storeId,date}),'crm-rfm-retry',{failed:true},120)));return {prepared:0,failed:group.dates.length,reason:outcome.reason}}
  await Promise.all(outcome.failed.map(date=>writeAnalyticsCache(failureKey({storeId:group.storeId,date}),'crm-rfm-retry',{failed:true},900)));
  return {prepared:outcome.prepared.length,failed:outcome.failed.length,reason:outcome.reason};
 }));
 const prepared=outcomes.reduce((n,x)=>n+x.prepared,0),failed=outcomes.reduce((n,x)=>n+x.failed,0);
 const report={status:result.status,coveredStoreDays:result.coverage?.coveredStoreDays,expectedStoreDays:result.coverage?.expectedStoreDays,detailedStoreDays:result.archiveCoverage?.detailedStoreDays,prepared,failed,errors:outcomes.filter(x=>x.failed).map(x=>x.reason)};
 console.info('CRM RFM sync',JSON.stringify(report));
 return report;
 }finally{await releaseRfmSync(key+'|lock',lock).catch(()=>{})}
}

async function prepareCrmRfmBatch(storeId,dates){
 const {readStoreRfmDays}=await import('./dynamics-sales.mjs');const {crmPurchaseArchive}=await import('./analytics-persistent-cache.mjs');
 const sorted=[...dates].sort(),result=await readStoreRfmDays(storeId,sorted);
 if(result.status!=='READY'||!Array.isArray(result.days)||result.days.length!==sorted.length||result.days.some((r,i)=>!isPreparedRfmRange(r,storeId,sorted[i],sorted[i])))return {prepared:[],failed:dates,reason:result.reason||'RFM_BATCH_INCOMPLETE'};
 const archive=await crmPurchaseArchive();const outcomes=await Promise.all(result.days.map(async r=>{try{await archive.put(sourceDeps().company,r);return {date:r.startDate,ok:true}}catch{return {date:r.startDate,ok:false}}}));
 return {prepared:outcomes.filter(x=>x.ok).map(x=>x.date),failed:outcomes.filter(x=>!x.ok).map(x=>x.date),reason:'RFM_BATCH_STORAGE_FAILED'};
}

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
  const rows=await readCompleteCollection('CustTableCDREntities',{filter:"SysDataAreaId eq '"+company.replaceAll("'","''")+"' and CustGroup eq 'Retail'",select:'AccountNum,SysCreatedDateTime,SysDataAreaId,CustGroup',extra:'cross-company=true'},odataGet);
  const value=normalizeCustomerMaster(rows,{company,checkedAt:new Date().toISOString()});
  cache={key,value,expires:Date.now()+300000};return value;
 })();
 inflight={key,promise};try{return await promise}finally{if(inflight?.promise===promise)inflight=null}
}

export async function readCustomerProfile(row){
 const company=String(config.dynamics.dataAreaId||'').trim(),accountRef=row.accountRef;
 const base={status:'READY',accountRef,createdAt:row.createdAt,source:'D365/CustTableCDREntities',scope:'LEGAL_ENTITY_RETAIL',historyStatus:'NOT_CONNECTED',activationEnabled:false};
 const unavailable={status:'UNAVAILABLE',cardCount:null,firstEnrollmentAt:null};
 if(config.dynamics.mode!=='live'||!company)return {...base,loyalty:unavailable};
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
export async function readCrmRfmPopulation(stores,page,{asOf=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date(Date.now()-86400000))}={}){
 const {projectRfmPopulation}=await import('./one-crm-rfm-population.mjs');
 const {analyticsCacheKey,readAnalyticsCache}=await import('./analytics-persistent-cache.mjs');
 const {salesIntegrationConfig}=await import('./dynamics-sales.mjs');
 const [master,count]=await Promise.all([readCustomerMaster(),readCustomerCount()]);
 if(count.totalAccounts!==master.rows.length)return {status:'UNAVAILABLE',reason:'CUSTOMER_MASTER_COUNT_MISMATCH',activationEnabled:false};
 const storeIds=stores.map(s=>s.id);
 const dates=Array.from({length:3},(_,i)=>{const end=Date.parse(asOf+'T00:00:00Z')-(2-i)*30*86400000;return [new Date(end-29*86400000).toISOString().slice(0,10),new Date(end).toISOString().slice(0,10)]});
 const ranges=[];
 for(const id of storeIds){
  const cfg=salesIntegrationConfig(id);
  if(!cfg.ready||cfg.entity!=='RetailTransactionSalesTransBIEntities')continue;
  for(const [start,end] of dates){
   const range=await readAnalyticsCache(analyticsCacheKey('sales-range-v32',[id,start,end]));
   if(isPreparedRfmRange(range,id,start,end)){ranges.push(range);continue}
   const dates=Array.from({length:30},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
   for(let i=0;i<dates.length;i+=8){
    const daily=await Promise.all(dates.slice(i,i+8).map(date=>readAnalyticsCache(analyticsCacheKey('crm-rfm-day-v1',[sourceDeps().company,id,date]))));
    for(let j=0;j<daily.length;j++){const date=dates[i+j];if(isPreparedRfmRange(daily[j],id,date,date))ranges.push(daily[j])}
   }
  }
 }
 const population=projectRfmPopulation({accounts:master.rows,stores:storeIds,ranges,asOf,page});
 const covered=new Set();for(const r of ranges){for(let t=Date.parse(r.startDate+'T00:00:00Z');t<=Date.parse(r.endDate+'T00:00:00Z');t+=86400000)covered.add(JSON.stringify([r.storeId,new Date(t).toISOString().slice(0,10)]))}
 const missing=[];for(const id of storeIds)for(let i=89;i>=0;i--){const date=new Date(Date.parse(asOf+'T00:00:00Z')-i*86400000).toISOString().slice(0,10);if(!covered.has(JSON.stringify([id,date])))missing.push({storeId:id,date})}
 population.nextMissing=missing[0]||null;

 try{
  const names=await readCrmCustomerNames(population.rows.map(r=>r.accountRef)),byAccount=new Map((names.rows||[]).map(r=>[r.accountRef,r]));
  return {...population,rows:population.rows.map(r=>({...r,displayName:byAccount.get(r.accountRef)?.displayName||null,nameStatus:byAccount.get(r.accountRef)?.status||'UNAVAILABLE'}))};
 }catch{return population}

}

export async function prepareCrmRfmDay(storeId,date){
 const asOf=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date(Date.now()-86400000)),start=new Date(Date.parse(asOf+'T00:00:00Z')-89*86400000).toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<start||date>asOf||!Number.isFinite(Date.parse(date))||new Date(Date.parse(date)).toISOString().slice(0,10)!==date)return {status:'INVALID_DATE'};
 const {readStoreSalesRange}=await import('./dynamics-sales.mjs');
 const {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache}=await import('./analytics-persistent-cache.mjs');
 const key=analyticsCacheKey('crm-rfm-day-v1',[sourceDeps().company,storeId,date]);
 if(isPreparedRfmRange(await readAnalyticsCache(key),storeId,date,date))return {status:'READY',storeId,date,reused:true};
 const r=await readStoreSalesRange(storeId,{startDate:date,endDate:date});
 if(!isPreparedRfmRange(r,storeId,date,date))return {status:'UNAVAILABLE',reason:'DAY_SOURCE_INCOMPLETE'};
 const {status,source,startDate,endDate,diagnostics}=r,customers=r.customers.map(({customerAccount,sales,tickets,lastDate})=>({customerAccount,sales,tickets,lastDate}));
 const stored=await writeAnalyticsCache(key,'crm-rfm-day-v1',{status,source,storeId,startDate,endDate,diagnostics:{truncated:diagnostics.truncated,filterCoverage:{parentTransaction:diagnostics.filterCoverage.parentTransaction},mappedFields:{customer:diagnostics.mappedFields.customer}},customers},date>=new Date(Date.parse(asOf+'T00:00:00Z')-86400000).toISOString().slice(0,10)?10800:604800);
 return stored?{status:'READY',storeId,date}:{status:'UNAVAILABLE',reason:'DAY_STORAGE_UNAVAILABLE'};
}

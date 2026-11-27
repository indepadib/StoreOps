// Population projection: the master is the left side, never only purchasers.
import {scoreObservedRfm} from './one-crm-customer-rfm.mjs';
const dayMs=86400000,round=n=>Math.round(n*100)/100,stamp=d=>Date.parse(d+'T00:00:00Z');
const day=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(stamp(d))&&new Date(stamp(d)).toISOString().slice(0,10)===d;
const anonymous=new Set(['','0','ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN']);
const source='D365/RetailTransactionSalesTransBIEntities';
export function projectRfmPopulation({accounts,stores,ranges,asOf,page=1,allRows=false}){
 if(!Array.isArray(accounts)||accounts.length>100000||!Array.isArray(stores)||!stores.length||new Set(stores).size!==stores.length||!Array.isArray(ranges)||!day(asOf)||!Number.isSafeInteger(page)||page<1)throw Error('Invalid population scope');
 const master=new Map();
 for(const a of accounts){if(typeof a.accountRef!=='string'||!a.accountRef.trim()||master.has(a.accountRef))throw Error('Invalid master account');master.set(a.accountRef,{accountRef:a.accountRef,tickets90:0,positiveTtc90:0,lastDate:null})}
 const start=new Date(stamp(asOf)-89*dayMs).toISOString().slice(0,10),covered=new Set(),matched=new Set(),unmatched=new Set();
 const partitionKey=(storeId,date)=>JSON.stringify([storeId,date]);
 let rejectedRanges=0;
 for(const x of ranges){
  const valid=x?.status==='READY'&&x.source===source&&stores.includes(x.storeId)&&day(x.startDate)&&day(x.endDate)&&x.startDate>=start&&x.endDate<=asOf&&x.startDate<=x.endDate&&x.diagnostics?.truncated===false&&x.diagnostics?.filterCoverage?.parentTransaction===true&&x.diagnostics?.mappedFields?.customer===true&&Array.isArray(x.customers);
  if(!valid){rejectedRanges++;continue}
  const keys=[];for(let t=stamp(x.startDate);t<=stamp(x.endDate);t+=dayMs)keys.push(partitionKey(x.storeId,new Date(t).toISOString().slice(0,10)));
  if(keys.some(k=>covered.has(k)))throw Error('Overlapping source range');
  const seen=new Set();
  for(const r of x.customers){
   if(typeof r.customerAccount!=='string'||anonymous.has(r.customerAccount.toUpperCase())||seen.has(r.customerAccount)||!Number.isSafeInteger(r.tickets)||r.tickets<1||!Number.isFinite(r.sales)||r.sales<=0||!day(r.lastDate)||r.lastDate<x.startDate||r.lastDate>x.endDate)throw Error('Invalid source customer');
   seen.add(r.customerAccount);const a=master.get(r.customerAccount);if(!a){unmatched.add(r.customerAccount);continue}
   matched.add(a.accountRef);a.tickets90+=r.tickets;a.positiveTtc90+=r.sales;if(!a.lastDate||r.lastDate>a.lastDate)a.lastDate=r.lastDate;
  }
  for(const key of keys)covered.add(key);
 }
 const expected=stores.length*90,complete=covered.size===expected&&rejectedRanges===0;
 const rows=[...master.values()].map(a=>{
  if(anonymous.has(a.accountRef.toUpperCase()))return {accountRef:a.accountRef,status:'EXCLUDED_ANONYMOUS_ACCOUNT',rfm:null};
  if(!complete)return {accountRef:a.accountRef,status:'HISTORY_INCOMPLETE',rfm:null};
  if(!a.lastDate)return {accountRef:a.accountRef,status:'NO_PURCHASE_IN_OBSERVED_90_DAYS',rfm:null,tickets90:0,positiveTtc90:0,recencyDays:null,recencyLowerBoundDays:90};
  const recencyDays=(stamp(asOf)-stamp(a.lastDate))/dayMs,positiveTtc90=round(a.positiveTtc90);
  return {accountRef:a.accountRef,status:'OBSERVED_90_DAY_RFM',lastPurchase:a.lastDate,rfm:scoreObservedRfm({recencyDays,tickets90:a.tickets90,positiveTtc90})};
 });
 const totalAccounts=rows.length,counts=rows.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{}),segmentCounts=rows.reduce((m,r)=>{const key=r.rfm?.segment||(r.status==='NO_PURCHASE_IN_OBSERVED_90_DAYS'?'NO_RECENT_PURCHASE':null);if(key)m[key]=(m[key]||0)+1;return m},{});
 if(page>Math.max(1,Math.ceil(totalAccounts/50)))throw Error('Page out of range');
 return {status:complete?'READY':'PARTIAL',basis:'OBSERVED_POSITIVE_90_DAY_PILOT_RANGES',asOf,startDate:start,storeIds:stores,coverage:{expectedStoreDays:expected,coveredStoreDays:covered.size,rejectedRanges,unmatchedPurchaseAccounts:unmatched.size},totalAccounts,counts,segmentCounts,page,pageSize:50,rows:allRows?rows:rows.slice((page-1)*50,page*50),activationEnabled:false};
}

export function isPreparedRfmRange(r,id,start,end){
 return r?.status==='READY'&&r.source==='D365/RetailTransactionSalesTransBIEntities'&&r.storeId===id&&r.startDate===start&&r.endDate===end&&r.diagnostics?.truncated===false&&r.diagnostics?.filterCoverage?.parentTransaction===true&&r.diagnostics?.mappedFields?.customer===true&&Array.isArray(r.customers);
}

// Daily customer-only aggregation, using the same eligible-sale and TTC functions as Analytics.
export function projectRfmDayRows(rows,{storeId,date,company,storeNumber,fields,eligible,amount,ticketKey}){
 const customers=new Map(),owners=new Map();
 for(const row of rows){
  if(String(row.dataAreaId??'').trim()!==company||String(row.store??'').trim()!==storeNumber||String(row[fields.date]??'').slice(0,10)!==date)throw Error('Invalid daily partition');
  if(!eligible(row))continue;
  const account=String(row[fields.customer]??'').trim();if(anonymous.has(account.toUpperCase()))continue;
  if(!/^CLT/i.test(account))continue;
  if(!String(row.terminalId??'').trim()||!String(row.transactionId??'').trim())throw Error('Missing ticket identity');
  const key=ticketKey(row),value=amount(row);
  if(!key||!Number.isFinite(value)||value<=0||!Number.isSafeInteger(Math.round(value*100)))throw Error('Invalid daily sale');
  if(owners.has(key)&&owners.get(key)!==account)throw Error('Conflicting account on ticket');owners.set(key,account);
  const c=customers.get(account)||{customerAccount:account,sales:0,ticketIds:new Set(),lastDate:date};c.sales+=value;c.ticketIds.add(key);customers.set(account,c);
 }
 return [...customers.values()].map(({ticketIds,...c})=>({...c,sales:round(c.sales),tickets:ticketIds.size}));
}

// Prefer complete non-overlapping 30-day evidence; otherwise reuse exact daily
// Analytics evidence before asking Dynamics for missing data.
export function selectPreparedRfmDays({partitions,cached,dayKey,rangeKey,readyStore}){
 const ranges=[],missing=[],unmappedStores=[];
 for(const p of partitions){
  if(!readyStore(p.id)){if(!unmappedStores.includes(p.id))unmappedStores.push(p.id);continue}
  const range=cached.get(rangeKey(p.id,p.start,p.end));if(isPreparedRfmRange(range,p.id,p.start,p.end)){ranges.push(range);continue}
  for(const date of p.days){const daily=cached.get(dayKey(p.id,date)),analytics=cached.get(rangeKey(p.id,date,date));if(isPreparedRfmRange(daily,p.id,date,date))ranges.push(daily);else if(isPreparedRfmRange(analytics,p.id,date,date))ranges.push(analytics);else missing.push({storeId:p.id,date})}
 }
 return {ranges,missing,unmappedStores};
}

export function summarizePreparedRfmEvidence(ranges,asOf){
 const accounts=new Map();
 for(const r of ranges){if(!isPreparedRfmRange(r,r.storeId,r.startDate,r.endDate))throw Error('Invalid preview range');const seen=new Set();for(const x of r.customers){if(typeof x.customerAccount!=='string'||seen.has(x.customerAccount)||!Number.isSafeInteger(x.tickets)||x.tickets<1||!Number.isFinite(x.sales)||x.sales<=0||!day(x.lastDate)||x.lastDate<r.startDate||x.lastDate>r.endDate)throw Error('Invalid preview customer');seen.add(x.customerAccount);if(!/^CLT/i.test(x.customerAccount))continue;const a=accounts.get(x.customerAccount)||{tickets:0,sales:0,lastDate:x.lastDate};a.tickets+=x.tickets;a.sales+=x.sales;if(x.lastDate>a.lastDate)a.lastDate=x.lastDate;accounts.set(x.customerAccount,a)}}
 let tickets=0,positiveTtc=0,recent=0,repeat=0,highValue=0;for(const a of accounts.values()){tickets+=a.tickets;positiveTtc+=a.sales;const recentPurchase=(stamp(asOf)-stamp(a.lastDate))/dayMs<=14;if(recentPurchase)recent++;if(recentPurchase&&a.tickets>=3)repeat++;if(recentPurchase&&a.tickets>=6&&a.sales>=1000)highValue++}
 return {basis:'PARTIAL_OBSERVED_MINIMA_NOT_RFM',observedAccounts:accounts.size,tickets,positiveTtc:round(positiveTtc),recent,repeat,highValue};
}
export function selectRfmSyncTargets(missing,blocked=new Set(),limit=2){return [...missing].filter(x=>!blocked.has(x.storeId+'|'+x.date)).sort((a,b)=>b.date.localeCompare(a.date)||a.storeId.localeCompare(b.storeId)).slice(0,limit)}

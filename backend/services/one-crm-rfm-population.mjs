// Population projection: the master is the left side, never only purchasers.
import {scoreObservedRfm} from './one-crm-customer-rfm.mjs';
const dayMs=86400000,round=n=>Math.round(n*100)/100,stamp=d=>Date.parse(d+'T00:00:00Z');
const day=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(stamp(d))&&new Date(stamp(d)).toISOString().slice(0,10)===d;
const anonymous=new Set(['','0','ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN']);
const source='D365/RetailTransactionSalesTransBIEntities';
export function projectRfmPopulation({accounts,stores,ranges,asOf,page=1}){
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
 const totalAccounts=rows.length,counts=rows.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{});
 if(page>Math.max(1,Math.ceil(totalAccounts/50)))throw Error('Page out of range');
 return {status:complete?'READY':'PARTIAL',basis:'OBSERVED_POSITIVE_90_DAY_PILOT_RANGES',asOf,startDate:start,storeIds:stores,coverage:{expectedStoreDays:expected,coveredStoreDays:covered.size,rejectedRanges,unmatchedPurchaseAccounts:unmatched.size},totalAccounts,counts,page,pageSize:50,rows:rows.slice((page-1)*50,page*50),activationEnabled:false};
}

export function isPreparedRfmRange(r,id,start,end){
 return r?.status==='READY'&&r.source==='D365/RetailTransactionSalesTransBIEntities'&&r.storeId===id&&r.startDate===start&&r.endDate===end&&r.diagnostics?.truncated===false&&r.diagnostics?.filterCoverage?.parentTransaction===true&&r.diagnostics?.mappedFields?.customer===true&&Array.isArray(r.customers);
}

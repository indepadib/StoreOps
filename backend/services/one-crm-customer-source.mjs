const ENTITY='CustTableCDREntities',SOURCE='D365/'+ENTITY,SIZE=50;
const clean=v=>String(v??'').trim();
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const fail=code=>Object.assign(new Error(code),{code});
const check=(company)=>{if(!clean(company))throw fail('CRM_COMPANY_NOT_CONFIGURED')};
export const isLoyaltyCustomerAccount=v=>typeof v==='string'&&/^CLT/i.test(v.trim());
// F&O OData implements prefix matching using an equality wildcard, not startswith().
export const loyaltyCustomerFilter=field=>field+" eq 'CLT*'";
const baseFilter=company=>"SysDataAreaId eq "+quote(company)+" and CustGroup eq 'Retail' and "+loyaltyCustomerFilter('AccountNum');
// Select only fields already exercised by the existing Analytics account reader.
const select='AccountNum,SysCreatedDateTime,SysDataAreaId';
function row(r,company){
 const accountRef=clean(r?.AccountNum),area=clean(r?.SysDataAreaId??r?.dataAreaId),date=clean(r?.SysCreatedDateTime);
 if(!isLoyaltyCustomerAccount(accountRef)||accountRef.length>160||/[\x00-\x1f]/.test(accountRef)||area!==company)throw fail('CRM_CUSTOMER_PARTITION_INVALID');
 return {accountRef,createdAt:Number.isFinite(Date.parse(date))?new Date(date).toISOString():null};
}
const common=()=>({status:'READY',source:SOURCE,scope:'LEGAL_ENTITY_RETAIL',checkedAt:new Date().toISOString(),identityBasis:'D365_LEGAL_ENTITY_ACCOUNT',historyStatus:'NOT_CONNECTED',activationEnabled:false});
// Compatibility fallback: only the previously working company/group query.
// Scan bounded source pages until enough CLT accounts have been seen. Never
// expose store accounts or treat an incomplete scan as a complete count.
export function isCltFilterRejected(error){return Number(error?.details?.httpStatus)===400}
export async function scanCltAccounts({company,read,search='',offset=0,limit=null}){
 check(company);
 const filter="SysDataAreaId eq "+quote(company)+" and CustGroup eq 'Retail'";
 const seen=new Set(),matched=[];let sourceOffset=0,matchedCount=0;
 const batch=500;
 for(let i=0;i<200;i++){
  const raw=await read(ENTITY,{filter,select,top:batch,extra:'cross-company=true&$orderby=AccountNum%20asc&$skip='+sourceOffset});
  if(!Array.isArray(raw?.value)||raw.value.length>batch)throw fail('CRM_CUSTOMER_RESPONSE_INVALID');
  if(!raw.value.length&&raw['@odata.nextLink'])throw fail('CRM_CUSTOMER_PAGE_INCOMPLETE');
  for(const r of raw.value){
   const accountRef=clean(r?.AccountNum),area=clean(r?.SysDataAreaId??r?.dataAreaId);
   if(!accountRef||accountRef.length>160||/[\x00-\x1f]/.test(accountRef)||area!==company)throw fail('CRM_CUSTOMER_PARTITION_INVALID');
   if(seen.has(accountRef))throw fail('CRM_CUSTOMER_DUPLICATE_PAGE');seen.add(accountRef);
   if(!isLoyaltyCustomerAccount(accountRef)||search&&!accountRef.toLowerCase().includes(search.toLowerCase()))continue;
   if(matchedCount++>=offset)matched.push(row(r,company));
   if(limit!==null&&matched.length>=limit)return {rows:matched,complete:false,total:null};
  }
  sourceOffset+=raw.value.length;
  if(raw.value.length<batch&&!raw['@odata.nextLink'])return {rows:matched,complete:true,total:matchedCount};
  if(sourceOffset>=100000)break;
 }
 throw fail('CRM_CUSTOMER_PAGE_INCOMPLETE');
}
export async function readDirectorySourcePage({company,page,search='',read}){
 check(company);
 if(/[\*?]/.test(search))throw fail('CRM_CUSTOMER_SEARCH_MISMATCH');
 const filter=baseFilter(company)+(search?" and AccountNum eq "+quote("*"+search+"*"):'');
 const extra='cross-company=true&$orderby=AccountNum%20asc&$skip='+((page-1)*SIZE);
 // Read at most 51 records; the lookahead makes count independent of page rendering.
 let raw;
 try{raw=await read(ENTITY,{filter,select,top:SIZE+1,extra})}
 catch(e){
  if(!isCltFilterRejected(e))throw e;
  const result=await scanCltAccounts({company,read,search,offset:(page-1)*SIZE,limit:SIZE+1});
  return {...common(),page,pageSize:SIZE,search,totalAccounts:null,matchedAccounts:null,hasMore:result.rows.length>SIZE,rows:result.rows.slice(0,SIZE)};
 }
 if(!Array.isArray(raw?.value)||raw.value.length>SIZE+1)throw fail('CRM_CUSTOMER_RESPONSE_INVALID');
 const rows=raw.value.map(r=>row(r,company));
 if(new Set(rows.map(r=>r.accountRef)).size!==rows.length)throw fail('CRM_CUSTOMER_DUPLICATE_PAGE');
 if(search&&rows.some(r=>!r.accountRef.toLowerCase().includes(search.toLowerCase())))throw fail('CRM_CUSTOMER_SEARCH_MISMATCH');
 if(raw['@odata.nextLink']&&rows.length<SIZE)throw fail('CRM_CUSTOMER_PAGE_INCOMPLETE');
 return {...common(),page,pageSize:SIZE,search,totalAccounts:null,matchedAccounts:null,hasMore:rows.length>SIZE||!!raw['@odata.nextLink'],rows:rows.slice(0,SIZE)};
}
export async function readDirectorySourceCount({company,read}){
 check(company);
 let raw;try{raw=await read(ENTITY,{filter:baseFilter(company),select:'AccountNum',top:1,extra:'cross-company=true&$count=true'})}catch(e){
  if(!isCltFilterRejected(e))throw e;
  const result=await scanCltAccounts({company,read});return {...common(),totalAccounts:result.total};
 }
 const n=raw?.['@odata.count'];
 if(!Array.isArray(raw?.value)||raw.value.length>1||!(typeof n==='number'||typeof n==='string'&&/^\d+$/.test(n))||!Number.isSafeInteger(Number(n))||Number(n)<raw.value.length||(Number(n)>0&&!raw.value.length)||raw.value.some(r=>!isLoyaltyCustomerAccount(clean(r.AccountNum))))throw fail('CRM_CUSTOMER_COUNT_UNAVAILABLE');
 return {...common(),totalAccounts:Number(n)};
}
export async function findDirectorySourceAccount({company,accountRef,read}){
 check(company);
 if(!isLoyaltyCustomerAccount(accountRef))return null;
 const raw=await read(ENTITY,{filter:"SysDataAreaId eq "+quote(company)+" and CustGroup eq 'Retail' and AccountNum eq "+quote(accountRef),select,top:2,extra:'cross-company=true'});
 if(!Array.isArray(raw?.value)||raw.value.length>1||raw['@odata.nextLink'])throw fail('CRM_CUSTOMER_LOOKUP_AMBIGUOUS');
 if(!raw.value.length)return null;
 const r=row(raw.value[0],company);if(r.accountRef!==accountRef)throw fail('CRM_CUSTOMER_PARTITION_INVALID');return r;
}
export function customerSourceError(e){
 const known=new Set(['D365_REQUEST_TIMEOUT','D365_CONTINUATION_INVALID','CRM_COMPANY_NOT_CONFIGURED','CRM_CUSTOMER_PARTITION_INVALID','CRM_CUSTOMER_RESPONSE_INVALID','CRM_CUSTOMER_DUPLICATE_PAGE','CRM_CUSTOMER_SEARCH_MISMATCH','CRM_CUSTOMER_PAGE_INCOMPLETE','CRM_CUSTOMER_COUNT_UNAVAILABLE','CRM_CUSTOMER_LOOKUP_AMBIGUOUS']);
 if(known.has(e?.code))return e.code;
 if(e?.code==='D365_REQUEST_FAILED'&&[400,401,403,404,429,500,502,503,504].includes(Number(e?.details?.httpStatus)))return 'CRM_D365_HTTP_'+Number(e.details.httpStatus);
 return 'CUSTOMER_MASTER_READ_FAILED';
}

// One bounded master page. Persist the cursor between invocations; never publish partial results.
export async function readMasterImportPage({company,read,offset=0,batch=250,mode='CLT'}){
 check(company);if(!Number.isSafeInteger(offset)||offset<0||offset>=100000||!Number.isSafeInteger(batch)||batch<1||batch>500||!['CLT','RETAIL'].includes(mode))throw fail('CRM_CUSTOMER_PAGE_INCOMPLETE');
 const filter=mode==='CLT'?baseFilter(company):"SysDataAreaId eq "+quote(company)+" and CustGroup eq 'Retail'";
 const raw=await read(ENTITY,{filter,select,top:batch,extra:'cross-company=true&$orderby=AccountNum%20asc&$skip='+offset});
 if(!Array.isArray(raw?.value)||raw.value.length>batch||!raw.value.length&&raw['@odata.nextLink'])throw fail('CRM_CUSTOMER_RESPONSE_INVALID');
 const seen=new Set(),rows=[];for(const r of raw.value){const accountRef=clean(r?.AccountNum),area=clean(r?.SysDataAreaId??r?.dataAreaId);if(!accountRef||accountRef.length>160||/[\x00-\x1f]/.test(accountRef)||area!==company||seen.has(accountRef))throw fail('CRM_CUSTOMER_PARTITION_INVALID');seen.add(accountRef);if(isLoyaltyCustomerAccount(accountRef))rows.push(row(r,company));else if(mode==='CLT')throw fail('CRM_CUSTOMER_PARTITION_INVALID')}
 return {rows,nextOffset:offset+raw.value.length,complete:raw.value.length<batch&&!raw['@odata.nextLink']};
}
export function advanceMasterImport(state,part){if(!state||!Array.isArray(state.rows)||!Array.isArray(part.rows)||!Number.isSafeInteger(part.nextOffset)||part.nextOffset<state.offset||part.nextOffset>=100000||!part.complete&&part.nextOffset===state.offset)throw fail('CRM_CUSTOMER_PAGE_INCOMPLETE');const rows=[...state.rows,...part.rows];if(new Set(rows.map(r=>r.accountRef)).size!==rows.length)throw fail('CRM_CUSTOMER_DUPLICATE_PAGE');return {...state,offset:part.nextOffset,rows,complete:part.complete};}

// Count the same source partition used by the cursor, without another full scan.
export async function readMasterImportControl({company,read,mode}){check(company);if(!['CLT','RETAIL'].includes(mode))throw fail('CRM_CUSTOMER_COUNT_UNAVAILABLE');const filter=mode==='CLT'?baseFilter(company):"SysDataAreaId eq "+quote(company)+" and CustGroup eq 'Retail'";const raw=await read(ENTITY,{filter,select:'AccountNum,SysDataAreaId',top:1,extra:'cross-company=true&$count=true'});const n=raw?.['@odata.count'];if(!Array.isArray(raw?.value)||raw.value.length>1||!(typeof n==='number'||typeof n==='string'&&/^\d+$/.test(n))||!Number.isSafeInteger(Number(n))||Number(n)<raw.value.length||(Number(n)>0&&!raw.value.length)||raw.value.some(r=>clean(r.SysDataAreaId??r.dataAreaId)!==company||!clean(r.AccountNum)||mode==='CLT'&&!isLoyaltyCustomerAccount(clean(r.AccountNum))))throw fail('CRM_CUSTOMER_COUNT_UNAVAILABLE');return Number(n);}

/** Coalesce only concurrent exact account reads; never cache a completed authorization lookup. */
export function createCustomerAccountSingleFlight(readAccount){
 const inflight=new Map();
 return ({company,accountRef,...options})=>{
  if(!isLoyaltyCustomerAccount(accountRef))return Promise.resolve(null);
  const key=JSON.stringify([company,accountRef]);
  if(inflight.has(key))return inflight.get(key);
  const task=Promise.resolve().then(()=>readAccount({company,accountRef,...options})).finally(()=>{if(inflight.get(key)===task)inflight.delete(key)});
  inflight.set(key,task);return task;
 };
}

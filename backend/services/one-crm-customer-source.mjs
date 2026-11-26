const ENTITY='CustTableCDREntities',SOURCE='D365/'+ENTITY,SIZE=50;
const clean=v=>String(v??'').trim();
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const fail=code=>Object.assign(new Error(code),{code});
const check=(company)=>{if(!clean(company))throw fail('CRM_COMPANY_NOT_CONFIGURED')};
const baseFilter=company=>"SysDataAreaId eq "+quote(company)+" and CustGroup eq 'Retail'";
// Select only fields already exercised by the existing Analytics account reader.
const select='AccountNum,SysCreatedDateTime,SysDataAreaId';
function row(r,company){
 const accountRef=clean(r?.AccountNum),area=clean(r?.SysDataAreaId??r?.dataAreaId),date=clean(r?.SysCreatedDateTime);
 if(!accountRef||accountRef.length>160||/[\x00-\x1f]/.test(accountRef)||area!==company)throw fail('CRM_CUSTOMER_PARTITION_INVALID');
 return {accountRef,createdAt:Number.isFinite(Date.parse(date))?new Date(date).toISOString():null};
}
const common=()=>({status:'READY',source:SOURCE,scope:'LEGAL_ENTITY_RETAIL',checkedAt:new Date().toISOString(),identityBasis:'D365_LEGAL_ENTITY_ACCOUNT',historyStatus:'NOT_CONNECTED',activationEnabled:false});
export async function readDirectorySourcePage({company,page,search='',read}){
 check(company);
 const filter=baseFilter(company)+(search?" and contains(AccountNum,"+quote(search)+")":'');
 const extra='cross-company=true&$orderby=AccountNum%20asc&$skip='+((page-1)*SIZE);
 // Read at most 51 records; the lookahead makes count independent of page rendering.
 const raw=await read(ENTITY,{filter,select,top:SIZE+1,extra});
 if(!Array.isArray(raw?.value)||raw.value.length>SIZE+1)throw fail('CRM_CUSTOMER_RESPONSE_INVALID');
 const rows=raw.value.map(r=>row(r,company));
 if(new Set(rows.map(r=>r.accountRef)).size!==rows.length)throw fail('CRM_CUSTOMER_DUPLICATE_PAGE');
 if(search&&rows.some(r=>!r.accountRef.toLowerCase().includes(search.toLowerCase())))throw fail('CRM_CUSTOMER_SEARCH_MISMATCH');
 if(raw['@odata.nextLink']&&rows.length<SIZE)throw fail('CRM_CUSTOMER_PAGE_INCOMPLETE');
 return {...common(),page,pageSize:SIZE,search,totalAccounts:null,matchedAccounts:null,hasMore:rows.length>SIZE||!!raw['@odata.nextLink'],rows:rows.slice(0,SIZE)};
}
export async function readDirectorySourceCount({company,read}){
 check(company);
 const raw=await read(ENTITY,{filter:baseFilter(company),select:'AccountNum',top:1,extra:'cross-company=true&$count=true'});
 const n=raw?.['@odata.count'];
 if(!Array.isArray(raw?.value)||raw.value.length>1||!(typeof n==='number'||typeof n==='string'&&/^\d+$/.test(n))||!Number.isSafeInteger(Number(n))||Number(n)<raw.value.length||(Number(n)>0&&!raw.value.length))throw fail('CRM_CUSTOMER_COUNT_UNAVAILABLE');
 return {...common(),totalAccounts:Number(n)};
}
export async function findDirectorySourceAccount({company,accountRef,read}){
 check(company);
 const raw=await read(ENTITY,{filter:baseFilter(company)+" and AccountNum eq "+quote(accountRef),select,top:2,extra:'cross-company=true'});
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

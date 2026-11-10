import {config} from '../config.mjs';
import {odataGetAll} from './dynamics.mjs';

const clean=v=>String(v??'').trim();
const identifier=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(v);
export function customerCreationMapping(env=process.env){
 return {entity:clean(env.D365_CUSTOMER_CREATION_ENTITY),idField:clean(env.D365_CUSTOMER_CREATION_ID_FIELD),dateField:clean(env.D365_CUSTOMER_CREATION_DATE_FIELD),storeField:clean(env.D365_CUSTOMER_CREATION_STORE_FIELD),staffField:clean(env.D365_CUSTOMER_CREATION_STAFF_FIELD),timeZone:clean(env.D365_CUSTOMER_CREATION_TIMEZONE),verified:env.D365_CUSTOMER_CREATION_VERIFIED==='true',networkStoreIds:clean(env.D365_CUSTOMER_CREATION_NETWORK_STORE_IDS).split(',').map(clean).filter(Boolean),evidence:clean(env.D365_CUSTOMER_CREATION_EVIDENCE)};
}
export function validCreationMapping(m){
 // Verification must attest account entity, network identity, creation semantics and full access.
 return m.verified&&!!m.evidence&&[m.entity,m.idField,m.dateField].every(identifier)&&/^(CreatedDateTime|CreatedOn)$/i.test(m.dateField)&&!/loyalty|card|enroll/i.test(m.entity)&&(!m.storeField||identifier(m.storeField))&&(!m.staffField||identifier(m.staffField))&&!!m.timeZone;
}
function unavailable(stores,reason,extra={}){
 return {status:'UNAVAILABLE',source:'D365_CUSTOMER_CREATION',recruitments:null,coverage:{complete:false,ready:0,total:stores.length,reason},stores:stores.map(s=>({storeId:s.id,storeName:s.name,status:'UNAVAILABLE',recruitments:null,staff:[],staffStatus:'UNAVAILABLE'})),...extra};
}
function validDay(day){return /^\d{4}-\d{2}-\d{2}$/.test(day||'')&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day}
export function reconcileCustomerCreations(rows,stores,{startDate,endDate,mapping:m,truncated=false}={}){
 if(!stores.length)return unavailable(stores,'NO_AUTHORIZED_STORES');
 if(!validDay(startDate)||!validDay(endDate)||startDate>endDate)return unavailable(stores,'INVALID_PERIOD');
 if(truncated)return unavailable(stores,'TRUNCATED');
 let date;
 try{date=new Intl.DateTimeFormat('en-CA',{timeZone:m.timeZone,year:'numeric',month:'2-digit',day:'2-digit'})}catch{return unavailable(stores,'INVALID_TIMEZONE')}
 const accounts=new Map();let duplicates=0,invalidRows=0;
 for(const row of rows){
  const id=clean(row[m.idField]),raw=clean(row[m.dateField]),stamp=Date.parse(raw);
  // Date.parse normalizes impossible dates (February 30) and 24:00 into another day.
  // Reject them before period filtering; they must never become certified creations.
  if(!id||!validDay(raw.slice(0,10))||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(raw)||!Number.isFinite(stamp)){invalidRows++;continue}
  const unit=clean(row[m.storeField]),staff=clean(row[m.staffField]),old=accounts.get(id);
  if(old){duplicates++;if(old.stamp<stamp)continue;if(old.stamp===stamp){if(old.unit!==unit)old.unit=null;if(old.staff!==staff)old.staff=null;continue}}
  accounts.set(id,{stamp,unit,staff});
 }
 // Missing identities/dates can hide a duplicate or an earlier creation: never certify a partial total.
 if(invalidRows)return unavailable(stores,'INVALID_ACCOUNT_ROWS',{diagnostics:{invalidRows,duplicates}});
 const unitStores=new Map();for(const s of stores){const unit=clean(s.unit);if(unit)unitStores.set(unit,[...(unitStores.get(unit)||[]),s.id])}
 const counts=new Map(stores.map(s=>[s.id,{count:0,staff:new Map(),unassignedStaff:0}]));
 let total=0,unassigned=0,outsideScope=0;
 for(const a of accounts.values()){
  const parts=Object.fromEntries(date.formatToParts(new Date(a.stamp)).map(x=>[x.type,x.value])),day=`${parts.year}-${parts.month}-${parts.day}`;
  if(day<startDate||day>endDate)continue;
  const matches=unitStores.get(a.unit)||[];
  if(!a.unit||matches.length>1){total++;unassigned++;continue}
  if(!matches.length){outsideScope++;continue}
  total++;const c=counts.get(matches[0]);c.count++;
  if(a.staff)c.staff.set(a.staff,(c.staff.get(a.staff)||0)+1);else c.unassignedStaff++;
 }
 const fullNetwork=Array.isArray(m.networkStoreIds)&&m.networkStoreIds.length>0&&m.networkStoreIds.length===stores.length&&m.networkStoreIds.every(id=>stores.some(s=>s.id===id));
 if(unassigned&&!fullNetwork)return unavailable(stores,'UNASSIGNED_CREATIONS_SCOPE_UNVERIFIED');
 const attributionComplete=!!m.storeField&&stores.every(s=>clean(s.unit))&&[...unitStores.values()].every(x=>x.length===1);
 return {status:'READY',source:`D365/${m.entity}`,entity:m.entity,dateField:m.dateField,dateMode:'CUSTOMER_ACCOUNT_CREATED',identityBasis:'NETWORK_CUSTOMER_ACCOUNT',startDate,endDate,recruitments:total,unassignedRecruitments:unassigned,coverage:{complete:true,ready:stores.length,total:stores.length,attributionComplete},diagnostics:{rows:rows.length,distinctAccounts:accounts.size,duplicates,invalidRows,outsideScope},stores:stores.map(s=>{const c=counts.get(s.id);return {storeId:s.id,storeName:s.name,status:attributionComplete?'READY':'UNAVAILABLE',recruitments:attributionComplete?c.count:null,staffStatus:attributionComplete&&m.staffField?'READY':'UNAVAILABLE',unassignedStaff:c.unassignedStaff,staff:attributionComplete&&m.staffField?[...c.staff].map(([staffId,recruitments])=>({staffId,recruitments})):[]}})};
}
export async function readCustomerCreations(stores,period={}, {mapping=customerCreationMapping(),read=odataGetAll,live=config.dynamics.mode==='live'}={}){
 if(!stores.length)return unavailable(stores,'NO_AUTHORIZED_STORES');
 if(!validDay(period.startDate)||!validDay(period.endDate)||period.startDate>period.endDate)return unavailable(stores,'INVALID_PERIOD');
 if(!live||!validCreationMapping(mapping))return unavailable(stores,!live?'D365_NOT_LIVE':'ACCOUNT_CREATION_MAPPING_UNVERIFIED');
 try{
  // Read account history before period filtering so a later duplicate never becomes a new account.
  // A future incremental source must preserve this earliest-creation invariant.
  const result=await read(mapping.entity,{select:[mapping.idField,mapping.dateField,mapping.storeField,mapping.staffField].filter(Boolean).join(','),extra:'cross-company=true',pageSize:1000,maxRows:100000,strict:true});
  if(!Array.isArray(result?.value))return unavailable(stores,'INVALID_D365_RESPONSE');
  return reconcileCustomerCreations(result.value,stores,{...period,mapping,truncated:!!result.truncated});
 }catch(error){return unavailable(stores,'D365_ACCOUNT_READ_FAILED',{error:{code:error.code||'D365_ACCOUNT_READ_FAILED',message:error.message}})}
}

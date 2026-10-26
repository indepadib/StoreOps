import {config} from '../config.mjs';
import {odataGetAll,probeDataEntity} from './dynamics.mjs';
import {resolveWorkers} from './dynamics-staff-performance.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
const esc=v=>String(v).replaceAll("'","''");
export async function enrichDecisionNames(customers=[],cashiers=[]){
 if(config.dynamics.mode!=='live')return{status:'UNAVAILABLE'};
 const ids=[...new Set(customers.map(x=>x.customerAccount).filter(Boolean))],staffIds=[...new Set(cashiers.map(x=>x.staffId).filter(Boolean))];
 const [names,workers]=await Promise.all([customerNames(ids),resolveWorkers(staffIds).catch(()=>({map:new Map()}))]);
 for(const c of customers){c.customerName=names.get(c.customerAccount)||null;c.customerNameStatus=c.customerName?'RESOLVED':'UNRESOLVED'}
 for(const c of cashiers){c.name=workers.map.get(c.staffId)?.name||null;c.nameStatus=c.name?'RESOLVED':'UNRESOLVED'}
 return{customersResolved:customers.filter(c=>c.customerName).length,cashiersResolved:cashiers.filter(c=>c.name).length};
}
async function customerNames(ids){
 const out=new Map();if(!ids.length)return out;
 const entity=process.env.D365_CUSTOMER_ENTITY||'CustomersV3';let fields;
 try{const p=await probeDataEntity(entity,{top:1,extra:'cross-company=true'}),r=p.rows?.[0]||{},keys=Object.keys(r),pick=names=>names.find(k=>keys.includes(k));fields={id:pick(['CustomerAccount','CustomerAccountNumber','AccountNum']),org:pick(['OrganizationName','Name']),first:pick(['PersonFirstName','FirstName']),last:pick(['PersonLastName','LastName']),company:pick([config.dynamics.dataAreaField,'dataAreaId'])};if(!fields.id)return out;}catch{return out}
 let next=0;const batches=[];for(let i=0;i<ids.length;i+=50)batches.push(ids.slice(i,i+50));
 const work=async()=>{while(next<batches.length){const batch=batches[next++],key=analyticsCacheKey('customer-names-v1',[config.dynamics.dataAreaId,...batch.sort()]);try{let names=await readAnalyticsCache(key);if(!names){const r=await odataGetAll(entity,{filter:[`(${batch.map(id=>`${fields.id} eq '${esc(id)}'`).join(' or ')})`,fields.company&&config.dynamics.dataAreaId?`${fields.company} eq '${esc(config.dynamics.dataAreaId)}'`:''].filter(Boolean).join(' and '),select:Object.values(fields).filter(Boolean).join(','),extra:'cross-company=true',pageSize:200,maxRows:1000});if(r.truncated)continue;names=r.value.map(r=>[String(r[fields.id]),String(r[fields.org]||[r[fields.first],r[fields.last]].filter(Boolean).join(' ')).trim()]).filter(x=>x[1]);await writeAnalyticsCache(key,'customer-names-v1',names,3600)}for(const [id,name] of names)out.set(id,name)}catch{}}};await Promise.all(Array.from({length:Math.min(3,batches.length)},work));return out;
}

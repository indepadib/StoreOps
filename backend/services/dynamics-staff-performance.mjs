import {config} from '../config.mjs';
import {odataGetAll,probeDataEntity} from './dynamics.mjs';
import {salesIntegrationConfig} from './dynamics-sales.mjs';
import {readStoreLoyaltyRecruitmentsByStaff,readStoreLoyaltyEnrollments} from './dynamics-loyalty.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;
const dateOnly=v=>/^\d{4}-\d{2}-\d{2}/.test(clean(v))?clean(v).slice(0,10):null;
const nextDate=(day,offset)=>{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
const cache=new Map();
const cacheMs=()=>Math.max(60_000,Math.min(900_000,Number(process.env.STOREOPS_STAFF_PERFORMANCE_CACHE_MS)||180_000));
const identifiedCustomer=v=>{const x=clean(v).toUpperCase();return !!x&&!['ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN','0'].includes(x)};

function dateRange(field,start,end,mode){
 if(String(mode||'').toLowerCase()==='date')return `${field} ge ${start} and ${field} le ${end}`;
 const after=nextDate(end,1);return `${field} ge ${start}T00:00:00Z and ${field} lt ${after}T00:00:00Z`
}
function keyMatch(row,candidates=[]){const keys=Object.keys(row||{});for(const c of candidates){const k=keys.find(x=>x.toLowerCase()===String(c).toLowerCase());if(k)return k}return null}
function workerEntities(){return [...new Set([clean(process.env.D365_WORKER_ENTITY),'Workers','EmployeesV2','HcmWorkers'].filter(Boolean))]}
async function workerSchema(){
 for(const entity of workerEntities()){
  try{
   const probe=await probeDataEntity(entity,{top:1,extra:config.dynamics.dataAreaId?'cross-company=true':''}),row=probe?.rows?.[0]||null;if(!probe?.ok||!row)continue;
   const personnel=keyMatch(row,[process.env.D365_WORKER_PERSONNEL_FIELD,'PersonnelNumber','WorkerPersonnelNumber','EmployeeId','StaffId']);
   if(!personnel)continue;
   return{entity,personnel,first:keyMatch(row,[process.env.D365_WORKER_FIRST_NAME_FIELD,'FirstName']),last:keyMatch(row,[process.env.D365_WORKER_LAST_NAME_FIELD,'LastName']),name:keyMatch(row,[process.env.D365_WORKER_NAME_FIELD,'Name','WorkerName','EmployeeName','PersonName']),status:keyMatch(row,['WorkerStatus','EmploymentStatus','Status'])}
  }catch{}
 }
 return null
}
async function resolveWorkers(staffIds=[]){
 const ids=[...new Set(staffIds.map(clean).filter(Boolean))],out=new Map();if(!ids.length)return{status:'EMPTY',map:out,schema:null};
 const schema=await workerSchema();if(!schema)return{status:'UNMAPPED',map:out,schema:null};
 const fields=[schema.personnel,schema.first,schema.last,schema.name,schema.status,config.dynamics.dataAreaId?config.dynamics.dataAreaField:null].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 try{
  for(let i=0;i<ids.length;i+=25){
   const chunk=ids.slice(i,i+25),filterParts=[`(${chunk.map(id=>`${schema.personnel} eq '${esc(id)}'`).join(' or ')})`];if(config.dynamics.dataAreaId)filterParts.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
   const r=await odataGetAll(schema.entity,{filter:filterParts.join(' and '),select:fields,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:100,maxRows:1000});
   for(const row of r.value||[]){const id=clean(row[schema.personnel]);if(!id)continue;const first=clean(schema.first?row[schema.first]:''),last=clean(schema.last?row[schema.last]:''),full=clean(schema.name?row[schema.name]:'')||[first,last].filter(Boolean).join(' ')||id;out.set(id,{staffId:id,firstName:first||null,lastName:last||null,name:full,status:schema.status?clean(row[schema.status])||null:null})}
  }
  return{status:'READY',map:out,schema}
 }catch(error){return{status:'ERROR',map:out,schema,error:{code:error?.code||'D365_WORKER_READ_FAILED',message:error?.message||String(error)}}}
}


function minuteRank(v){
 const raw=clean(v);if(!raw)return 9999;const m=raw.match(/^(\d{1,2}):(\d{2})/);if(m){const h=Number(m[1]),mi=Number(m[2]);return h*60+mi}
 if(/^\d+$/.test(raw)){const d=raw.padStart(4,'0'),h=Number(d.slice(0,2)),mi=Number(d.slice(2,4));if(h<=23&&mi<=59)return h*60+mi}
 return 9999
}
export function attributeRecruitmentsToStaff(rows=[],enrollments=[],{
 staffField='StaffId',customerField='custAccount',transactionField='transactionId',dateField='businessDate',timeField='time',statusField='transactionStatus',netField='netAmountInclTax',salesSign=-1
}={}){
 const enrolled=new Map((enrollments||[]).map(x=>[clean(x.customerAccount),{...x,enrollmentDay:dateOnly(x.enrollmentDate)}]).filter(([k])=>identifiedCustomer(k))),firstByCustomer=new Map();
 for(const row of rows||[]){
  const status=clean(statusField?row?.[statusField]:'').toUpperCase();if(['VOIDED','CANCELLED','CANCELED'].includes(status))continue;
  const sales=round2(num(row?.[netField])*Number(salesSign||-1));if(!(sales>0))continue;
  const customer=clean(customerField?row?.[customerField]:'');if(!identifiedCustomer(customer)||!enrolled.has(customer))continue;
  const staffId=clean(row?.[staffField]),day=dateOnly(dateField?row?.[dateField]:null);if(!staffId||!day)continue;
  const enrollment=enrolled.get(customer);if(enrollment.enrollmentDay&&day<enrollment.enrollmentDay)continue;
  const candidate={customerAccount:customer,staffId,transactionId:clean(transactionField?row?.[transactionField]:''),businessDate:day,time:clean(timeField?row?.[timeField]:''),minute:minuteRank(timeField?row?.[timeField]:'')};
  const current=firstByCustomer.get(customer);
  if(!current||candidate.businessDate<current.businessDate||(candidate.businessDate===current.businessDate&&candidate.minute<current.minute))firstByCustomer.set(customer,candidate)
 }
 const byStaff=new Map();for(const x of firstByCustomer.values())byStaff.set(x.staffId,(byStaff.get(x.staffId)||0)+1);
 return{byStaff,matchedCustomers:firstByCustomer.size,totalEnrollments:enrolled.size,unmatchedCustomers:Math.max(0,enrolled.size-firstByCustomer.size),items:[...firstByCustomer.values()]}
}
export function aggregateCashierRows(rows=[],{
 staffField='StaffId',transactionField='transactionId',netField='netAmountInclTax',customerField='custAccount',dateField='businessDate',statusField='transactionStatus',salesSign=-1
}={}){
 const map=new Map(),unassigned={rows:0,sales:0};
 for(const row of rows||[]){
  const rowStatus=clean(statusField?row?.[statusField]:'').toUpperCase();if(['VOIDED','CANCELLED','CANCELED'].includes(rowStatus))continue;
  const sales=round2(num(row?.[netField])*Number(salesSign||-1));if(!(sales>0))continue;
  const staffId=clean(row?.[staffField]);if(!staffId){unassigned.rows++;unassigned.sales+=sales;continue}
  const tx=clean(row?.[transactionField]),identified=identifiedCustomer(customerField?row?.[customerField]:'');
  const cur=map.get(staffId)||{staffId,sales:0,rowCount:0,tickets:new Set(),identifiedTickets:new Set(),identifiedSales:0,activeDays:new Set()};
  cur.sales+=sales;cur.rowCount++;if(tx)cur.tickets.add(tx);if(identified){cur.identifiedSales+=sales;if(tx)cur.identifiedTickets.add(tx)}const d=dateOnly(dateField?row?.[dateField]:null);if(d)cur.activeDays.add(d);map.set(staffId,cur)
 }
 const items=[...map.values()].map(x=>{const tickets=x.tickets.size,identifiedTickets=x.identifiedTickets.size;return{staffId:x.staffId,sales:round2(x.sales),tickets,averageBasket:tickets?round2(x.sales/tickets):null,identifiedSales:round2(x.identifiedSales),identifiedSalesShare:x.sales?round2(x.identifiedSales/x.sales*100):null,identifiedTickets,identifiedTicketRate:tickets?round2(identifiedTickets/tickets*100):null,nonLoyaltyTickets:Math.max(0,tickets-identifiedTickets),activeDays:x.activeDays.size,rowCount:x.rowCount,recruitments:null,recruitmentRateNonLoyalty:null,recruitmentStatus:'EXACT_STAFF_ENROLLMENT_SOURCE_REQUIRED'}}).sort((a,b)=>b.sales-a.sales||b.tickets-a.tickets);
 return{items,unassigned:{rows:unassigned.rows,sales:round2(unassigned.sales)}}
}

export async function readStoreCashierPerformance(storeId,{businessDate=new Date().toISOString().slice(0,10),days=30,force=false}={}){
 const end=dateOnly(businessDate)||new Date().toISOString().slice(0,10),windowDays=Math.max(1,Math.min(90,Number(days)||30)),start=nextDate(end,-(windowDays-1)),cacheKey=`${storeId}|${start}|${end}|${windowDays}`;
 const hit=cache.get(cacheKey);if(!force&&hit&&Date.now()<hit.expiresAt)return{...hit.value,cache:{status:'HIT'}};
 const c=salesIntegrationConfig(storeId),staffField=clean(c.fields?.staff)||clean(process.env.D365_SALES_STAFF_FIELD)||'StaffId';
 if(!c.ready)return{status:'UNAVAILABLE',storeId,businessDate:end,windowDays,items:[],source:'D365_SALES_UNAVAILABLE',missing:c.missing||[]};
 const select=[staffField,c.fields.transaction,c.fields.net,c.fields.customer,c.fields.date,c.fields.time,c.fields.status,c.fields.store,config.dynamics.dataAreaId?config.dynamics.dataAreaField:null].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const identifiers=c.storeFilterCandidates?.length?c.storeFilterCandidates:[{kind:'RETAIL_CHANNEL',value:c.retailId}],modes=[c.dateFilterMode,c.dateFilterMode==='date'?'datetime':'date'];
 let rows=null,selected=null,lastError=null;
 outer:for(const identifier of identifiers){for(const mode of [...new Set(modes)]){
  try{
   const filters=[`${c.fields.store} eq '${esc(identifier.value)}'`,dateRange(c.fields.date,start,end,mode)];if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
   const r=await odataGetAll(c.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize,maxRows:c.maxRows});
   rows=r.value||[];selected={identifier,mode,rowCount:r.rowCount||rows.length,pages:r.pages||0,truncated:!!r.truncated};break outer
  }catch(error){lastError=error}
 }}
 if(!rows)return{status:'UNAVAILABLE',storeId,businessDate:end,windowDays,items:[],source:`D365/${c.entity}`,staffField,error:{code:lastError?.code||'D365_STAFF_SALES_READ_FAILED',message:lastError?.message||String(lastError||'Lecture StaffId impossible')}};
 const aggregated=aggregateCashierRows(rows,{staffField,transactionField:c.fields.transaction,netField:c.fields.net,customerField:c.fields.customer,dateField:c.fields.date,statusField:c.fields.status,salesSign:c.sign}),[worker,enrollments,loyaltyStaff]=await Promise.all([resolveWorkers(aggregated.items.map(x=>x.staffId)),readStoreLoyaltyEnrollments(storeId,{startDate:start,endDate:end}).catch(error=>({status:'UNAVAILABLE',items:[],error:{message:error?.message||String(error)}})),readStoreLoyaltyRecruitmentsByStaff(storeId,{startDate:start,endDate:end}).catch(error=>({status:'UNAVAILABLE',items:[],error:{message:error?.message||String(error)}}))]),txAttribution=enrollments.status==='READY'?attributeRecruitmentsToStaff(rows,enrollments.items||[],{staffField,customerField:c.fields.customer,transactionField:c.fields.transaction,dateField:c.fields.date,timeField:c.fields.time,statusField:c.fields.status,netField:c.fields.net,salesSign:c.sign}):null,fallbackByStaff=new Map((loyaltyStaff.items||[]).map(x=>[clean(x.staffId),Number(x.recruitments||0)])),recruitmentMode=txAttribution?'ENROLLMENT_CUSTOMER_X_TRANSACTION_STAFF':loyaltyStaff.status==='READY'?'ENROLLMENT_DIRECT_STAFF':'UNAVAILABLE',minRateTickets=Math.max(5,Math.min(200,Number(process.env.STOREOPS_CASHIER_RATE_MIN_TICKETS)||20)),items=aggregated.items.map(x=>{const w=worker.map.get(x.staffId),recruitments=txAttribution?(txAttribution.byStaff.get(x.staffId)||0):loyaltyStaff.status==='READY'?(fallbackByStaff.get(x.staffId)||0):null;return{...x,name:w?.name||x.staffId,firstName:w?.firstName||null,lastName:w?.lastName||null,rateEligible:x.tickets>=minRateTickets,recruitments,recruitmentRateNonLoyalty:recruitments!=null&&x.nonLoyaltyTickets>0?round2(recruitments/x.nonLoyaltyTickets*100):recruitments===0&&x.nonLoyaltyTickets>0?0:null,recruitmentStatus:recruitmentMode}}).sort((a,b)=>b.sales-a.sales||b.tickets-a.tickets),unassigned=aggregated.unassigned;
 const leaders={topSales:[...items].sort((a,b)=>b.sales-a.sales)[0]||null,topTickets:[...items].sort((a,b)=>b.tickets-a.tickets)[0]||null,topIdentification:[...items].filter(x=>x.rateEligible&&x.identifiedTicketRate!=null).sort((a,b)=>b.identifiedTicketRate-a.identifiedTicketRate||b.tickets-a.tickets)[0]||null,topRecruitment:recruitmentMode!=='UNAVAILABLE'?[...items].sort((a,b)=>Number(b.recruitments||0)-Number(a.recruitments||0)||b.nonLoyaltyTickets-a.nonLoyaltyTickets)[0]||null:null};
 const value={status:selected?.truncated?'TRUNCATED':'READY',source:`D365/${c.entity}`,storeId,businessDate:end,startDate:start,endDate:end,windowDays,staffField,items,leaders,summary:{cashiers:items.length,sales:round2(items.reduce((s,x)=>s+x.sales,0)),tickets:items.reduce((s,x)=>s+x.tickets,0),unassignedRows:unassigned.rows,unassignedSales:round2(unassigned.sales),rateEligibilityMinTickets:minRateTickets,workerDirectoryStatus:worker.status,recruitmentStatus:recruitmentMode,loyaltyStaffField:loyaltyStaff.staffField||null,enrollmentCustomerField:enrollments.customerField||null,matchedRecruitments:txAttribution?.matchedCustomers??null,unmatchedRecruitments:txAttribution?.unmatchedCustomers??null},diagnostics:{entity:c.entity,storeIdentifierKind:selected?.identifier?.kind||null,storeIdentifier:selected?.identifier?.value||null,dateFilterMode:selected?.mode||null,rowCount:selected?.rowCount||rows.length,pages:selected?.pages||0,truncated:!!selected?.truncated,workerEntity:worker.schema?.entity||null,workerPersonnelField:worker.schema?.personnel||null,loyaltyStaffSource:loyaltyStaff.source||null,loyaltyStaffStatus:loyaltyStaff.status||null,enrollmentSource:enrollments.source||null,enrollmentStatus:enrollments.status||null,recruitmentAttributionMode:recruitmentMode}};
 cache.set(cacheKey,{value,expiresAt:Date.now()+cacheMs()});return{...value,cache:{status:'MISS'}}
}

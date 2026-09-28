import { config } from '../config.mjs';
import { odataGetAll,probeDataEntity } from './dynamics.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const valid=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
let resolvedEntity=null,resolvedMode=null;

function nextDate(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function configView(){return{
 entities:[clean(process.env.D365_LOYALTY_CARD_ENTITY), 'RetailLoyaltyCardEntity','RetailLoyaltyCards'].filter((v,i,a)=>v&&a.indexOf(v)===i),
 cardField:clean(process.env.D365_LOYALTY_CARD_FIELD)||'CardNumber',
 dateField:clean(process.env.D365_LOYALTY_ENROLLMENT_DATE_FIELD)||'LoyaltyEnrollmentDate',
 localDateField:clean(process.env.D365_LOYALTY_ENROLLMENT_LOCAL_DATE_FIELD)||'LoyaltyEnrollmentDateLocal',
 operatingUnitField:clean(process.env.D365_LOYALTY_OPERATING_UNIT_FIELD)||'OmOperatingUnitNumber',
 staffField:clean(process.env.D365_LOYALTY_STAFF_FIELD)||null
}}

function requireFields(c){for(const [k,v] of Object.entries(c)){if(k==='entities')continue;if(!valid(v))throw Object.assign(new Error('Mapping fidélité invalide : '+k),{status:503,code:'D365_LOYALTY_MAPPING_INVALID'})}}

function queryVariants(c,unit,date){
 const unitFilter=c.operatingUnitField+" eq '"+esc(unit)+"'",next=nextDate(date);
 return [
  {mode:'LOCAL_DATE_LITERAL',filter:unitFilter+' and '+c.localDateField+' eq '+date,select:[c.cardField,c.localDateField,c.operatingUnitField]},
  {mode:'LOCAL_DATE_STRING',filter:unitFilter+" and "+c.localDateField+" eq '"+esc(date)+"'",select:[c.cardField,c.localDateField,c.operatingUnitField]},
  {mode:'UTC_DATE_RANGE',filter:unitFilter+' and '+c.dateField+' ge '+date+'T00:00:00Z and '+c.dateField+' lt '+next+'T00:00:00Z',select:[c.cardField,c.dateField,c.operatingUnitField]}
 ]
}


function inferredStaffField(row,configured=null){
 const keys=Object.keys(row||{});if(configured){const exact=keys.find(k=>k.toLowerCase()===String(configured).toLowerCase());if(exact)return exact}
 const exactCandidates=['staffid','createdbystaffid','workerpersonnelnumber','personnelnumber','employeeid','cashierid','operatorid','createdbyworkerid'];
 return keys.find(k=>exactCandidates.includes(k.toLowerCase()))||null
}
function dateRangeVariants(c,unit,startDate,endDate){
 const after=nextDate(endDate),unitFilter=c.operatingUnitField+" eq '"+esc(unit)+"'";
 return[
  {mode:'UTC_DATE_RANGE',filter:unitFilter+' and '+c.dateField+' ge '+startDate+'T00:00:00Z and '+c.dateField+' lt '+after+'T00:00:00Z',dateField:c.dateField},
  {mode:'LOCAL_DATE_RANGE_LITERAL',filter:unitFilter+' and '+c.localDateField+' ge '+startDate+' and '+c.localDateField+' le '+endDate,dateField:c.localDateField},
  {mode:'LOCAL_DATE_RANGE_STRING',filter:unitFilter+" and "+c.localDateField+" ge '"+esc(startDate)+"' and "+c.localDateField+" le '"+esc(endDate)+"'",dateField:c.localDateField}
 ]
}
export async function readStoreLoyaltyRecruitmentsByStaff(storeId,{startDate,endDate}={}){
 if(config.dynamics.mode!=='live')return{status:'UNAVAILABLE',storeId,startDate,endDate,items:[],source:'LOYALTY_NOT_LIVE'};
 const c=configView();requireFields(c);const settings=storeOperationalSettings(storeId),unit=clean(settings?.d365?.operatingUnitNumber);
 if(!unit)return{status:'UNAVAILABLE',storeId,startDate,endDate,items:[],source:'OPERATING_UNIT_UNMAPPED'};
 const start=clean(startDate),end=clean(endDate);if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return{status:'UNAVAILABLE',storeId,startDate:start,endDate:end,items:[],source:'LOYALTY_DATE_RANGE_INVALID'};
 const entities=resolvedEntity?[resolvedEntity,...c.entities.filter(x=>x!==resolvedEntity)]:c.entities;let lastError=null;
 for(const entity of entities){
  if(!/^[A-Za-z0-9_]+$/.test(entity))continue;
  let staffField=c.staffField;
  try{
   const probe=await probeDataEntity(entity,{top:5,filter:c.operatingUnitField+" eq '"+esc(unit)+"'",extra:config.dynamics.dataAreaId?'cross-company=true':''});
   const sample=probe?.rows?.[0]||null;staffField=inferredStaffField(sample,staffField);
  }catch{}
  if(!staffField)continue;
  for(const q of dateRangeVariants(c,unit,start,end)){
   try{
    const select=[c.cardField,q.dateField,c.operatingUnitField,staffField].filter(Boolean).join(','),r=await odataGetAll(entity,{filter:q.filter,select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:500,maxRows:20000}),byStaff=new Map(),seenCards=new Set();
    for(const row of r.value||[]){const card=clean(row[c.cardField]),staffId=clean(row[staffField]);if(!card||!staffId||seenCards.has(card))continue;seenCards.add(card);byStaff.set(staffId,(byStaff.get(staffId)||0)+1)}
    resolvedEntity=entity;return{status:'READY',storeId,startDate:start,endDate:end,source:'D365/'+entity,entity,dateMode:q.mode,operatingUnit:unit,staffField,rowCount:r.rowCount||0,pages:r.pages||0,truncated:!!r.truncated,total:seenCards.size,items:[...byStaff.entries()].map(([staffId,recruitments])=>({staffId,recruitments})).sort((a,b)=>b.recruitments-a.recruitments)}
   }catch(error){lastError=error}
  }
 }
 return{status:'UNAVAILABLE',storeId,startDate:start,endDate:end,items:[],source:'D365_LOYALTY_STAFF_UNMAPPED',error:{code:lastError?.code||'D365_LOYALTY_STAFF_READ_FAILED',message:lastError?.message||'Aucun StaffId fiable détecté sur la source enrôlement.'}}
}

export async function readStoreLoyaltyRecruitments(storeId,{businessDate}={}){
 if(config.dynamics.mode!=='live')return{status:'UNAVAILABLE',storeId,businessDate,recruitments:null,source:'LOYALTY_NOT_LIVE'};
 const c=configView();requireFields(c);
 const settings=storeOperationalSettings(storeId),unit=clean(settings?.d365?.operatingUnitNumber);
 if(!unit)return{status:'UNAVAILABLE',storeId,businessDate,recruitments:null,source:'OPERATING_UNIT_UNMAPPED'};
 const entities=resolvedEntity?[resolvedEntity,...c.entities.filter(x=>x!==resolvedEntity)]:c.entities,variants=queryVariants(c,unit,businessDate);let lastError=null;
 for(const entity of entities){if(!/^[A-Za-z0-9_]+$/.test(entity))continue;const modes=resolvedMode?[variants.find(x=>x.mode===resolvedMode),...variants.filter(x=>x.mode!==resolvedMode)].filter(Boolean):variants;
  for(const q of modes){try{const r=await odataGetAll(entity,{filter:q.filter,select:q.select.join(','),extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:500,maxRows:10000}),cards=new Set((r.value||[]).map(x=>clean(x[c.cardField])).filter(Boolean));resolvedEntity=entity;resolvedMode=q.mode;return{status:'READY',storeId,businessDate,recruitments:cards.size,source:'D365/'+entity,entity,dateMode:q.mode,operatingUnit:unit,rowCount:r.rowCount||0,pages:r.pages||0,truncated:!!r.truncated}}catch(error){lastError=error}
  }
 }
 return{status:'UNAVAILABLE',storeId,businessDate,recruitments:null,source:'D365_LOYALTY_UNMAPPED',error:{code:lastError?.code||'D365_LOYALTY_READ_FAILED',message:lastError?.message||String(lastError||'Lecture fidélité indisponible')}}
}

export function loyaltyIntegrationConfig(){const c=configView();return{...c,resolvedEntity,resolvedMode}}

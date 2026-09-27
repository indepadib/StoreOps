import { config } from '../config.mjs';
import { odataGetAll } from './dynamics.mjs';
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
 operatingUnitField:clean(process.env.D365_LOYALTY_OPERATING_UNIT_FIELD)||'OmOperatingUnitNumber'
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

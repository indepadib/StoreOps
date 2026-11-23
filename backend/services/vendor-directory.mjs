import {config} from '../config.mjs';
import {probeDataEntity,odataGetAll} from './dynamics.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const cache=new Map();
let schemaCache=null;
const ttl=6*60*60*1000;
const schemaTtl=30*60*1000;
const accountCandidates=['VendorAccountNumber','VendorAccount','AccountNumber','VendorNumber','VendAccount'];
const nameCandidates=['VendorOrganizationName','VendorName','OrganizationName','PartyName','Name','SearchName'];
const personCandidates=['VendorPersonFirstName','VendorPersonMiddleName','VendorPersonLastName'];
const cacheContext=()=>[config.dynamics.mode,config.dynamics.dataAreaId,config.dynamics.dataAreaField,clean(process.env.D365_VENDOR_ENTITY)].join('|');
const cacheKey=account=>cacheContext()+'|'+clean(account).toUpperCase();

function pickField(row,candidates){
 const keys=Object.keys(row||{});
 for(const wanted of candidates){const hit=keys.find(k=>k.toLowerCase()===wanted.toLowerCase());if(hit)return hit}
 return null
}
async function schema(){
 const context=cacheContext();
 if(schemaCache?.context===context&&Date.now()<schemaCache.expiresAt)return schemaCache.value;
 if(config.dynamics.mode!=='live')return null;
 const entities=[clean(process.env.D365_VENDOR_ENTITY),'VendorsV2','Vendors'].filter(Boolean);
 for(const entity of [...new Set(entities)]){
  try{
   const companyFilter=config.dynamics.dataAreaId?`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`:'';
   const probe=await probeDataEntity(entity,{top:5,filter:companyFilter,extra:config.dynamics.dataAreaId?'cross-company=true':''});
   const rows=(probe?.rows||[]).filter(row=>row&&Object.keys(row).length);if(!probe?.ok||!rows.length)continue;
   const fields=Object.assign({},...rows);
   const accountFields=accountCandidates.map(candidate=>pickField(fields,[candidate])).filter(Boolean);
   const accountField=accountFields.find(field=>rows.some(row=>clean(row[field])))||accountFields[0];
   const nameFields=nameCandidates.map(candidate=>pickField(fields,[candidate])).filter(Boolean);
   const personFields=personCandidates.map(candidate=>pickField(fields,[candidate])).filter(Boolean);
   const companyField=pickField(fields,[config.dynamics.dataAreaField,'dataAreaId']);
   if(accountField&&(nameFields.length||personFields.length)){const value={entity,accountField,nameFields,personFields,companyField};schemaCache={context,value,expiresAt:Date.now()+schemaTtl};return value}
  }catch{}
 }
 return null
}

export async function vendorNamesMany(accounts=[]){
 const wanted=[...new Set((accounts||[]).map(clean).filter(Boolean))],out=new Map(),pending=[];
 for(const account of wanted){const hit=cache.get(cacheKey(account));if(hit&&Date.now()<hit.expiresAt)out.set(account,hit.value);else pending.push(account)}
 if(!pending.length)return out;
 const s=await schema();if(!s){for(const account of pending)out.set(account,null);return out}
 for(let i=0;i<pending.length;i+=40){
  const chunk=pending.slice(i,i+40),filters=[`(${chunk.map(x=>`${s.accountField} eq '${esc(x)}'`).join(' or ')})`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
  try{
   const fields=[...new Set([s.accountField,...s.nameFields,...s.personFields,s.companyField].filter(Boolean))];
   const payload=await odataGetAll(s.entity,{filter:filters.join(' and '),select:fields.join(','),extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:100,maxRows:1000});
   for(const row of payload.value||[]){
    const account=clean(row[s.accountField]);
    const matching=chunk.filter(requested=>requested.toUpperCase()===account.toUpperCase());
    if(!account||!matching.length||s.companyField&&config.dynamics.dataAreaId&&clean(row[s.companyField]).toUpperCase()!==clean(config.dynamics.dataAreaId).toUpperCase())continue;
    const usableName=field=>clean(row[field])&&clean(row[field]).toUpperCase()!==account.toUpperCase();
    const nameField=s.nameFields.find(field=>field.toLowerCase()!=='searchname'&&usableName(field));
    const personName=s.personFields.map(field=>clean(row[field])).filter(Boolean).join(' ');
    const searchField=s.nameFields.find(field=>field.toLowerCase()==='searchname'&&usableName(field));
    const name=nameField?clean(row[nameField]):personName||clean(row[searchField])||null;
    if(!name)continue;
    const value={account,name,source:`D365/${s.entity}`,nameField:nameField||(personName?s.personFields.join('+'):searchField)};
    for(const requested of matching){cache.set(cacheKey(requested),{value,expiresAt:Date.now()+ttl});out.set(requested,value)}
   }
   for(const account of chunk)if(!out.has(account)){
    if(!payload.truncated)cache.set(cacheKey(account),{value:null,expiresAt:Date.now()+60*1000});
    out.set(account,null);
   }
  }catch{for(const account of chunk)if(!out.has(account))out.set(account,null)}
 }
 return out
}

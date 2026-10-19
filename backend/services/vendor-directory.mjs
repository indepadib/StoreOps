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

function pickField(row,candidates){
 const keys=Object.keys(row||{});
 for(const wanted of candidates){const hit=keys.find(k=>k.toLowerCase()===wanted.toLowerCase());if(hit)return hit}
 return null
}
async function schema(){
 if(schemaCache&&Date.now()<schemaCache.expiresAt)return schemaCache.value;
 if(config.dynamics.mode!=='live')return null;
 const entities=[clean(process.env.D365_VENDOR_ENTITY),'VendorsV2','Vendors'].filter(Boolean);
 for(const entity of [...new Set(entities)]){
  try{
   const probe=await probeDataEntity(entity,{top:5,extra:config.dynamics.dataAreaId?'cross-company=true':''});
   const row=(probe?.rows||[]).find(x=>Object.keys(x||{}).length)||null;if(!probe?.ok||!row)continue;
   const accountField=pickField(row,accountCandidates),nameField=pickField(row,nameCandidates);
   if(accountField&&nameField){const value={entity,accountField,nameField};schemaCache={value,expiresAt:Date.now()+schemaTtl};return value}
  }catch{}
 }
 schemaCache={value:null,expiresAt:Date.now()+5*60*1000};return null
}

export async function vendorNamesMany(accounts=[]){
 const wanted=[...new Set((accounts||[]).map(clean).filter(Boolean))],out=new Map(),pending=[];
 for(const account of wanted){const hit=cache.get(account);if(hit&&Date.now()<hit.expiresAt)out.set(account,hit.value);else pending.push(account)}
 if(!pending.length)return out;
 const s=await schema();if(!s){for(const account of pending)out.set(account,null);return out}
 for(let i=0;i<pending.length;i+=40){
  const chunk=pending.slice(i,i+40),filters=[`(${chunk.map(x=>`${s.accountField} eq '${esc(x)}'`).join(' or ')})`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
  try{
   const payload=await odataGetAll(s.entity,{filter:filters.join(' and '),select:`${s.accountField},${s.nameField}`,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:100,maxRows:1000});
   for(const row of payload.value||[]){
    const account=clean(row[s.accountField]),name=clean(row[s.nameField])||null;
    if(account){const value={account,name,source:`D365/${s.entity}`,nameField:s.nameField};cache.set(account,{value,expiresAt:Date.now()+ttl});out.set(account,value)}
   }
  }catch{}
  for(const account of chunk)if(!out.has(account)){cache.set(account,{value:null,expiresAt:Date.now()+30*60*1000});out.set(account,null)}
 }
 return out
}

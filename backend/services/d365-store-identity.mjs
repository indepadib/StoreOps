import { config } from '../config.mjs';
import { probeDataEntity } from './dynamics.mjs';
import { storeOperationalSettings,mergeDiscoveredStoreD365Identity } from './store-settings.mjs';
import { d365SalesMappingSettings } from './d365-sales-mapping.mjs';

const clean=v=>String(v??'').trim();
const unique=a=>[...new Set((a||[]).map(clean).filter(Boolean))];
const cache=new Map(),inflight=new Map();
const ttlMs=()=>Math.max(60,Math.min(3600,Number(process.env.STOREOPS_STORE_IDENTITY_CACHE_SECONDS)||900))*1000;
const esc=v=>String(v).replaceAll("'","''");
const exactKey=(row,names=[])=>{const entries=Object.entries(row||{}),wanted=names.map(x=>x.toLowerCase());for(const [k,v] of entries)if(wanted.includes(k.toLowerCase())&&clean(v))return clean(v);return null};
const storeNumber=row=>exactKey(row,['StoreNumber','RetailStoreNumber','StoreId','RetailStoreId']);
const warehouse=row=>exactKey(row,['InventoryWarehouseId','WarehouseId','ShippingWarehouse','ShippingWarehouseId']);
const retailChannel=row=>exactKey(row,['RetailChannelId']);
const operatingUnit=row=>exactKey(row,['OperatingUnitNumber','OperatingUnitId']);
const legalEntity=row=>exactKey(row,['dataAreaId','LegalEntityId','LegalEntity']);
const displayName=row=>exactKey(row,['Name','StoreName','ChannelName']);
function matchesKnown(row,known){const k=clean(known).toLowerCase();if(!k)return false;return [storeNumber(row),warehouse(row)].some(v=>clean(v).toLowerCase()===k)}
async function safeProbe(entity,filter=''){try{return await probeDataEntity(entity,{top:20,filter})}catch(error){return{ok:false,entity,rows:[],error:error?.message||String(error),code:error?.code||'D365_STORE_IDENTITY_PROBE_FAILED'}}}

export async function discoverD365StoreIdentity(storeId,{force=false}={}){
 const id=clean(storeId),current=storeOperationalSettings(id),known=clean(current?.d365?.storeNumber)||clean(current?.storeWarehouseId);
 if(!known)return{status:'UNMAPPED',storeId:id,identity:null,message:'Store number / warehouse magasin inconnu.'};
 const cached=cache.get(id);if(!force&&cached&&Date.now()<cached.expiresAt)return{...cached.value,cached:true};
 if(!force&&inflight.has(id))return inflight.get(id);
 const promise=(async()=>{
  if(config.dynamics.mode!=='live')return{status:'DISABLED',storeId:id,identity:null,message:'D365_MODE n’est pas LIVE.'};
  const saved=d365SalesMappingSettings(),candidates=unique([process.env.D365_STORE_ENTITY,'RetailStoreEntity','RetailStores','RetailChannelEntity','RetailChannels',saved?.entity,process.env.D365_SALES_ENTITY,'RetailTransactionSalesTransBIEntities']);
  const filterFields=['StoreNumber','StoreId','RetailStoreId','InventoryWarehouseId','WarehouseId'];
  const diagnostics=[];
  for(const entity of candidates){
   const probes=[];
   for(const field of filterFields){
    const p=await safeProbe(entity,`${field} eq '${esc(known)}'`);
    probes.push(p);
    if(p?.ok&&(p.rows||[]).some(row=>matchesKnown(row,known)))break
   }
   if(!probes.some(p=>p?.ok&&(p.rows||[]).some(row=>matchesKnown(row,known))))probes.push(await safeProbe(entity,''));
   const rows=probes.flatMap(p=>Array.isArray(p?.rows)?p.rows:[]),row=rows.find(r=>matchesKnown(r,known));
   diagnostics.push({entity,responded:probes.some(p=>p?.ok),matched:!!row});
   if(!row)continue;
   const identity={storeNumber:storeNumber(row)||current?.d365?.storeNumber||known,retailChannelId:retailChannel(row)||null,operatingUnitNumber:operatingUnit(row)||null,warehouseId:warehouse(row)||current?.storeWarehouseId||null,legalEntityId:legalEntity(row)||current?.d365?.legalEntityId||config.dynamics.dataAreaId||null,name:displayName(row)||null};
   const persisted=mergeDiscoveredStoreD365Identity({storeId:id,identity,user:null,source:`D365/${entity}`});
   const value={status:'READY',storeId:id,entity,identity:{...identity,retailChannelId:persisted.d365?.retailChannelId||identity.retailChannelId},diagnostics};
   cache.set(id,{value,expiresAt:Date.now()+ttlMs()});return value
  }
  const value={status:'NOT_FOUND',storeId:id,identity:{storeNumber:current?.d365?.storeNumber||known,retailChannelId:current?.d365?.retailChannelId||null,operatingUnitNumber:current?.d365?.operatingUnitNumber||null,warehouseId:current?.storeWarehouseId||null,legalEntityId:current?.d365?.legalEntityId||config.dynamics.dataAreaId||null},diagnostics,message:`Aucune entité D365 n’a relié explicitement ${known} à un canal Retail.`};
  cache.set(id,{value,expiresAt:Date.now()+Math.min(ttlMs(),120000)});return value
 })();
 inflight.set(id,promise);try{return await promise}finally{inflight.delete(id)}
}

export async function ensureD365StoreIdentity(storeId,{force=false}={}){
 const current=storeOperationalSettings(storeId);
 if(current?.d365?.retailChannelId)return{status:'READY',storeId,identity:{...current.d365,warehouseId:current.storeWarehouseId},cached:true};
 return discoverD365StoreIdentity(storeId,{force})
}
export function clearD365StoreIdentityCache(storeId=null){if(storeId)cache.delete(storeId);else cache.clear()}

import { config } from '../config.mjs';
import { discoverD365SalesMapping } from './d365-mapping-diagnostics.mjs';
import { d365SalesMappingSettings,saveD365SalesMappingDraft,smokeD365SalesMapping,activateD365SalesMapping,validateD365SalesStore,d365SalesStoreValidation,d365SalesMappingSignature } from './d365-sales-mapping.mjs';
import { resolveStoreSalesChannel } from './d365-sales-channel.mjs';
import { ensureD365StoreIdentity } from './d365-store-identity.mjs';

const attempts=new Map();
const inflight=new Map();
const TTL_MS=10*60*1000;

async function resolveChannel(storeId,channelField){
 let channel=resolveStoreSalesChannel(storeId,{channelField});
 if(channel.value)return channel;
 await ensureD365StoreIdentity(storeId);
 return resolveStoreSalesChannel(storeId,{channelField})
}
function validationMatches(storeId,mapping,channel){
 const v=d365SalesStoreValidation(storeId);
 return !!(v?.state==='PASSED'&&v.entity===mapping.entity&&v.channelField===mapping.fields.channel&&v.channelValue===channel.value&&v.mappingSignature===d365SalesMappingSignature(mapping))
}

export async function ensureD365SalesAutoConnected(storeId='val-fleuri'){
 if(config.dynamics.mode!=='live')return{status:'DISABLED',connected:false,reason:'D365_MODE_NOT_LIVE'};
 const cached=attempts.get(storeId);
 if(cached&&Date.now()-cached.at<TTL_MS)return{...cached.value,cached:true};
 if(inflight.has(storeId))return inflight.get(storeId);

 const promise=(async()=>{
  try{
   let current=d365SalesMappingSettings();
   if(current?.state==='LIVE'){
    const channel=await resolveChannel(storeId,current.fields?.channel);
    if(!channel.value){
     const value={status:'STORE_CHANNEL_UNRESOLVED',connected:false,reason:`Aucun canal ventes D365 prouvé pour ${storeId}.`,channel};
     attempts.set(storeId,{at:Date.now(),value});return value
    }
    if(validationMatches(storeId,current,channel)){
     const value={status:'LIVE',connected:true,mapping:current,channel,storeValidation:d365SalesStoreValidation(storeId),cached:true};
     attempts.set(storeId,{at:Date.now(),value});return value
    }
    const checked=await validateD365SalesStore({actor:null,storeId});
    const value={status:checked.status==='PASSED'?'LIVE':'SMOKE_FAILED',connected:checked.status==='PASSED',mapping:current,channel:checked.channel,storeValidation:checked.validation,reason:checked.status==='PASSED'?null:checked.smoke?.note||'Smoke magasin non concluant.'};
    attempts.set(storeId,{at:Date.now(),value});return value
   }

   const discovered=await discoverD365SalesMapping(storeId);
   if(discovered.status!=='READY'||!discovered.recommendation){
    const value={status:'NOT_DISCOVERED',connected:false,reason:discovered.message||discovered.status,diagnostics:{status:discovered.status}};
    attempts.set(storeId,{at:Date.now(),value});return value
   }
   const rec=discovered.recommendation;
   await resolveChannel(storeId,rec.fields?.channel);
   saveD365SalesMappingDraft({actor:null,input:{
    entity:rec.salesEntity,
    fields:rec.fields,
    dateFilterMode:rec.dateFilterMode||'datetime',
    salesSign:rec.salesSign??-1,
    quantitySign:rec.quantitySign??1,
    costSign:rec.costSign??-1
   }});
   const validated=await smokeD365SalesMapping({actor:null,storeId});
   if(validated?.smoke?.status!=='PASSED'){
    const value={status:'SMOKE_FAILED',connected:false,reason:validated?.smoke?.note||'Smoke ventes non concluant.',mapping:validated};
    attempts.set(storeId,{at:Date.now(),value});return value
   }
   current=activateD365SalesMapping({actor:null});
   const channel=resolveStoreSalesChannel(storeId,{channelField:current.fields?.channel});
   const value={status:'LIVE',connected:true,mapping:current,channel,storeValidation:d365SalesStoreValidation(storeId),discovered:{entity:rec.salesEntity,fields:rec.fields}};
   attempts.set(storeId,{at:Date.now(),value});return value
  }catch(error){
   const value={status:'ERROR',connected:false,reason:error?.message||String(error),code:error?.code||'D365_SALES_AUTOCONNECT_FAILED'};
   attempts.set(storeId,{at:Date.now(),value});return value
  }
 })();
 inflight.set(storeId,promise);
 try{return await promise}finally{inflight.delete(storeId)}
}

export function clearD365SalesAutoConnectCache(storeId=null){
 if(storeId)attempts.delete(storeId);else attempts.clear()
}

import { config } from '../config.mjs';
import { discoverD365PriceHistoryMapping } from './d365-mapping-diagnostics.mjs';
import {
 d365PriceHistoryMappingSettings,
 saveD365PriceHistoryMappingDraft,
 smokeD365PriceHistoryMapping,
 activateD365PriceHistoryMapping
} from './d365-price-history-mapping.mjs';

const attempts=new Map();
const inflight=new Map();
const TTL_MS=10*60*1000;
const clean=v=>String(v??'').trim();

export async function ensureD365PriceHistoryAutoConnected(productNumber){
 const sku=clean(productNumber);
 if(!sku)return{status:'MISSING_SAMPLE',connected:false,reason:'PRODUCT_REQUIRED'};
 const current=d365PriceHistoryMappingSettings();
 if(current?.state==='LIVE'&&current?.smoke?.status==='PASSED')return{status:'LIVE',connected:true,mapping:current,cached:true};
 if(config.dynamics.mode!=='live')return{status:'DISABLED',connected:false,reason:'D365_MODE_NOT_LIVE'};
 const key=sku;
 const cached=attempts.get(key);
 if(cached&&Date.now()-cached.at<TTL_MS)return{...cached.value,cached:true};
 if(inflight.has(key))return inflight.get(key);
 const promise=(async()=>{
  try{
   const discovery=await discoverD365PriceHistoryMapping(),rec=discovery?.recommendation;
   if(discovery?.status!=='READY'||!rec?.entity){
    const value={status:'NOT_DISCOVERED',connected:false,reason:discovery?.message||discovery?.status||'NO_SOURCE',discovery};
    attempts.set(key,{at:Date.now(),value});return value
   }
   const draft=saveD365PriceHistoryMappingDraft({actor:null,input:{entity:rec.entity,fields:rec.fields||{}}});
   const validated=await smokeD365PriceHistoryMapping({actor:null,productNumber:sku});
   if(validated?.smoke?.status!=='PASSED'){
    const value={status:'SMOKE_FAILED',connected:false,reason:validated?.smoke?.note||'Smoke Trade Agreements non concluant.',mapping:validated,discovery};
    attempts.set(key,{at:Date.now(),value});return value
   }
   const active=activateD365PriceHistoryMapping({actor:null});
   const value={status:'LIVE',connected:true,mapping:active,discovery:{entity:rec.entity,fields:rec.fields},sampleProductNumber:sku};
   attempts.set(key,{at:Date.now(),value});return value
  }catch(error){
   const value={status:'ERROR',connected:false,reason:error?.message||String(error),code:error?.code||'D365_PRICE_HISTORY_AUTOCONNECT_FAILED'};
   attempts.set(key,{at:Date.now(),value});return value
  }
 })();
 inflight.set(key,promise);
 try{return await promise}finally{inflight.delete(key)}
}

export function clearD365PriceHistoryAutoConnectCache(productNumber=null){
 const sku=clean(productNumber);if(sku)attempts.delete(sku);else attempts.clear()
}

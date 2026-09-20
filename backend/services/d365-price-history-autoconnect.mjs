import { config } from '../config.mjs';
import { discoverD365PriceHistoryMapping } from './d365-mapping-diagnostics.mjs';
import { d365PriceHistoryMappingSettings,smokeD365PriceHistoryMapping,activateD365PriceHistoryMapping } from './d365-price-history-mapping.mjs';

const attempts=new Map();
const inflight=new Map();
const TTL_MS=10*60*1000;
const clean=v=>String(v??'').trim();

export async function ensureD365PriceHistoryAutoConnected(productNumber=null){
  const current=d365PriceHistoryMappingSettings();
  if(current?.state==='LIVE'&&current?.smoke?.status==='PASSED')return{status:'LIVE',connected:true,mapping:current,cached:true};
  if(config.dynamics.mode!=='live'||String(process.env.D365_PRICE_READ_MODE||'').toLowerCase()!=='live')return{status:'DISABLED',connected:false,reason:'D365_PRICE_NOT_LIVE'};
  const requestedSku=clean(productNumber),cacheKey=requestedSku||'__auto__',cached=attempts.get(cacheKey);
  if(cached&&Date.now()-cached.at<TTL_MS)return{...cached.value,cached:true};
  if(inflight.has(cacheKey))return inflight.get(cacheKey);
  const promise=(async()=>{
    try{
      const discovery=await discoverD365PriceHistoryMapping(),rec=discovery?.recommendation;
      if(!rec?.entity){
        const value={status:'NOT_DISCOVERED',connected:false,reason:discovery?.message||discovery?.status||'NO_PRICE_HISTORY_MAPPING'};
        attempts.set(cacheKey,{at:Date.now(),value});return value
      }
      const sku=requestedSku||clean(discovery.sampleProductNumber);
      if(!sku){
        const value={status:'SAMPLE_REQUIRED',connected:false,reason:'Aucun article témoin disponible pour valider la source Trade Agreements.'};
        attempts.set(cacheKey,{at:Date.now(),value});return value
      }
      const validated=await smokeD365PriceHistoryMapping({actor:null,productNumber:sku,input:{entity:rec.entity,fields:rec.fields||{}}});
      if(validated?.smoke?.status!=='PASSED'){
        const value={status:'SMOKE_FAILED',connected:false,reason:validated?.smoke?.note||'Smoke Trade Agreements non concluant.',mapping:validated,sampleProductNumber:sku};
        attempts.set(cacheKey,{at:Date.now(),value});return value
      }
      const active=activateD365PriceHistoryMapping({actor:null}),value={status:'LIVE',connected:true,mapping:active,sampleProductNumber:sku,entity:active.entity};
      attempts.set(cacheKey,{at:Date.now(),value});return value
    }catch(error){
      const value={status:'ERROR',connected:false,reason:error?.message||String(error),code:error?.code||'D365_PRICE_HISTORY_AUTOCONNECT_FAILED'};
      attempts.set(cacheKey,{at:Date.now(),value});return value
    }
  })();
  inflight.set(cacheKey,promise);
  try{return await promise}finally{inflight.delete(cacheKey)}
}

export function clearD365PriceHistoryAutoConnectCache(){attempts.clear()}

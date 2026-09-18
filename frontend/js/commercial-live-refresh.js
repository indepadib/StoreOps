import {api} from './api.js';

const inflight=new Map();
const memoryLast=new Map();
const STORAGE_PREFIX='storeops:commercial-sync:';
const clean=v=>String(v??'').trim();

function storageKey(storeId){return `${STORAGE_PREFIX}${clean(storeId)}`}
function lastRun(storeId){
 const key=storageKey(storeId);
 if(memoryLast.has(key))return memoryLast.get(key);
 try{const n=Number(sessionStorage.getItem(key)||0);if(Number.isFinite(n)&&n>0){memoryLast.set(key,n);return n}}catch{}
 return 0
}
function remember(storeId,when=Date.now()){
 const key=storageKey(storeId);memoryLast.set(key,when);try{sessionStorage.setItem(key,String(when))}catch{}
}
function emit(storeId,result){window.dispatchEvent(new CustomEvent('storeops:commercial-updated',{detail:{storeId,result,at:Date.now()}}))}

export async function refreshCommercialLive(storeId,{force=false,minIntervalMs=300000}={}){
 const id=clean(storeId);if(!id)return{ok:false,skipped:true,reason:'NO_STORE'};
 const key=storageKey(id),elapsed=Date.now()-lastRun(id);
 if(!force&&elapsed>=0&&elapsed<Math.max(15000,Number(minIntervalMs)||300000))return{ok:true,skipped:true,reason:'RECENT_SYNC',ageMs:elapsed};
 if(inflight.has(key))return inflight.get(key);
 const promise=(async()=>{
  try{
   const result=await api(`/api/stores/${encodeURIComponent(id)}/commercial/sync`,{method:'POST'});
   remember(id);emit(id,result);return{ok:true,skipped:false,result}
  }catch(error){
   const status=Number(error?.status)||0;
   if(status===401||status===403){remember(id);return{ok:false,skipped:true,reason:'NOT_ALLOWED',error}}
   throw error
  }
 })();
 inflight.set(key,promise);try{return await promise}finally{inflight.delete(key)}
}

export function scheduleCommercialLiveRefresh(storeId,{delayMs=150,minIntervalMs=300000,onUpdated=null}={}){
 const id=clean(storeId);if(!id)return Promise.resolve({ok:false,skipped:true,reason:'NO_STORE'});
 return new Promise(resolve=>{
  const run=()=>refreshCommercialLive(id,{minIntervalMs}).then(async result=>{
   if(result?.ok&&!result.skipped&&typeof onUpdated==='function'){try{await onUpdated(result.result)}catch(error){console.warn('Rafraîchissement UI commercial',error)}}
   resolve(result)
  }).catch(error=>{console.warn('Synchronisation commerciale arrière-plan',error);resolve({ok:false,skipped:false,error})});
  if('requestIdleCallback' in window)window.requestIdleCallback(run,{timeout:Math.max(500,delayMs+800)});
  else setTimeout(run,Math.max(0,delayMs))
 })
}

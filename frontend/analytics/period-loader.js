// Bounded requests and reusable slices; never publish a partial period as complete.
const dayMs=86400000;
function day(value){
 const n=Date.parse(value+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw Error('Date de période invalide.');
 return n;
}
export function periodPlan(current,previous,size=2){
 const count=range=>{const n=(day(range.end)-day(range.start))/dayMs+1;if(n<1||n>366)throw Error('Choisir une période de 1 à 366 jours.');return n};
 const a=count(current),b=count(previous),blocks=Math.min(Math.ceil(Math.max(a,b)/size),a,b);
 const partition=(range,length)=>{
  const base=Math.floor(length/blocks),extra=length%blocks;let cursor=day(range.start);
  return Array.from({length:blocks},(_,i)=>{const n=base+(i<extra?1:0),start=new Date(cursor).toISOString().slice(0,10);cursor+=n*dayMs;return{start,end:new Date(cursor-dayMs).toISOString().slice(0,10)}});
 };
 const left=partition(current,a),right=partition(previous,b);
 return left.map((cur,i)=>({current:cur,previous:right[i]}));
}
export function completeSlice(data){
 const c=data?.coverage;
 return data?.status==='READY'&&data.quality?.status!=='ERROR'&&c?.storesRequested>0&&c.currentStoresReady===c.storesRequested&&c.comparisonStoresReady===c.storesRequested&&
  !data.quality?.issues?.some(x=>x.code==='SALES_TRUNCATED')&&!data.quality?.checks?.truncatedStores;
}
export function createPeriodLoader({now=Date.now,ttl=15*60*1000,maxBytes=24*1024*1024}={}){
 const cache=new Map();let bytes=0;
 const remove=key=>{const hit=cache.get(key);if(hit){bytes-=hit.bytes;cache.delete(key)}};
 return async function load({plan,scope,fetchSlice,force=false,signal,onProgress=()=>{},concurrency=2}){
  if(force)for(const slice of plan)remove(JSON.stringify([scope,slice]));
  const results=new Array(plan.length);let next=0,done=0,hits=0,requests=0,stopped=false,failure=null;
  const worker=async()=>{while(!stopped){
   signal?.throwIfAborted();const i=next++;if(i>=plan.length)return;
   const slice=plan[i],key=JSON.stringify([scope,slice]),cached=cache.get(key);
   if(cached&&cached.expires<=now())remove(key);
   const hit=!force?cache.get(key):null;
   let data;
   if(hit){data=hit.data;hits++;cache.delete(key);cache.set(key,hit)}
   else{
    if(force)remove(key);
    requests++;data=await fetchSlice(slice,signal);signal?.throwIfAborted();
    // A failed forced refresh must not leave an older successful value reusable.
    remove(key);
    if(completeSlice(data)){
     const weight=JSON.stringify(data).length*2;
     if(weight<=maxBytes){while(bytes+weight>maxBytes&&cache.size)remove(cache.keys().next().value);cache.set(key,{data,expires:now()+ttl,bytes:weight});bytes+=weight}
    }
   }
   results[i]=data;done++;onProgress({done,total:plan.length,hits,requests});
  }};
  // At most two API requests, including on a large network scope. Each request
  // retains the backend's own bounded D365 pool and timeout subdivision.
  // A failed slice must stop scheduling the rest of a long period. Drain the
  // already-running read before allowing a retry, avoiding overlapping pools.
  const guardedWorker=async()=>{try{await worker()}catch(error){stopped=true;failure??=error}};
  await Promise.all(Array.from({length:Math.max(1,Math.min(2,concurrency,plan.length))},guardedWorker));
  if(failure)throw failure;
  signal?.throwIfAborted();return{results,diagnostics:{blocks:plan.length,hits,requests}};
 };
}

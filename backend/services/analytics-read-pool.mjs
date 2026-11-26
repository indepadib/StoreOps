// Share identical in-flight reads without retaining failures or completed values.
export function createReadPool(){
 const pending=new Map();
 return function read(key,work,{force=false}={}){
  if(force)return Promise.resolve().then(work);
  if(pending.has(key))return pending.get(key);
  const promise=Promise.resolve().then(work).finally(()=>{if(pending.get(key)===promise)pending.delete(key)});
  pending.set(key,promise);return promise;
 };
}
export async function boundedMap(items,limit,work){
 const results=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;results[i]=await work(items[i],i)}}));
 return results;
}

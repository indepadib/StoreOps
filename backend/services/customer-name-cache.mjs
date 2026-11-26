// Names are reused by account, not by the accidental composition of a date slice.
export function createCustomerNameCache({now=Date.now,maxEntries=10000}={}){
 const entries=new Map();
 return async function resolve(scope,ids,fetchNames){
  const out=new Map(),missing=[],key=id=>JSON.stringify([scope,id]);
  for(const id of new Set(ids)){
   const k=key(id),hit=entries.get(k);
   if(hit&&hit.until>now()){if(hit.name)out.set(id,hit.name)}
   else{entries.delete(k);missing.push(id)}
  }
  if(missing.length){
   // Failed or incomplete source reads are not negative-cache entries.
   const fetched=await fetchNames(missing);
   for(const id of missing)if(fetched.has(id)){
    const name=fetched.get(id);out.set(id,name);
    const k=key(id);entries.delete(k);entries.set(k,{name,until:now()+3600000});
   }
   while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
  }
  return out;
 };
}

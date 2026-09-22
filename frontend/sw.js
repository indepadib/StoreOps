// StoreOps legacy service-worker kill switch.
// StoreOps now runs network-first without a registered service worker.
// Any browser still controlled by an old StoreOps worker will receive this file,
// purge the legacy shell cache and release control.
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  try{
   const keys=await caches.keys();
   await Promise.all(keys.filter(k=>k.startsWith('storeops-shell-')).map(k=>caches.delete(k)));
  }catch{}
  await self.skipWaiting()
 })())
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  try{
   const keys=await caches.keys();
   await Promise.all(keys.filter(k=>k.startsWith('storeops-shell-')).map(k=>caches.delete(k)));
  }catch{}
  try{await self.registration.unregister()}catch{}
  const clientsList=await self.clients.matchAll({type:'window',includeUncontrolled:true}).catch(()=>[]);
  for(const client of clientsList){try{client.postMessage({type:'STOREOPS_SW_REMOVED',reloadRecommended:true})}catch{}}
 })())
});
self.addEventListener('fetch',()=>{});

const CACHE_PREFIX='storeops-shell-';

self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)).map(k=>caches.delete(k)));
    }catch{}
    try{await self.registration.unregister()}catch{}
    try{
      const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const client of clients){try{await client.navigate(client.url)}catch{}}
    }catch{}
  })())
});

// StoreOps n'enregistre plus de service worker.
// Ce fichier existe uniquement pour auto-détruire les anciens workers/caches.

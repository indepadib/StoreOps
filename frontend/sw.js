const CACHE='storeops-shell-v1.53';
const CORE=[
  '/','/index.html','/manifest.webmanifest','/styles.css','/incidents.css','/cash.css','/losses.css','/cash-opening.css','/cold-chain.css','/staffing.css','/handover.css','/maintenance.css','/price-check-mobile.css','/manager.css','/mobile-barcode.css','/auth.css','/guided-day.css','/manager-alerts.css','/manager-incident-flow.css','/manager-handover.css','/manager-control-focus.css','/manager-receiving-focus.css','/manager-dlc-focus.css','/manager-commercial-focus.css','/runtime-config.js',
  '/js/boot-rescue.js','/js/pwa.js','/js/mobile-barcode.js','/js/manager-polish.js','/js/manager-alerts.js','/js/manager-incident-flow.js','/js/manager-handover.js','/js/manager-control-focus.js','/js/manager-receiving-focus.js','/js/manager-dlc-focus.js','/js/manager-commercial-focus.js','/js/auth-entry.js','/js/auth.js','/js/app.js','/js/api.js','/js/state.js','/js/ui.js','/js/today-signals.js','/js/store-health.js','/js/manager-journey.js','/js/manager-compliance.js','/js/inventory-privacy.js','/js/quality-draft.js','/js/network-risk.js','/js/maintenance-model.js','/js/mock-api.js','/js/mock-cash.js','/js/mock-loss.js','/js/mock-cash-opening.js','/js/mock-cold-chain.js','/js/mock-staffing.js','/js/mock-price-check.js',
  '/js/pages/today.js','/js/pages/manager-home.js','/js/pages/manager-hubs.js','/js/pages/process.js','/js/pages/handover.js','/js/pages/staffing.js','/js/pages/cold-chain.js','/js/pages/cash-opening.js','/js/pages/dlc.js','/js/pages/commercial.js','/js/pages/receipts.js','/js/pages/inventory.js','/js/pages/losses.js','/js/pages/quality.js','/js/pages/maintenance.js','/js/pages/cash.js','/js/pages/network.js','/js/pages/system.js','/js/pages/incidents.js'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>Promise.allSettled(CORE.map(url=>cache.add(url)))).then(()=>self.skipWaiting()))
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('storeops-shell-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))
});

async function networkFirst(req,fallbackKey=null){
  const cache=await caches.open(CACHE);
  try{
    const res=await fetch(req,{cache:'no-store'});
    if(res.ok)await cache.put(fallbackKey||req,res.clone());
    return res;
  }catch{
    return (await cache.match(fallbackKey||req))||(fallbackKey?await cache.match(req):undefined)||Response.error();
  }
}

self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/'))return;
  if(req.mode==='navigate'){
    event.respondWith(networkFirst(req,'/index.html'));
    return;
  }
  const freshAsset=url.pathname==='/runtime-config.js'||url.pathname==='/sw.js'||url.pathname.endsWith('.js')||url.pathname.endsWith('.css');
  if(freshAsset){event.respondWith(networkFirst(req));return}
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(async res=>{if(res.ok){const cache=await caches.open(CACHE);await cache.put(req,res.clone())}return res})))
});

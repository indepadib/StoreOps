const modules=[
  './pwa.js',
  './manager-polish.js',
  './manager-alerts.js',
  './manager-incident-flow.js',
  './manager-handover.js',
  './manager-control-focus.js',
  './manager-receiving-focus.js',
  './manager-replenishment-v2.js'
];

export async function loadEnhancements(){
  const results=await Promise.allSettled(modules.map(path=>import(`${path}?v=1840`)));
  const failed=results.filter(x=>x.status==='rejected');
  if(failed.length)console.warn(`${failed.length} module(s) StoreOps différé(s) non chargés`,failed.map(x=>x.reason));
}

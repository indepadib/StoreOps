const modules=[
  './pwa.js',
  './manager-polish.js',
  './manager-alerts.js',
  './manager-incident-flow.js',
  './manager-handover.js',
  './manager-control-focus.js',
  './manager-receiving-focus.js'
];

export async function loadEnhancements(){
  for(const path of modules){
    await import(`${path}?v=1560`);
  }
}

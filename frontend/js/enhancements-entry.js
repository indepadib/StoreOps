const BUILD='1920';

const modules=[
  './tenant-branding.js',
  './pwa.js',
  './manager-polish.js',
  './manager-alerts.js',
  './manager-incident-flow.js',
  './manager-handover.js',
  './manager-control-focus.js',
  './manager-receiving-focus.js',
  './manager-replenishment-v2.js',
  './ux-v191.js'
];

const adminEntries={
  users:{section:'accessManagementSection',modules:['./admin-studio-access.js']},
  integrations:{section:'integrationsStudioSection',modules:['./admin-studio-integrations.js','./admin-d365-mapping.js']},
  tenant:{section:'tenantStudioSection',modules:['./admin-studio-tenant.js']},
  replenishmentRulesSection:{section:'replenishmentRulesSection',modules:['./admin-studio-replenishment.js']},
  storeSettingsSection:{section:'storeSettingsSection',modules:['./admin-studio-stores.js','./admin-assortment-auto.js']}
};
const adminLoaded=new Set();

async function importAdmin(path){if(adminLoaded.has(path))return;await import(`${path}?v=${BUILD}`);adminLoaded.add(path)}
function waitFor(id,timeout=8000){return new Promise((resolve,reject)=>{const started=Date.now();const tick=()=>{const el=document.getElementById(id);if(el)return resolve(el);if(Date.now()-started>timeout)return reject(new Error(`Le module Admin n'a pas pu afficher ${id}.`));setTimeout(tick,40)};tick()})}
async function openAdminEntry(key,label){const cfg=adminEntries[key],root=document.getElementById('adminStudioContent');if(!cfg||!root)return;let host=document.getElementById('studioExtensions');if(!host){host=document.createElement('div');host.id='studioExtensions';root.appendChild(host)}host.innerHTML=`<div class="card" id="adminLazyLoading"><div class="label">ADMIN STUDIO</div><strong>Chargement de ${label}…</strong><div class="small muted" style="margin-top:6px">Seul ce module est chargé. Le reste reste au repos.</div></div>`;try{for(const path of cfg.modules)await importAdmin(path);const section=await waitFor(cfg.section);document.getElementById('adminLazyLoading')?.remove();section.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){host.innerHTML=`<div class="banner ban-danger"><strong>Module Admin indisponible</strong><span>${String(e?.message||e)}</span></div>`;console.error(e)}}
function bindAdminLazyRuntime(){const root=document.getElementById('adminStudioContent');if(!root||root.dataset.lazyAdminBound==='1')return;root.dataset.lazyAdminBound='1';root.addEventListener('click',e=>{const action=e.target.closest('[data-studio-action]'),target=e.target.closest('[data-studio-target]'),actionKey=action?.dataset.studioAction,targetKey=target?.dataset.studioTarget,key=adminEntries[actionKey]?actionKey:adminEntries[targetKey]?targetKey:null;if(!key)return;e.preventDefault();e.stopImmediatePropagation();const label=action?.querySelector('strong')?.textContent||target?.querySelector('strong')?.textContent||'la configuration';openAdminEntry(key,label)},true)}

export async function loadEnhancements(){
  bindAdminLazyRuntime();
  const results=await Promise.allSettled(modules.map(path=>import(`${path}?v=${BUILD}`)));
  const failed=results.filter(x=>x.status==='rejected');
  if(failed.length)console.warn(`${failed.length} module(s) StoreOps différé(s) non chargés`,failed.map(x=>x.reason));
}

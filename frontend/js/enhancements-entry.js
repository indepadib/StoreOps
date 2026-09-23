import {isDirector} from './state.js';

const BUILD='2290';

const modules=[
  './pwa.js',
  './navigation-polish.js',
  './scanner-resilience.js',
  './manager-more-simplified.js',
  './manager-polish.js',
  './manager-alerts.js',
  './manager-incident-flow.js',
  './manager-handover.js',
  './manager-control-focus.js',
  './manager-receiving-focus.js',
  './manager-replenishment-v2.js'
];

const adminEntries={
  users:{section:'accessManagementSection',modules:['./admin-studio-access.js']},
  integrations:{section:'integrationsStudioSection',modules:['./admin-studio-integrations.js','./admin-validation-center.js','./admin-d365-mapping.js','./admin-price-history-mapping.js','./admin-cost-mapping.js','./admin-loss-export-mapping.js','./admin-taxonomy-mapping.js']},
  tenant:{section:'tenantStudioSection',modules:['./admin-studio-tenant.js']},
  replenishmentRulesSection:{section:'replenishmentRulesSection',modules:['./admin-studio-replenishment.js']},
  storeSettingsSection:{section:'storeSettingsSection',modules:['./admin-studio-stores.js','./admin-assortment-auto.js']}
};
const adminLoaded=new Set();

async function importAdmin(path){if(adminLoaded.has(path))return;await import(`${path}?v=${BUILD}`);adminLoaded.add(path)}
function waitFor(id,timeout=8000){return new Promise((resolve,reject)=>{const started=Date.now();const tick=()=>{const el=document.getElementById(id);if(el)return resolve(el);if(Date.now()-started>timeout)return reject(new Error(`Le module Admin n'a pas pu afficher ${id}.`));setTimeout(tick,40)};tick()})}
async function openAdminEntry(key,label){const cfg=adminEntries[key],root=document.getElementById('adminStudioContent');if(!cfg||!root)return;let host=document.getElementById('studioExtensions');if(!host){host=document.createElement('div');host.id='studioExtensions';root.appendChild(host)}host.innerHTML=`<div class="card" id="adminLazyLoading"><div class="label">ADMIN STUDIO</div><strong>Chargement de ${label}…</strong><div class="small muted" style="margin-top:6px">Seul ce module est chargé. Le reste reste au repos.</div></div>`;try{for(const path of cfg.modules)await importAdmin(path);const section=await waitFor(cfg.section);document.getElementById('adminLazyLoading')?.remove();section.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){host.innerHTML=`<div class="banner ban-danger"><strong>Module Admin indisponible</strong><span>${String(e?.message||e)}</span></div>`;console.error(e)}}
function bindAdminLazyRuntime(){const root=document.getElementById('adminStudioContent');if(!root||root.dataset.lazyAdminBound==='1')return;root.dataset.lazyAdminBound='1';root.addEventListener('click',e=>{const action=e.target.closest('[data-studio-action]'),target=e.target.closest('[data-studio-target]'),actionKey=action?.dataset.studioAction,targetKey=target?.dataset.studioTarget,key=adminEntries[actionKey]?actionKey:adminEntries[targetKey]?targetKey:null;if(!key)return;e.preventDefault();e.stopImmediatePropagation();const label=action?.querySelector('strong')?.textContent||target?.querySelector('strong')?.textContent||'la configuration';openAdminEntry(key,label)},true)}

const operationGroups=[
 {icon:'◷',title:'Journée magasin',subtitle:'Ouverture, passation, équipe et fermeture',actions:[['opening','Ouverture'],['handover','Passation'],['staffing','Équipe & prise de poste'],['closing','Fermeture']]},
 {icon:'↗',title:'Commerce & stock',subtitle:'Prix, réception, disponibilité et pertes',actions:[['commercial','Prix & promotions'],['receipts','Réception'],['inventory','Stock & inventaire'],['losses','Démarque & pertes']]},
 {icon:'✓',title:'Qualité & risques',subtitle:'Sécurité produit, équipements et incidents',actions:[['coldChain','Chaîne du froid'],['dlc','DLC / DDM'],['quality','Qualité'],['maintenance','Maintenance'],['incidents','Incidents']]},
 {icon:'▣',title:'Caisses',subtitle:'Préparation et clôture financière',actions:[['cashOpening','Préparation caisses'],['cash','Caisses & clôture']]}
];
function addCss(href,key){if(document.querySelector(`link[data-storeops-${key}]`))return;const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset[`storeops${key[0].toUpperCase()}${key.slice(1)}`]='1';document.head.appendChild(link)}
function injectExperienceCss(){addCss(`/experience-v191.css?v=${BUILD}`,'experience');addCss(`/mobile-v197.css?v=${BUILD}`,'mobile');addCss(`/mobile-v198.css?v=${BUILD}`,'mobileActionFirst');addCss(`/mobile-v199.css?v=${BUILD}`,'mobileExceptionFirst')}
function clearOperationsActive(){document.getElementById('storeopsOperationsNav')?.classList.remove('active')}
function goPage(page){clearOperationsActive();const btn=document.querySelector(`#nav button[data-page="${page}"]`);if(btn)return btn.click()}
function ensureOperationsPage(){let page=document.getElementById('operationsHubPage');if(page)return page;page=document.createElement('section');page.className='page';page.id='operationsHubPage';page.innerHTML='<div id="operationsHubContent"></div>';document.querySelector('main')?.appendChild(page);return page}
function activateOperations(){const page=ensureOperationsPage();document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));page.classList.add('active');document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));document.getElementById('storeopsOperationsNav')?.classList.add('active');renderOperations()}
function renderOperations(){const root=document.getElementById('operationsHubContent');if(!root)return;root.innerHTML=`<div class="ux191-shell"><div class="ux191-hero"><div><div class="ux191-eyebrow">OPÉRATIONS</div><h2>Que voulez-vous faire ?</h2><p>Choisissez un domaine puis StoreOps vous amène au parcours opérationnel existant.</p></div></div><div class="ux191-grid">${operationGroups.map((g,i)=>`<button class="ux191-choice" data-ops-group="${i}"><span class="icon">${g.icon}</span><strong>${g.title}</strong><small>${g.subtitle}</small><em>Ouvrir →</em></button>`).join('')}</div><div id="storeopsOpsCommands"></div></div>`;root.querySelectorAll('[data-ops-group]').forEach(b=>b.onclick=()=>renderOperationGroup(Number(b.dataset.opsGroup)))}
function renderOperationGroup(i){const g=operationGroups[i],root=document.getElementById('operationsHubContent');if(!g||!root)return;root.innerHTML=`<div class="ux191-shell"><button class="ux191-back" id="opsBack">← Opérations</button><div class="ux191-hero"><div><div class="ux191-eyebrow">${g.title}</div><h2>${g.subtitle}</h2></div></div><div class="ux191-command-list">${g.actions.map(([page,label])=>`<button class="ux191-command" data-ops-page="${page}"><span><strong>${label}</strong></span><span class="arrow">›</span></button>`).join('')}</div></div>`;document.getElementById('opsBack').onclick=renderOperations;root.querySelectorAll('[data-ops-page]').forEach(b=>b.onclick=()=>goPage(b.dataset.opsPage))}
function setMobileLabel(button,label){if(button)button.dataset.mobileLabel=label}
function installDirectorExperience(){
  if(!isDirector())return;
  injectExperienceCss();
  document.body.classList.add('director-experience');
  const nav=document.getElementById('nav');if(!nav)return;
  nav.classList.add('ux191-network-nav');
  const allowed=new Set(['today','network','development','adminStudio']);
  nav.querySelectorAll('button[data-page]').forEach(b=>{b.hidden=!allowed.has(b.dataset.page);if(allowed.has(b.dataset.page)&&b.dataset.directorStateBound!=='1'){b.dataset.directorStateBound='1';b.addEventListener('click',clearOperationsActive)}});
  const today=nav.querySelector('[data-page="today"]');setMobileLabel(today,'Aujourd’hui');
  let ops=document.getElementById('storeopsOperationsNav');
  if(!ops){ops=document.createElement('button');ops.id='storeopsOperationsNav';ops.textContent='Opérations';ops.onclick=activateOperations;today?.after(ops)}setMobileLabel(ops,'Opérations');
  const network=nav.querySelector('[data-page="network"]');if(network)network.textContent='Réseau';setMobileLabel(network,'Réseau');
  const admin=nav.querySelector('[data-page="adminStudio"]');if(admin)admin.textContent='Admin';setMobileLabel(admin,'Admin');
  const development=nav.querySelector('[data-page="development"]');if(development)development.textContent='Développement';setMobileLabel(development,'Dév.');
  const refresh=document.getElementById('refreshBtn');if(refresh){refresh.title='Actualiser';refresh.setAttribute('aria-label','Actualiser')}
  const logout=document.getElementById('logoutBtn');if(logout){logout.title='Déconnexion';logout.setAttribute('aria-label','Déconnexion')}
}

export async function loadEnhancements(){
  bindAdminLazyRuntime();
  installDirectorExperience();
  const paths=[...modules];
  if(isDirector())paths.push('./director-exception-first.js');
  const results=await Promise.allSettled(paths.map(path=>import(`${path}?v=${BUILD}`)));
  const failed=results.filter(x=>x.status==='rejected');
  if(failed.length)console.warn(`${failed.length} module(s) StoreOps différé(s) non chargés`,failed.map(x=>x.reason));
}

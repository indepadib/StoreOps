import { api,health,isShowcase } from './api.js';
import { resetShowcase } from './mock-api.js';
import { resetCashShowcase } from './mock-cash.js';
import { resetLossShowcase } from './mock-loss.js';
import { resetCashOpeningShowcase } from './mock-cash-opening.js';
import { resetColdChainShowcase } from './mock-cold-chain.js';
import { resetStaffingShowcase } from './mock-staffing.js';
import { app,currentStore,isDirector } from './state.js';
import { $, $$,toast,roleLabel } from './ui.js';

const isManager=()=>app.user?.role==='store_manager';
const managerControlPages=new Set(['staffing','coldChain','cashOpening','commercial','receipts','dlc','inventory','quality','maintenance','losses','cash']);
const lazyModules=new Map();
const moduleForPage={
 today:'./pages/today.js',managerHome:'./pages/manager-home.js',managerScan:'./pages/manager-scan.js',managerTeam:'./pages/manager-team.js',managerPerformance:'./pages/manager-performance.js',managerHubs:'./pages/manager-hubs.js',process:'./pages/process.js',handover:'./pages/handover.js',staffing:'./pages/staffing.js',coldChain:'./pages/cold-chain.js',cashOpening:'./pages/cash-opening.js',dlc:'./pages/dlc.js',commercial:'./pages/commercial.js',receipts:'./pages/receipts.js',inventory:'./pages/inventory.js',losses:'./pages/losses.js',quality:'./pages/quality.js',maintenance:'./pages/maintenance.js',cash:'./pages/cash.js',network:'./pages/network.js',system:'./pages/system.js',adminStudio:'./pages/admin-studio.js',development:'./pages/development.js',incidents:'./pages/incidents.js',customProcessRuns:'./custom-process-runs.js'
};
function lazy(key){const path=moduleForPage[key]||key;if(!lazyModules.has(path))lazyModules.set(path,import(path));return lazyModules.get(path)}
async function invoke(key,name,...args){const mod=await lazy(key);const fn=mod?.[name];if(typeof fn!=='function')throw new Error(`Module StoreOps incomplet : ${name}`);return fn(...args)}
function managerTabFor(page){if(page==='today'||page==='managerPerformance')return'today';if(page==='managerScan')return'managerScan';if(page==='managerTeam'||page==='staffing')return'managerTeam';return'managerMore'}
function pilotSession(s){if(!app.showcase)return s;const patch=u=>u?.id==='u-vf'?{...u,name:'Ayoub Nachiti'}:u;return{...s,user:patch(s.user),availableDemoUsers:(s.availableDemoUsers||[]).map(patch)}}
function pilotStores(rows){if(!app.showcase)return rows;return(rows||[]).map(s=>s.id==='val-fleuri'?{...s,opening_time:'08:00',closing_time:'23:00'}:s)}

async function developmentAccessFor(user){
 const profile=String(user?.permissions_profile||'').toLowerCase();
 if(profile==='development'||profile==='platform_admin')return true;
 if(user?.role==='store_manager'||profile==='quality_audit')return false;
 try{await api('/api/development/config');return true}catch{return false}
}
function applyStores(rows){
 app.stores=pilotStores(rows||[]);
 if(!app.storeId||!app.stores.some(s=>s.id===app.storeId))app.storeId=app.stores[0]?.id||null;
 $('#storeSelect').innerHTML=app.stores.map(s=>`<option value="${s.id}" ${s.id===app.storeId?'selected':''}>${s.name}</option>`).join('');
 updateHeader()
}
async function loadStores(){applyStores(await api('/api/stores'))}
async function bootstrap(){
 const h=window.STOREOPS_BOOT_HEALTH||await health();
 app.authMode=h.authMode||'demo';app.version=h.version||'1.4';app.showcase=!!h.showcase;
 if(app.authMode==='entra'&&!sessionStorage.getItem('storeops_access_token'))throw new Error('Authentification Entra activée : connecter le frontend MSAL et fournir un access token à StoreOps.');
 const sessionPromise=api('/api/session');
 const storesPromise=api('/api/stores');
 const session=pilotSession(await sessionPromise);
 app.user=session.user;app.users=session.availableDemoUsers||[];
 const developmentPromise=developmentAccessFor(app.user);
 const [storeRows,developmentAccess]=await Promise.all([storesPromise,developmentPromise]);
 app.developmentAccess=developmentAccess;
 renderUserSelect();applyStores(storeRows);bind();
 setPage(app.developmentAccess&&!isDirector()?'development':'today');
 warmLikelyPages()
}
function renderUserSelect(){const el=$('#demoUser');if(app.authMode!=='demo'){el.hidden=true;return}el.hidden=false;el.innerHTML=app.users.map(u=>`<option value="${u.id}" ${u.id===app.user.id?'selected':''}>${u.name}</option>`).join('')}
function updateHeader(){const store=currentStore(),manager=isManager(),developmentOnly=app.developmentAccess&&!isDirector();$('#headerMeta').textContent=developmentOnly?`Réseau · Développement${app.showcase?' · MVP Showcase':''}`:`${store?.name||'Réseau'} · ${roleLabel(app.user.role)}${app.showcase?' · MVP Showcase':''}`;$('#rolePill').textContent=developmentOnly?'Développement':(app.showcase?'MVP · '+roleLabel(app.user.role):roleLabel(app.user.role));$('#networkNav').hidden=!isDirector();$('#adminStudioNav').hidden=!isDirector();$('#systemNav').hidden=!isDirector();$('#developmentNav').hidden=!app.developmentAccess;document.body.classList.toggle('manager-mode',manager);document.body.classList.toggle('development-only',developmentOnly);$('#managerNav').hidden=!manager;$('#developmentNavBar').hidden=!developmentOnly;$('#nav').hidden=manager||developmentOnly;$('#storeSelect').classList.toggle('manager-single-store',manager&&app.stores.length===1);ensureShowcaseControls()}
function ensureShowcaseControls(){if(!isShowcase())return;const host=document.querySelector('.top-controls');if(!host||document.querySelector('#resetShowcaseBtn'))return;const b=document.createElement('button');b.id='resetShowcaseBtn';b.className='btn ghost';b.textContent='Réinitialiser démo';b.onclick=()=>{if(confirm('Réinitialiser toutes les données de démonstration ?')){resetShowcase();resetCashShowcase();resetLossShowcase();resetCashOpeningShowcase();resetColdChainShowcase();resetStaffingShowcase();location.reload()}};host.appendChild(b)}
function warmLikelyPages(){
 const run=()=>{
  const keys=isManager()?['managerScan','managerTeam','managerHubs']:isDirector()?['network','adminStudio','system']:[];
  Promise.allSettled(keys.map(lazy)).catch(()=>{})
 };
 if('requestIdleCallback'in window)window.requestIdleCallback(run,{timeout:3500});else setTimeout(run,700)
}
export function setPage(page){if((page==='network'||page==='system'||page==='adminStudio')&&!isDirector())page='today';if(page==='development'&&!app.developmentAccess)page='today';if(app.developmentAccess&&!isDirector()&&page!=='development')page='development';app.page=page;$$('.page').forEach(x=>x.classList.remove('active'));const target=$(`#${page}Page`);if(!target)return setPage('today');target.classList.add('active');$$('#nav button[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));const managerTab=managerTabFor(page);$$('#managerNav button[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===managerTab));$$('#developmentNavBar button[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));window.scrollTo({top:0,behavior:'smooth'});renderPage(page)}
async function renderOpeningPage(){const [processMod,customMod]=await Promise.all([lazy('process'),lazy('customProcessRuns')]);await processMod.renderProcess('opening');await customMod.mountCustomProcessRuns('openingContent','STORE_OPENING');try{const [staff,cold,cash,handover]=await Promise.all([api(`/api/stores/${app.storeId}/staffing`),api(`/api/stores/${app.storeId}/cold-chain`),api(`/api/stores/${app.storeId}/cash-opening`),api(`/api/stores/${app.storeId}/handover`)]);if(handover.stats?.blocking){$('#openingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-danger process-lock"><strong>${handover.stats.blocking} passation(s) bloquante(s)</strong><span>Ces sujets doivent être résolus avant de pouvoir ouvrir le magasin.</span><button class="btn soft" data-go-handover style="margin-top:8px">Ouvrir Passation</button></div>`)}if(staff.summary?.blocking){$('#openingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-danger process-lock"><strong>Équipe d’ouverture non prête</strong><span>${staff.summary.pending||0} personne(s) à pointer · manque ${staff.summary.gaps?.managers||0} responsable, ${staff.summary.gaps?.cashiers||0} caisse, ${staff.summary.gaps?.floor||0} surface.</span><button class="btn soft" data-go-staffing style="margin-top:8px">Ouvrir Équipe & prise de poste</button></div>`)}else if(staff.summary?.status==='READY'){$('#openingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-info process-lock"><strong>Équipe prête</strong><span>Couverture minimale atteinte et planning entièrement pointé. L’étape 1 est validée automatiquement.</span></div>`)}if(cold.summary?.blocking){$('#openingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-danger process-lock"><strong>${cold.summary.blocking} zone(s) froid à contrôler avant ouverture</strong><span>${cold.summary.ready||0}/${cold.summary.lines||0} conforme(s) · ${cold.summary.mismatch||0} hors tolérance.</span><button class="btn soft" data-go-cold-chain style="margin-top:8px">Ouvrir Chaîne du froid</button></div>`)}else if(cold.summary?.status==='READY'){$('#openingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-info process-lock"><strong>Chaîne du froid conforme</strong><span>${cold.summary.ready||0}/${cold.summary.lines||0} zones conformes. L’étape 4 est validée automatiquement.</span></div>`)}if(cash.summary?.blocking){$('#openingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-danger process-lock"><strong>${cash.summary.blocking} caisse(s) à préparer avant ouverture</strong><span>${cash.summary.ready||0}/${cash.summary.lines||0} prête(s) · ${cash.summary.mismatch||0} non conforme(s).</span><button class="btn soft" data-go-cash-opening style="margin-top:8px">Ouvrir Préparation caisses</button></div>`)}else if(cash.summary?.status==='READY'){$('#openingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-info process-lock"><strong>Caisses prêtes</strong><span>${cash.summary.ready||0}/${cash.summary.lines||0} caisses conformes. L’étape 7 est validée automatiquement.</span></div>`)}}catch{}}
async function renderClosingPage(){const [processMod,customMod]=await Promise.all([lazy('process'),lazy('customProcessRuns')]);await processMod.renderProcess('closing');await customMod.mountCustomProcessRuns('closingContent','STORE_CLOSING');try{const [d,l]=await Promise.all([api(`/api/stores/${app.storeId}/dashboard`),api(`/api/stores/${app.storeId}/losses`)]);if(!d.cycle?.handoverReviewed){$('#closingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-danger process-lock"><strong>Passation de fin de journée à revoir</strong><span>La fermeture restera bloquée tant que la passation n’a pas été revue.</span><button class="btn soft" data-go-handover style="margin-top:8px">Ouvrir Passation</button></div>`)}if(d.cash?.blocking){$('#closingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-danger process-lock cash-closing-gate"><strong>Clôture caisses à finaliser</strong><span>Statut : ${d.cash.status||'non démarrée'} · ${d.cash.pending||0} shift(s) à compter · ${d.cash.recounts||0} recomptage(s).</span><button class="btn soft" data-go-cash style="margin-top:8px">Ouvrir Caisses & clôture</button></div>`)}if(l.summary?.blocking){$('#closingContent')?.insertAdjacentHTML('afterbegin',`<div class="banner ban-danger process-lock"><strong>${l.summary.blocking} perte(s) / démarque(s) à finaliser</strong><span>Chaque sortie du jour doit être documentée, approuvée si nécessaire et intégrée au Closing Pack avant fermeture.</span><button class="btn soft" data-go-losses style="margin-top:8px">Ouvrir Démarque & pertes</button></div>`)}}catch{}}
async function renderPage(page){try{
 if(page==='today')return isManager()?invoke('managerHome','renderManagerHome'):invoke('today','renderToday');
 if(page==='managerScan')return invoke('managerScan','renderManagerScan');
 if(page==='managerTeam')return invoke('managerTeam','renderManagerTeam');
 if(page==='managerPerformance')return invoke('managerPerformance','renderManagerPerformance');
 if(page==='managerJourney')return invoke('managerHubs','renderManagerJourney');
 if(page==='managerControls')return invoke('managerHubs','renderManagerControls');
 if(page==='managerMore')return invoke('managerHubs','renderManagerMore');
 if(page==='opening')return renderOpeningPage();
 if(page==='handover')return invoke('handover','renderHandover');
 if(page==='staffing')return invoke('staffing','renderStaffing');
 if(page==='coldChain')return invoke('coldChain','renderColdChain');
 if(page==='cashOpening')return invoke('cashOpening','renderCashOpening');
 if(page==='closing')return renderClosingPage();
 if(page==='commercial')return invoke('commercial','renderCommercial');
 if(page==='dlc')return invoke('dlc','renderDlc');
 if(page==='receipts')return invoke('receipts','renderReceipts');
 if(page==='inventory')return invoke('inventory','renderInventory');
 if(page==='losses')return invoke('losses','renderLosses');
 if(page==='quality')return invoke('quality','renderQuality');
 if(page==='maintenance')return invoke('maintenance','renderMaintenance');
 if(page==='incidents')return invoke('incidents','renderIncidents');
 if(page==='cash')return invoke('cash','renderCash');
 if(page==='network')return invoke('network','renderNetwork');
 if(page==='adminStudio')return invoke('adminStudio','renderAdminStudio');
 if(page==='development')return invoke('development','renderDevelopment');
 if(page==='system')return invoke('system','renderSystem')
 }catch(e){console.error(e);toast(e.message)}}
function bind(){
 $('#demoUser').addEventListener('change',async e=>{localStorage.setItem('storeops_user',e.target.value);const s=pilotSession(await api('/api/session'));app.user=s.user;app.users=s.availableDemoUsers||[];app.developmentAccess=await developmentAccessFor(app.user);renderUserSelect();app.storeId=null;await loadStores();setPage(app.developmentAccess&&!isDirector()?'development':'today');toast(app.showcase?'Profil de démonstration appliqué.':'Périmètre appliqué par le backend.')});
 $('#storeSelect').addEventListener('change',e=>{app.storeId=e.target.value;updateHeader();renderPage(app.page)});$('#refreshBtn').onclick=()=>renderPage(app.page);$$('#nav button[data-page],#managerNav button[data-page],#developmentNavBar button[data-page]').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
 $('#modalClose').onclick=()=>invoke('process','closeTask');$('#taskModal').addEventListener('click',e=>{if(e.target.id==='taskModal')invoke('process','closeTask')});$('#modalSubmit').onclick=async()=>{try{await invoke('process','submitActiveTask')}catch{}};
 $('#incidentModalClose').onclick=()=>invoke('incidents','closeIncident');$('#incidentModal').addEventListener('click',e=>{if(e.target.id==='incidentModal')invoke('incidents','closeIncident')});
 document.addEventListener('click',async e=>{try{const managerGo=e.target.closest('[data-manager-go]');if(managerGo)return setPage(managerGo.dataset.managerGo);const goHandover=e.target.closest('[data-go-handover]');if(goHandover)return setPage('handover');const goStaff=e.target.closest('[data-go-staffing]');if(goStaff)return setPage('staffing');const goCold=e.target.closest('[data-go-cold-chain]');if(goCold)return setPage('coldChain');const goCashOpening=e.target.closest('[data-go-cash-opening]');if(goCashOpening)return setPage('cashOpening');const goCash=e.target.closest('[data-go-cash]');if(goCash)return setPage('cash');const goLosses=e.target.closest('[data-go-losses]');if(goLosses)return setPage('losses');const take=e.target.closest('[data-take]');if(take){await api(`/api/stores/${app.storeId}/process/${take.dataset.take}/take`,{method:'POST'});toast('Prise en charge enregistrée.');return renderPage(take.dataset.take)}const form=e.target.closest('[data-task-form]');if(form)return invoke('process','openTask',form.dataset.taskForm);const val=e.target.closest('[data-validate]');if(val){await api(`/api/stores/${app.storeId}/process/${val.dataset.validate}/validate`,{method:'POST'});toast(val.dataset.validate==='opening'?'Magasin déclaré prêt.':'Magasin déclaré fermé.');return renderPage(val.dataset.validate)}const qc=e.target.closest('[data-control-line]');if(qc)return invoke('receipts','controlReceiptLine',qc);const post=e.target.closest('[data-post-receipt]');if(post){await api(`/api/receipts/${encodeURIComponent(post.dataset.postReceipt)}/post`,{method:'POST'});toast('Réception système confirmée.');return invoke('receipts','renderReceipts')}const oi=e.target.closest('[data-open-incident]');if(oi)return invoke('incidents','openIncident',oi.dataset.openIncident);const ca=e.target.closest('[data-complete-incident-action]');if(ca)return invoke('incidents','completeIncidentAction',ca.dataset.completeIncidentAction);const ve=e.target.closest('[data-view-evidence]');if(ve)return invoke('incidents','viewEvidence',ve.dataset.viewEvidence);const ns=e.target.closest('[data-network-store]');if(ns){app.storeId=ns.dataset.networkStore;$('#storeSelect').value=app.storeId;updateHeader();setPage('today')}}catch(err){console.error(err);toast(err.message)}})
}
bootstrap().catch(e=>{console.error(e);document.body.innerHTML=`<div style="padding:30px;font-family:system-ui"><h2>Impossible de charger StoreOps</h2><p>${e.message}</p><p>Le mode Showcase doit fonctionner sans backend. Si ce message apparaît encore, recharge le site après le prochain déploiement.</p></div>`});

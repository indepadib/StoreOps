import { api,health,isShowcase } from './api.js';
import { resetShowcase } from './mock-api.js';
import { resetCashShowcase } from './mock-cash.js';
import { app,currentStore,isDirector } from './state.js';
import { $, $$,toast,roleLabel } from './ui.js';
import { renderToday } from './pages/today.js';
import { renderProcess,openTask,closeTask,submitActiveTask } from './pages/process.js';
import { renderDlc } from './pages/dlc.js';
import { renderCommercial } from './pages/commercial.js';
import { renderReceipts,controlReceiptLine } from './pages/receipts.js';
import { renderInventory } from './pages/inventory.js';
import { renderQuality } from './pages/quality.js';
import { renderCash } from './pages/cash.js';
import { renderNetwork } from './pages/network.js';
import { renderSystem } from './pages/system.js';
import { renderIncidents,openIncident,closeIncident,completeIncidentAction,viewEvidence } from './pages/incidents.js';

async function bootstrap(){
  const h=await health();app.authMode=h.authMode||'demo';app.version=h.version||'1.4';app.showcase=!!h.showcase;
  if(app.authMode==='entra' && !sessionStorage.getItem('storeops_access_token')) throw new Error('Authentification Entra activée : connecter le frontend MSAL et fournir un access token à StoreOps.');
  const s=await api('/api/session');app.user=s.user;app.users=s.availableDemoUsers||[];renderUserSelect();await loadStores();bind();setPage('today');
}
function renderUserSelect(){const el=$('#demoUser');if(app.authMode!=='demo'){el.hidden=true;return}el.hidden=false;el.innerHTML=app.users.map(u=>`<option value="${u.id}" ${u.id===app.user.id?'selected':''}>${u.name}</option>`).join('')}
async function loadStores(){app.stores=await api('/api/stores');if(!app.storeId||!app.stores.some(s=>s.id===app.storeId))app.storeId=app.stores[0]?.id||null;$('#storeSelect').innerHTML=app.stores.map(s=>`<option value="${s.id}" ${s.id===app.storeId?'selected':''}>${s.name}</option>`).join('');updateHeader()}
function updateHeader(){const store=currentStore();$('#headerMeta').textContent=`${store?.name||'Réseau'} · ${roleLabel(app.user.role)}${app.showcase?' · MVP Showcase':''}`;$('#rolePill').textContent=app.showcase?'MVP · '+roleLabel(app.user.role):roleLabel(app.user.role);$('#networkNav').hidden=!isDirector();$('#systemNav').hidden=!isDirector();ensureShowcaseControls()}
function ensureShowcaseControls(){if(!isShowcase())return;const host=document.querySelector('.top-controls');if(!host||document.querySelector('#resetShowcaseBtn'))return;const b=document.createElement('button');b.id='resetShowcaseBtn';b.className='btn ghost';b.textContent='Réinitialiser démo';b.onclick=()=>{if(confirm('Réinitialiser toutes les données de démonstration ?')){resetShowcase();resetCashShowcase();location.reload()}};host.appendChild(b)}
export function setPage(page){if((page==='network'||page==='system')&&!isDirector())page='today';app.page=page;$$('.page').forEach(x=>x.classList.remove('active'));$(`#${page}Page`).classList.add('active');$$('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===page));renderPage(page)}
async function renderPage(page){try{if(page==='today')return renderToday();if(page==='opening')return renderProcess('opening');if(page==='closing')return renderProcess('closing');if(page==='commercial')return renderCommercial();if(page==='dlc')return renderDlc();if(page==='receipts')return renderReceipts();if(page==='inventory')return renderInventory();if(page==='quality')return renderQuality();if(page==='incidents')return renderIncidents();if(page==='cash')return renderCash();if(page==='network')return renderNetwork();if(page==='system')return renderSystem()}catch(e){console.error(e);toast(e.message)}}
function bind(){
  $('#demoUser').addEventListener('change',async e=>{localStorage.setItem('storeops_user',e.target.value);const s=await api('/api/session');app.user=s.user;app.users=s.availableDemoUsers||[];renderUserSelect();app.storeId=null;await loadStores();setPage('today');toast(app.showcase?'Profil de démonstration appliqué.':'Périmètre appliqué par le backend.')});
  $('#storeSelect').addEventListener('change',e=>{app.storeId=e.target.value;updateHeader();renderPage(app.page)});$('#refreshBtn').onclick=()=>renderPage(app.page);$$('.nav button[data-page]').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
  $('#modalClose').onclick=closeTask;$('#taskModal').addEventListener('click',e=>{if(e.target.id==='taskModal')closeTask()});$('#modalSubmit').onclick=async()=>{try{await submitActiveTask()}catch{}};$('#incidentModalClose').onclick=closeIncident;$('#incidentModal').addEventListener('click',e=>{if(e.target.id==='incidentModal')closeIncident()});
  document.addEventListener('click',async e=>{try{
    const take=e.target.closest('[data-take]');if(take){await api(`/api/stores/${app.storeId}/process/${take.dataset.take}/take`,{method:'POST'});toast('Prise en charge enregistrée.');return renderPage(take.dataset.take)}
    const form=e.target.closest('[data-task-form]');if(form)return openTask(form.dataset.taskForm);
    const val=e.target.closest('[data-validate]');if(val){await api(`/api/stores/${app.storeId}/process/${val.dataset.validate}/validate`,{method:'POST'});toast(val.dataset.validate==='opening'?'Magasin déclaré prêt.':'Magasin déclaré fermé.');return renderPage(val.dataset.validate)}
    const qc=e.target.closest('[data-control-line]');if(qc)return controlReceiptLine(qc);
    const post=e.target.closest('[data-post-receipt]');if(post){await api(`/api/receipts/${encodeURIComponent(post.dataset.postReceipt)}/post`,{method:'POST'});toast('Réception système confirmée.');return renderReceipts()}
    const oi=e.target.closest('[data-open-incident]');if(oi)return openIncident(oi.dataset.openIncident);
    const ca=e.target.closest('[data-complete-incident-action]');if(ca)return completeIncidentAction(ca.dataset.completeIncidentAction);
    const ve=e.target.closest('[data-view-evidence]');if(ve)return viewEvidence(ve.dataset.viewEvidence);
    const ns=e.target.closest('[data-network-store]');if(ns){app.storeId=ns.dataset.networkStore;$('#storeSelect').value=app.storeId;updateHeader();setPage('today')}
  }catch(err){console.error(err);toast(err.message)}})
}
bootstrap().catch(e=>{console.error(e);document.body.innerHTML=`<div style="padding:30px;font-family:system-ui"><h2>Impossible de charger StoreOps</h2><p>${e.message}</p><p>Le mode Showcase doit fonctionner sans backend. Si ce message apparaît encore, recharge le site après le prochain déploiement.</p></div>`});
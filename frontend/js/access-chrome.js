import {api} from './api.js';
import {app,isDirector} from './state.js';

const pageCapabilities={
 network:'network.view',quality:'quality.view',dlc:'dlc.view',receipts:'receiving.view',incidents:'incidents.view',inventory:'inventory.view',commercial:'commercial.view',losses:'losses.view',maintenance:'maintenance.view',development:'development.view',adminStudio:'admin.studio',system:'system.view'
};
const managerOnlyPages=new Set(['opening','handover','staffing','coldChain','cashOpening','cash','closing']);

function visible(page){
 if(isDirector())return true;
 if(page==='today')return app.capabilities?.['today.view']!==false;
 if(pageCapabilities[page])return !!app.capabilities?.[pageCapabilities[page]];
 if(managerOnlyPages.has(page))return app.user?.role==='store_manager';
 return app.user?.role==='store_manager'
}
function applyNavigation(){
 const nav=document.getElementById('nav');if(!nav)return;
 nav.querySelectorAll('button[data-page]').forEach(b=>{b.hidden=!visible(b.dataset.page)});
 const qualityAudit=app.accessProfile==='QUALITY_AUDIT';
 document.body.classList.toggle('quality-audit-mode',qualityAudit);
 if(qualityAudit){
  const pill=document.getElementById('rolePill');if(pill)pill.textContent='Qualité & Audit';
  const store=document.getElementById('storeSelect');if(store)store.hidden=false;
 }
}
function syncActiveChrome(){
 const active=document.querySelector('main > .page.active'),pageId=active?.id||'',page=pageId.endsWith('Page')?pageId.slice(0,-4):null;
 const ops=document.getElementById('storeopsOperationsNav');
 if(ops&&pageId!=='operationsHubPage')ops.classList.remove('active');
 document.querySelectorAll('#nav button[data-page],#managerNav button[data-page],#developmentNavBar button[data-page]').forEach(b=>{
  if(page&&b.dataset.page===page)b.classList.add('active');
  else if(b.closest('#nav'))b.classList.remove('active')
 })
}
async function init(){
 try{
  const access=await api('/api/access/me');
  app.accessProfile=access.profile||null;app.capabilities=access.effective||{};
 }catch(e){console.warn('StoreOps droits fins indisponibles',e)}
 applyNavigation();syncActiveChrome();
 const observer=new MutationObserver(()=>{applyNavigation();syncActiveChrome()});
 const main=document.querySelector('main');if(main)observer.observe(main,{subtree:false,childList:false,attributes:true,attributeFilter:['class']});
 document.getElementById('nav')?.addEventListener('click',e=>{if(e.target.closest('button[data-page]'))document.getElementById('storeopsOperationsNav')?.classList.remove('active')},true)
}

init();

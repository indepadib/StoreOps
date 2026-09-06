import { health } from './api.js';
import { ensureAccessToken,ensureLocalSession,renderLoginScreen,hideLoginScreen,addLogoutControl,startAuthKeepAlive } from './auth.js';

function runtimeShowcase(){return (window.STOREOPS_CONFIG?.mode||'showcase')==='showcase'||!window.STOREOPS_CONFIG?.apiBase}
function healthWithTimeout(ms=4500){return Promise.race([health(),new Promise((_,reject)=>setTimeout(()=>{const e=new Error('Le backend StoreOps ne répond pas.');e.code='API_BOOT_TIMEOUT';reject(e)},ms))])}
function markStarted(){document.body.dataset.storeopsBooted='1';window.dispatchEvent(new Event('storeops:booted'))}
function renderBackendFailure(e){
  markStarted();
  const meta=document.querySelector('#headerMeta');if(meta)meta.textContent='Backend indisponible';
  const main=document.querySelector('main');if(main)main.innerHTML=`<section style="max-width:560px;margin:34px auto;padding:22px;font-family:system-ui"><h1 style="font-size:28px;margin:0 0 10px">StoreOps n’arrive pas à joindre son backend</h1><p style="line-height:1.5">Le téléphone et le site fonctionnent. C’est l’API StoreOps configurée pour ce déploiement qui ne répond pas.</p><p style="font-size:13px;opacity:.72;overflow-wrap:anywhere">${String(e?.message||'API indisponible')}</p><button id="storeopsApiRetry" style="width:100%;min-height:52px;border:0;border-radius:14px;font-weight:800;font-size:17px">Réessayer</button></section>`;
  document.querySelector('#storeopsApiRetry')?.addEventListener('click',()=>location.reload());
}

async function loadApp(){await import('./app.js');markStarted()}

async function start(){
  let h;
  try{h=await healthWithTimeout()}catch(e){
    if(runtimeShowcase()){await loadApp();return}
    renderBackendFailure(e);return;
  }
  if(h.authMode==='local'){
    const session=await ensureLocalSession();
    if(!session){markStarted();renderLoginScreen({mode:'local'});return}
    hideLoginScreen();
    await loadApp();
    addLogoutControl();
    return;
  }
  if(h.authMode!=='entra'){
    await loadApp();return;
  }
  try{
    const token=await ensureAccessToken();
    if(!token){markStarted();renderLoginScreen({mode:'entra'});return}
    hideLoginScreen();
    startAuthKeepAlive();
    await loadApp();
    addLogoutControl();
  }catch(e){
    console.error(e);
    markStarted();
    renderLoginScreen({message:e.message,mode:'entra'});
  }
}
start().catch(e=>{console.error(e);renderBackendFailure(e)});

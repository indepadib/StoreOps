const BUILD='1560';

function runtimeShowcase(){return (window.STOREOPS_CONFIG?.mode||'showcase')==='showcase'||!window.STOREOPS_CONFIG?.apiBase}
function markStarted(){document.body.dataset.storeopsBooted='1';window.dispatchEvent(new Event('storeops:booted'))}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
function withTimeout(promise,ms,message){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>{const e=new Error(message);e.code='API_BOOT_TIMEOUT';reject(e)},ms))])}

function renderStartupFailure(e,{backend=false}={}){
  markStarted();
  const meta=document.querySelector('#headerMeta');if(meta)meta.textContent=backend?'Backend indisponible':'Erreur démarrage';
  const main=document.querySelector('main');
  const title=backend?'StoreOps n’arrive pas à joindre son backend':'StoreOps n’a pas pu démarrer';
  const copy=backend?'Le téléphone et le site fonctionnent. C’est l’API StoreOps configurée pour ce déploiement qui ne répond pas.':'Le site est chargé mais une étape d’initialisation a échoué. L’erreur exacte est affichée ci-dessous.';
  if(main)main.innerHTML=`<section style="max-width:560px;margin:34px auto;padding:22px;font-family:system-ui"><div style="font-size:13px;font-weight:800;opacity:.65;margin-bottom:8px">StoreOps v1.56.0</div><h1 style="font-size:28px;margin:0 0 10px">${title}</h1><p style="line-height:1.5">${copy}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f3f5;border-radius:12px;padding:12px;font-size:12px">${String(e?.message||e||'Erreur inconnue').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre><button id="storeopsApiRetry" style="width:100%;min-height:52px;border:0;border-radius:14px;font-weight:800;font-size:17px">Réessayer</button></section>`;
  document.querySelector('#storeopsApiRetry')?.addEventListener('click',()=>location.reload());
}

async function waitForStoreOpsUi(ms=10000){
  const started=Date.now();
  while(Date.now()-started<ms){
    const meta=document.querySelector('#headerMeta');
    const storeSelect=document.querySelector('#storeSelect');
    const text=(meta?.textContent||'').trim();
    if(text&&!/^(Chargement|Démarrage)/.test(text)&&storeSelect?.options?.length>0)return true;
    const bodyText=document.body?.textContent||'';
    if(bodyText.includes('Impossible de charger StoreOps'))throw new Error('Le bootstrap applicatif a échoué avant le chargement du magasin.');
    await sleep(120);
  }
  throw new Error('Le profil ou le magasin n’a pas été chargé dans le délai prévu.');
}

async function loadApp(){
  await import(`./app.js?v=${BUILD}`);
  await waitForStoreOpsUi();
  markStarted();
}

async function prepareBoot(){
  try{await withTimeout(window.STOREOPS_BOOT_PREP||Promise.resolve(),1500,'Le nettoyage navigateur prend trop de temps. StoreOps poursuit le démarrage.')}catch(e){console.warn('Préparation démarrage StoreOps',e)}
}

async function start(){
  await prepareBoot();

  // Netlify sans STOREOPS_API_BASE = Showcase autonome. Dans ce mode il n’y a
  // aucune raison de bloquer le démarrage sur l’authentification ou un healthcheck réseau.
  if(runtimeShowcase()){
    try{await loadApp()}catch(e){console.error(e);renderStartupFailure(e)}
    return;
  }

  const [{health},auth]=await Promise.all([import(`./api.js?v=${BUILD}`),import(`./auth.js?v=${BUILD}`)]);
  const {ensureAccessToken,ensureLocalSession,renderLoginScreen,hideLoginScreen,addLogoutControl,startAuthKeepAlive}=auth;
  let h;
  try{h=await withTimeout(health(),4500,'Le backend StoreOps ne répond pas.')}catch(e){renderStartupFailure(e,{backend:true});return}
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
    renderStartupFailure(e);
  }
}
start().catch(e=>{console.error(e);renderStartupFailure(e)});
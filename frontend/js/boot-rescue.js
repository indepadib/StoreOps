const BOOT_KEY='storeops_boot_rescue_v153';
const CACHE_PREFIX='storeops-shell-';

async function clearStoreOpsShell(){
  try{
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister().catch(()=>false)));
    }
    if('caches' in window){
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)).map(k=>caches.delete(k)));
    }
  }catch(e){console.warn('StoreOps boot rescue cache cleanup failed',e)}
}

function booted(){
  const meta=document.querySelector('#headerMeta');
  return document.body.dataset.storeopsBooted==='1'||(meta&&meta.textContent&&meta.textContent.trim()!=='Chargement…');
}

function renderBootFailure(){
  const root=document.querySelector('main')||document.body;
  root.innerHTML=`<section style="max-width:560px;margin:34px auto;padding:22px;font-family:system-ui"><h1 style="font-size:28px;margin:0 0 10px">StoreOps n’a pas démarré</h1><p style="line-height:1.5">Le navigateur a chargé l’écran mais pas l’application. Recharge une fois. Si le problème continue, StoreOps affichera ensuite l’erreur technique au lieu de rester vide.</p><button id="storeopsBootReload" style="width:100%;min-height:52px;border:0;border-radius:14px;font-weight:800;font-size:17px">Recharger StoreOps</button></section>`;
  document.querySelector('#storeopsBootReload')?.addEventListener('click',()=>location.reload());
}

setTimeout(async()=>{
  if(booted())return;
  const already=sessionStorage.getItem(BOOT_KEY)==='1';
  if(!already){
    sessionStorage.setItem(BOOT_KEY,'1');
    await clearStoreOpsShell();
    const u=new URL(location.href);u.searchParams.set('storeops_fresh',Date.now().toString(36));location.replace(u.toString());
    return;
  }
  sessionStorage.removeItem(BOOT_KEY);
  renderBootFailure();
},5000);

window.addEventListener('storeops:booted',()=>sessionStorage.removeItem(BOOT_KEY));

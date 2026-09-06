(function(){
  var BUILD='1.67.0';
  var errors=[];
  window.STOREOPS_BUILD=BUILD;
  window.STOREOPS_BOOT_ERRORS=errors;

  function msg(v){
    try{return String(v&&v.message?v.message:v||'Erreur inconnue')}catch(_){return'Erreur inconnue'}
  }
  function remember(v){var text=msg(v);if(text&&errors.indexOf(text)<0)errors.push(text);}

  window.addEventListener('error',function(e){remember(e.error||e.message);});
  window.addEventListener('unhandledrejection',function(e){remember(e.reason);});

  async function cleanLegacyRuntime(){
    try{
      if('serviceWorker' in navigator){
        var regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function(r){return r.unregister().catch(function(){return false;});}));
      }
      if('caches' in window){
        var keys=await caches.keys();
        await Promise.all(keys.filter(function(k){return k.indexOf('storeops-shell-')===0;}).map(function(k){return caches.delete(k);}));
      }
    }catch(e){remember(e);}
  }
  window.STOREOPS_BOOT_PREP=cleanLegacyRuntime();

  function markStarting(){
    var meta=document.querySelector('#headerMeta');
    if(meta&&meta.textContent.trim()==='Chargement…')meta.textContent='Démarrage · v'+BUILD;
  }
  function uiReady(){
    var meta=document.querySelector('#headerMeta');
    var store=document.querySelector('#storeSelect');
    var text=(meta&&meta.textContent||'').trim();
    return !!(store&&store.options&&store.options.length>0&&text&&!/^(Chargement|Démarrage|Erreur démarrage)/.test(text));
  }
  function authGateReady(){
    var gate=document.querySelector('#storeopsAuthGate');
    return !!(gate&&!gate.hidden&&gate.textContent&&gate.textContent.trim());
  }
  function renderFailure(forced){
    if(uiReady()||authGateReady()||document.body?.dataset?.storeopsBooted==='1')return;
    if(forced)remember(forced);
    var meta=document.querySelector('#headerMeta');
    if(meta)meta.textContent='Erreur démarrage · v'+BUILD;
    var main=document.querySelector('main');
    if(!main)return;
    var phase=String(window.STOREOPS_BOOT_PHASE||'inconnue');
    var detail=errors.length?errors.join(' · '):'Le bootstrap est resté incomplet. Dernière étape connue : '+phase+'.';
    main.innerHTML='<section style="max-width:560px;margin:34px auto;padding:22px;font-family:system-ui"><div style="font-size:13px;font-weight:800;opacity:.65;margin-bottom:8px">StoreOps v'+BUILD+'</div><h1 style="font-size:28px;margin:0 0 10px">Impossible de démarrer StoreOps</h1><p style="line-height:1.5">Le shell HTML est chargé, mais l’application n’a pas terminé son démarrage dans le délai de sécurité. Le watchdog n’interrompt plus un flux Microsoft ou un cold start encore actif.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;background:#f7f3f5;border-radius:12px;padding:12px;font-size:12px">'+detail.replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];})+'</pre><button id="storeopsHardReload" style="width:100%;min-height:52px;border:0;border-radius:14px;font-weight:800;font-size:17px">Recharger</button></section>';
    var b=document.querySelector('#storeopsHardReload');if(b)b.addEventListener('click',function(){location.reload();});
  }
  function armWatchdog(){
    setTimeout(function check(){
      if(uiReady()||authGateReady()||document.body?.dataset?.storeopsBooted==='1')return;
      var heartbeat=Number(window.STOREOPS_BOOT_HEARTBEAT||0);
      if(heartbeat&&Date.now()-heartbeat<12000){setTimeout(check,12000);return;}
      renderFailure();
    },30000);
  }
  window.STOREOPS_FATAL=function(e){renderFailure(e);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){markStarting();armWatchdog();},{once:true});
  else{markStarting();armWatchdog();}
})();

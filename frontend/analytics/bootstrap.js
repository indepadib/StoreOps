import { app } from '/js/state.js';
import { api, health } from '/js/api.js';
import { ensureAccessToken, ensureLocalSession } from '/js/auth.js';

function showBootFailure(message){
  const root=document.querySelector('#analyticsContent')||document.querySelector('main');
  if(root)root.innerHTML=`<section class="empty-product"><div class="empty-icon">!</div><h1>Retail Intelligence indisponible</h1><p>${String(message||'Erreur de démarrage').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</p></section>`;
}

function returnToStoreOps(){
  sessionStorage.setItem('storeops_return_path','/analytics/');
  location.assign('/');
}

async function start(){
  try{
    const h=await health();
    app.authMode=h?.authMode||'demo';

    if(app.authMode==='local'){
      const session=await ensureLocalSession();
      if(!session)return returnToStoreOps();
    }else if(app.authMode==='entra'){
      const token=await ensureAccessToken();
      if(!token)return returnToStoreOps();
    }

    window.RETAIL_INTELLIGENCE_API=api;
    window.RETAIL_INTELLIGENCE_HEALTH=h;

    await import('/analytics/tenants.js');
    await import('/analytics/analytics.js');
    await import('/analytics/categories.js');
    await import('/analytics/inventory.js');
  }catch(error){
    console.error('Retail Intelligence bootstrap failure',error);
    if(Number(error?.status)===401||Number(error?.status)===403)return returnToStoreOps();
    showBootFailure(error?.message||error);
  }
}

start();
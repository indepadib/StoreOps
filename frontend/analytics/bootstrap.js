import { app } from '/js/state.js';
import { api, health } from '/js/api.js';
import { ensureAccessToken, ensureLocalSession } from '/js/auth.js';
import {preloadAnalyticsModules} from './startup-preload.js';

function showBootFailure(message){
  const root=document.querySelector('#analyticsContent')||document.querySelector('main');
  if(root)root.insertAdjacentHTML('afterbegin',`<section class="empty-product"><div class="empty-icon">!</div><h1>Retail Intelligence indisponible</h1><p>${String(message||'Erreur de démarrage').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</p></section>`);
}

function returnToStoreOps(){
  sessionStorage.setItem('storeops_return_path','/analytics/');
  location.assign('/');
}

const build=new URL(import.meta.url).searchParams.get('v')||'dev';
const analyticsAsset=path=>`${path}?v=${encodeURIComponent(build)}`;

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

    // Fetch independent files in parallel without changing their initialization order.
    preloadAnalyticsModules(document,[
      'tenants','analytics','monthly-sales-export','categories','inventory','loyalty',
      'promotions','decision','supplier-purchases','sales-proof','workspace-bi',
      'article-reference','decision-studio','customer-research','companion-dictionary',
      'basket-direction','loss-inventory','detention-views','detention-sales',
      'replenishment','experience-navigation','table-column-tools'
    ].map(name=>analyticsAsset('/analytics/'+name+'.js')));

    await import(analyticsAsset('/analytics/tenants.js'));
    await import(analyticsAsset('/analytics/analytics.js'));
    await import(analyticsAsset('/analytics/monthly-sales-export.js'));
    await import(analyticsAsset('/analytics/categories.js'));
    await import(analyticsAsset('/analytics/inventory.js'));
    await import(analyticsAsset('/analytics/loyalty.js'));
    await import(analyticsAsset('/analytics/promotions.js'));
    await import(analyticsAsset('/analytics/decision.js'));
    await import(analyticsAsset('/analytics/supplier-purchases.js'));
    await import(analyticsAsset('/analytics/sales-proof.js'));
    await import(analyticsAsset('/analytics/workspace-bi.js'));
    await import(analyticsAsset('/analytics/article-reference.js'));
    await import(analyticsAsset('/analytics/decision-studio.js'));
    await import(analyticsAsset('/analytics/customer-research.js'));

    await import(analyticsAsset('/analytics/companion-dictionary.js'));
    await import(analyticsAsset('/analytics/basket-direction.js'));
    await import(analyticsAsset('/analytics/loss-inventory.js'));
    await import(analyticsAsset('/analytics/detention-views.js'));
    await import(analyticsAsset('/analytics/detention-sales.js'));
    await import(analyticsAsset('/analytics/replenishment.js'));
    await import(analyticsAsset('/analytics/experience-navigation.js'));
    await import(analyticsAsset('/analytics/table-column-tools.js'));

  }catch(error){
    console.error('Retail Intelligence bootstrap failure',error);
    if(Number(error?.status)===401||Number(error?.status)===403)return returnToStoreOps();
    showBootFailure(error?.message||error);
  }
}

start();

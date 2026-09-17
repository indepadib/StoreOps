import { api } from './api.js';
import { app } from './state.js';

const KEY='storeops_guided_journey_active';
let timer=null,lastAutoAt=0;
const cleanPath=v=>{try{return new URL(String(v),location.origin).pathname}catch{return String(v||'')}};
const apiMutation=/^POST|PUT|PATCH|DELETE$/;

function setActive(active=true){try{active?sessionStorage.setItem(KEY,'1'):sessionStorage.removeItem(KEY)}catch{}}
function active(){try{return sessionStorage.getItem(KEY)==='1'}catch{return false}}
function pageButton(page){return document.querySelector(`#nav button[data-page="${CSS.escape(page)}"]`)||document.querySelector(`#managerNav button[data-page="${CSS.escape(page)}"]`)}
function go(page){const b=pageButton(page);if(!b)return false;b.click();return true}
function currentOperationalPage(){return app.page||document.querySelector('.page.active')?.id?.replace(/Page$/,'')||''}
function nextUseful(inbox){const rows=inbox?.items||[];return rows[0]||null}
function showContinue(next){
 let el=document.getElementById('storeopsJourneyContinue');if(!el){el=document.createElement('button');el.id='storeopsJourneyContinue';el.className='btn brand';el.style.cssText='position:fixed;z-index:1200;right:16px;bottom:88px;max-width:min(420px,calc(100vw - 32px));box-shadow:0 14px 38px #0003;text-align:left;padding:13px 15px;border-radius:16px';document.body.appendChild(el)}
 el.innerHTML=next?`<small style="display:block;opacity:.8">Étape enregistrée · prochaine action</small><strong>${String(next.title||'Continuer le parcours').replace(/[<>&]/g,'')}</strong> →`:`<strong>Revenir au parcours →</strong>`;
 el.onclick=()=>{el.remove();if(next?.page)go(next.page);else go('managerJourney')};
 clearTimeout(el._hide);el._hide=setTimeout(()=>el.remove(),8000)
}
async function recompute(){
 if(!active()||!app.storeId)return;
 try{
  const inbox=await api(`/api/stores/${encodeURIComponent(app.storeId)}/manager-inbox-batch?force=1`),next=nextUseful(inbox),current=currentOperationalPage();
  if(!next){setActive(false);showContinue(null);setTimeout(()=>go('managerJourney'),450);return}
  showContinue(next);
  if(next.page&&next.page!==current&&Date.now()-lastAutoAt>1200){lastAutoAt=Date.now();setTimeout(()=>{if(active())go(next.page)},650)}
 }catch(e){console.warn('Reprise parcours StoreOps',e)}
}
function schedule(){clearTimeout(timer);timer=setTimeout(recompute,350)}

// Preserve journey context when the manager enters an operational page from Today/Journey/validation inbox.
document.addEventListener('click',e=>{
 const goEl=e.target.closest('[data-manager-go]');if(goEl){const host=document.querySelector('.page.active')?.id||'';if(['todayPage','managerJourneyPage','managerControlsPage'].includes(host))setActive(true)}
 const guided=e.target.closest('.manager-guided-cta,.manager-action-card');if(guided)setActive(true)
},true);

// Observe successful API writes globally. The core api wrapper still owns parsing/auth/errors.
if(!window.__STOREOPS_JOURNEY_FETCH_PATCHED){
 window.__STOREOPS_JOURNEY_FETCH_PATCHED=true;
 const original=window.fetch.bind(window);
 window.fetch=async(input,init={})=>{
  const method=String(init?.method||'GET').toUpperCase(),response=await original(input,init);
  if(apiMutation.test(method)&&response.ok&&cleanPath(typeof input==='string'?input:input?.url).startsWith('/api/'))window.dispatchEvent(new CustomEvent('storeops:mutation-success',{detail:{method,path:cleanPath(typeof input==='string'?input:input?.url)}}));
  return response
 }
}
window.addEventListener('storeops:mutation-success',e=>{if(active())schedule()});

import {app} from '/js/state.js';
import {api,health,isShowcase} from '/js/api.js';
import {ensureAccessToken,ensureLocalSession,logout} from '/js/auth.js';
import {checkPilotAccess,validateObservationResponse} from './pilot-session.mjs';
const gate=document.getElementById('crmPilotGate'),title=document.getElementById('crmPilotTitle'),detail=document.getElementById('crmPilotDetail'),login=document.getElementById('crmPilotLogin');
const states={SESSION_CHANGED:['Session modifiée','Votre compte professionnel a changé. Rechargez la page pour vérifier les droits du nouveau compte.'],LOGIN_REQUIRED:['Connectez-vous à StoreOps','Utilisez votre compte professionnel habituel pour accéder au pilote CRM.'],DENIED:['Accès réservé','Ce pilote est réservé aux profils de direction d’exploitation et administrateurs de plateforme explicitement habilités.'],UNAVAILABLE:['Session indisponible','Impossible de vérifier votre session professionnelle. Aucun accès automatique en mode démo.']};
function setGate(status){
 if(status!=='AUTHORIZED')clearLiveObservation();
 document.documentElement.classList.toggle('crm-pilot-open',status==='AUTHORIZED');
 gate.hidden=status==='AUTHORIZED';
 if(status!=='AUTHORIZED'){const [a,b]=states[status]||states.UNAVAILABLE;title.textContent=a;detail.textContent=b;login.hidden=status==='DENIED'}
}
async function check(){
 if(isShowcase())return {status:'UNAVAILABLE'};
 // API is same-origin only for this pilot. Refuse unexpected deployment config.
 try{if(new URL(window.STOREOPS_CONFIG.apiBase,location.origin).origin!==location.origin)return {status:'UNAVAILABLE'}}catch{return {status:'UNAVAILABLE'}}
 let principal;
 const result=await checkPilotAccess({health,ensureAccessToken,ensureLocalSession,readSession:async()=>{const session=await api('/api/session',{cache:'no-store',noRetry:true});principal=session?.user?.id;return session},setMode:mode=>{app.authMode=mode}});
 return result.status==='AUTHORIZED'?{...result,principal,mode:app.authMode}:result;
}
export async function openCrmPilot(){
 login.onclick=()=>{sessionStorage.setItem('storeops_return_path','/crm/');location.assign('/')};
 document.getElementById('crmPilotRetry').onclick=()=>location.reload();
 const r=await check();setGate(r.status);
 if(r.status!=='AUTHORIZED')return false;
 setupLiveObservation();
 let busy=false,closed=false,timer;
 const close=status=>{closed=true;clearInterval(timer);setGate(status);for(const d of document.querySelectorAll('dialog[open]'))d.close()};
 document.getElementById('crmPilotLogout').onclick=()=>{close('LOGIN_REQUIRED');logout()};
 const recheck=async()=>{if(busy||closed)return;busy=true;try{const next=await check();if(closed)return;if(next.status!=='AUTHORIZED')close(next.status);else if(next.principal!==r.principal||next.mode!==r.mode)close('SESSION_CHANGED')}catch{close('UNAVAILABLE')}finally{busy=false}};
 timer=setInterval(recheck,60000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearLiveObservation();else recheck()});
 window.addEventListener('pagehide',()=>close('UNAVAILABLE'),{once:true});
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload()});
 return true;
}

const liveStatus=()=>document.getElementById('crmLiveStatus');
let generation=0;
function clearLiveObservation(){generation++;const results=document.getElementById('crmLiveMetrics');if(results)results.replaceChildren();const store=document.getElementById('crmLiveStore'),run=document.getElementById('crmLiveRead');if(store)store.replaceChildren();if(run)run.disabled=true;if(liveStatus())liveStatus().textContent='Session à vérifier. Aucun résultat affiché.'}
function setupLiveObservation(){
 const store=document.getElementById('crmLiveStore'),date=document.getElementById('crmLiveDate'),run=document.getElementById('crmLiveRead'),load=document.getElementById('crmLiveLoad'),metrics=document.getElementById('crmLiveMetrics');
 if(!store||!date||!run||!load||!metrics)return;
 const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date()),offset=d=>new Date(Date.parse(now)-d*86400000).toISOString().slice(0,10);
 date.max=offset(1);date.min=offset(31);date.value=date.max;
 const valid=()=>document.documentElement.classList.contains('crm-pilot-open'),clear=()=>{generation++;metrics.replaceChildren();liveStatus().textContent='Sélection modifiée. Relancez la lecture.';run.disabled=!store.value||!date.value||!date.checkValidity()};
 store.onchange=clear;date.onchange=clear;
 load.onclick=async()=>{
  const g=++generation;metrics.replaceChildren();store.replaceChildren();run.disabled=true;load.disabled=true;liveStatus().textContent='Vérification des sources configurées…';
  try{
   const data=await api('/api/crm/observed-sales',{noRetry:true,cache:'no-store'});if(g!==generation||!valid())return;
   if(data?.status!=='READY'||!Array.isArray(data.stores))throw Error('Sources indisponibles');
   for(const s of data.stores){if(typeof s.id!=='string'||typeof s.name!=='string')throw Error('Source invalide');const o=document.createElement('option');o.value=s.id;o.textContent=s.name;store.append(o)}
   liveStatus().textContent=store.options.length?'Sources configurées. Choisissez une journée et lancez la lecture.':'Aucun magasin connecté et autorisé.';run.disabled=!store.value;
  }catch(e){if(g===generation&&valid())liveStatus().textContent='Sources indisponibles. Vérifiez le déploiement et la connexion Dynamics.'}finally{load.disabled=false}
 };
 run.onclick=async()=>{
  if(!valid()||!store.value||!date.value||!date.checkValidity())return;
  const g=++generation,id=store.value,day=date.value;metrics.replaceChildren();run.disabled=true;liveStatus().textContent='Lecture des tickets observés…';
  try{
   const x=await api('/api/crm/observed-sales?'+new URLSearchParams({storeId:id,date:day}),{noRetry:true,cache:'no-store'});
   if(g!==generation||!valid())return;
   if(x?.status==='SUPPRESSED'){liveStatus().textContent='Résultat masqué : cohorte trop petite.';return}
   if(!validateObservationResponse(x,{storeId:id,date:day}))throw Error('Evidence unavailable');
   const money=n=>new Intl.NumberFormat('fr-MA',{maximumFractionDigits:2}).format(n)+' DH';
   for(const [label,v] of [['Clients identifiés observés',x.identifiedCustomers],['Tickets observés',x.tickets],['Tickets identifiés',x.identifiedTickets],['Ventes TTC positives',money(x.positiveSales)],['Ventes positives identifiées',money(x.identifiedPositiveSales)],['Panier positif moyen',money(x.averagePositiveBasket)]]){const d=document.createElement('div'),b=document.createElement('strong');d.append(document.createTextNode(label));b.textContent=String(v);d.append(b);metrics.append(d)}
   liveStatus().textContent='D365 · '+day+' · extraction '+x.checkedAt+' · rapprochement financier non vérifié. Retours exclus.';
  }catch(e){if(g===generation&&valid()){metrics.replaceChildren();liveStatus().textContent='Données indisponibles ou insuffisantes. Aucun montant fictif substitué.'}}finally{if(g===generation&&valid())run.disabled=false}
 };
}

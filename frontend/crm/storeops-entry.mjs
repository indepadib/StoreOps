import {app} from '/js/state.js';
import {api,health,isShowcase} from '/js/api.js';
import {ensureAccessToken,ensureLocalSession,logout} from '/js/auth.js';
import {checkPilotAccess} from './pilot-session.mjs';
const gate=document.getElementById('crmPilotGate'),title=document.getElementById('crmPilotTitle'),detail=document.getElementById('crmPilotDetail'),login=document.getElementById('crmPilotLogin');
const states={LOGIN_REQUIRED:['Connectez-vous à StoreOps','Utilisez votre compte professionnel habituel pour accéder au pilote CRM.'],DENIED:['Accès réservé','Ce pilote est réservé aux profils de direction d’exploitation et administrateurs de plateforme explicitement habilités.'],UNAVAILABLE:['Session indisponible','Impossible de vérifier votre session professionnelle. Aucun accès automatique en mode démo.']};
function setGate(status){
 document.documentElement.classList.toggle('crm-pilot-open',status==='AUTHORIZED');
 gate.hidden=status==='AUTHORIZED';
 if(status!=='AUTHORIZED'){const [a,b]=states[status]||states.UNAVAILABLE;title.textContent=a;detail.textContent=b;login.hidden=status==='DENIED'}
}
async function check(){
 if(isShowcase())return {status:'UNAVAILABLE'};
 // API is same-origin only for this pilot. Refuse unexpected deployment config.
 try{if(new URL(window.STOREOPS_CONFIG.apiBase,location.origin).origin!==location.origin)return {status:'UNAVAILABLE'}}catch{return {status:'UNAVAILABLE'}}
 return checkPilotAccess({health,ensureAccessToken,ensureLocalSession,readSession:()=>api('/api/session',{cache:'no-store',noRetry:true}),setMode:mode=>{app.authMode=mode}});
}
export async function openCrmPilot(){
 login.onclick=()=>{sessionStorage.setItem('storeops_return_path','/crm/');location.assign('/')};
 document.getElementById('crmPilotRetry').onclick=()=>location.reload();
 const r=await check();setGate(r.status);
 if(r.status!=='AUTHORIZED')return false;
 document.getElementById('crmPilotLogout').onclick=()=>{setGate('LOGIN_REQUIRED');logout()};
 let busy=false;
 const recheck=async()=>{if(busy)return;busy=true;try{const next=await check();if(next.status!=='AUTHORIZED'){setGate(next.status);for(const d of document.querySelectorAll('dialog[open]'))d.close()}}finally{busy=false}};
 const timer=setInterval(recheck,60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)recheck()});
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return true;
}

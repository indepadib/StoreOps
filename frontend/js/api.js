import { app } from './state.js';

const BASE=(window.STOREOPS_CONFIG?.apiBase||'').replace(/\/$/,'');
const bootConsumed=new Set();
let showcaseRuntimePromise=null;

function apiUrl(path){return `${BASE}${path}`}
export function isShowcase(){return (window.STOREOPS_CONFIG?.mode||'showcase')==='showcase'||!window.STOREOPS_CONFIG?.apiBase}
function showcaseRuntime(){
  if(!showcaseRuntimePromise)showcaseRuntimePromise=import('./api-showcase.js');
  return showcaseRuntimePromise
}
function perfStore(){return window.STOREOPS_PERF||null}
function recordApi({path,method='GET',startedAt,response=null,error=null,source='network'}){
  const perf=perfStore();if(!perf)return;
  const endedAt=performance.now(),entry={path:String(path||'').split('?')[0],method:String(method||'GET').toUpperCase(),durationMs:Math.round((endedAt-startedAt)*10)/10,status:response?.status||null,bridge:response?.headers?.get?.('x-storeops-bridge')||null,fastPath:response?.headers?.get?.('x-storeops-fast-path')||null,serverTiming:response?.headers?.get?.('server-timing')||null,source,error:error?String(error?.code||error?.message||error):null,at:Date.now()};
  perf.api=Array.isArray(perf.api)?perf.api:[];perf.api.push(entry);if(perf.api.length>50)perf.api.splice(0,perf.api.length-50);
  window.dispatchEvent(new CustomEvent('storeops:perf-api',{detail:entry}))
}
function applyAuth(headers){
  if(app.authMode==='demo')headers['x-demo-user']=localStorage.getItem('storeops_user')||'u-vf';
  else if(app.authMode==='local'){
    const auth=sessionStorage.getItem('storeops_local_authorization');if(auth)headers.authorization=auth;
  }else{
    const token=sessionStorage.getItem('storeops_access_token');if(token)headers.authorization=`Bearer ${token}`;
  }
  return headers;
}
function bootResponse(path,options={}){
  const method=String(options.method||'GET').toUpperCase();if(method!=='GET')return null;
  const boot=window.STOREOPS_BOOTSTRAP;if(!boot)return null;
  if(boot.authMode==='demo'){
    const requested=localStorage.getItem('storeops_user')||'u-vf';
    if(boot.user?.id!==requested)return null;
  }
  const clean=path.split('?')[0];
  if(bootConsumed.has(clean))return null;
  if(clean==='/api/session'){
    bootConsumed.add(clean);
    return{handled:true,data:{user:boot.user,authMode:boot.authMode,availableDemoUsers:boot.availableDemoUsers||[]}}
  }
  if(clean==='/api/stores'){
    bootConsumed.add(clean);
    return{handled:true,data:boot.stores||[]}
  }
  if(clean==='/api/development/config'){
    bootConsumed.add(clean);
    if(boot.developmentAccess)return{handled:true,data:{bootstrap:true,access:true}};
    const e=new Error('Vue réservée à l’équipe Développement.');e.status=403;e.code='DEVELOPMENT_ACCESS_REQUIRED';return{handled:true,error:e}
  }
  return null
}
async function parseJsonResponse(r,url){
  const type=String(r.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('application/json')){
    let preview='';try{preview=(await r.text()).slice(0,120).replace(/\s+/g,' ')}catch{}
    const hint=preview.startsWith('<')||type.includes('text/html')?`StoreOps attend du JSON mais reçoit une page HTML. Vérifie STOREOPS_API_BASE côté Netlify : il doit pointer vers l'origine publique du backend, sans /api à la fin.`:`Réponse API inattendue (${type||'type inconnu'}).`;
    const e=new Error(`${hint} URL appelée : ${url}`);e.status=r.status;e.code='API_NOT_JSON';throw e
  }
  try{return await r.json()}catch{const e=new Error(`Réponse JSON invalide depuis ${url}.`);e.status=r.status;e.code='API_INVALID_JSON';throw e}
}
export async function api(path,options={}){
  if(isShowcase())return (await showcaseRuntime()).api(path,options);
  const cached=bootResponse(path,options);if(cached?.handled){const startedAt=performance.now();recordApi({path,method:options.method||'GET',startedAt,source:'bootstrap-cache'});if(cached.error)throw cached.error;return cached.data}
  const headers=applyAuth({'content-type':'application/json',...(options.headers||{})}),url=apiUrl(path),startedAt=performance.now();let r;
  try{r=await fetch(url,{...options,headers})}catch(error){recordApi({path,method:options.method||'GET',startedAt,error});const e=new Error(`Impossible de joindre l'API StoreOps. Vérifie STOREOPS_API_BASE et que le backend est déployé. URL : ${url}`);e.code='API_UNREACHABLE';throw e}
  recordApi({path,method:options.method||'GET',startedAt,response:r});
  const data=await parseJsonResponse(r,url);if(!r.ok){const e=new Error(data.error||`Erreur HTTP ${r.status}`);e.status=r.status;e.code=data.code;e.details=data.details||data.issues;throw e}return data
}
export async function health(){
  if(isShowcase())return (await showcaseRuntime()).health();
  if(window.STOREOPS_BOOT_HEALTH&&!window.STOREOPS_BOOT_HEALTH_CONSUMED){window.STOREOPS_BOOT_HEALTH_CONSUMED=true;const startedAt=performance.now();recordApi({path:'/api/health',startedAt,source:'boot-cache'});return window.STOREOPS_BOOT_HEALTH}
  const url=apiUrl('/api/health'),startedAt=performance.now();let r;
  try{r=await fetch(url,{cache:'no-store'})}catch(error){recordApi({path:'/api/health',startedAt,error});const e=new Error(`Impossible de joindre l'API StoreOps. Configure STOREOPS_API_BASE dans Netlify puis redéploie. URL : ${url}`);e.code='API_UNREACHABLE';throw e}
  recordApi({path:'/api/health',startedAt,response:r});
  const data=await parseJsonResponse(r,url);if(!r.ok){const e=new Error(data.error||`Healthcheck API en erreur (${r.status}).`);e.status=r.status;throw e}return data
}
export async function apiBlob(path){
  if(isShowcase())return (await showcaseRuntime()).apiBlob(path);
  const headers=applyAuth({}),startedAt=performance.now();let r;
  try{r=await fetch(apiUrl(path),{headers})}catch(error){recordApi({path,startedAt,error});throw error}
  recordApi({path,startedAt,response:r});if(!r.ok)throw new Error(`Erreur HTTP ${r.status}`);return r.blob()
}

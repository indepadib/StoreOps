import { app } from './state.js';
import { mockApi,mockBlob,isShowcase } from './mock-api.js';
import { mockCashApi,cashShowcaseSummary } from './mock-cash.js';
import { mockLossApi,lossShowcaseSummary } from './mock-loss.js';
import { mockCashOpeningApi,cashOpeningShowcaseSummary,markCashOpeningShowcaseOpened } from './mock-cash-opening.js';
import { mockColdChainApi,coldChainShowcaseSummary,markColdChainShowcaseOpened } from './mock-cold-chain.js';
import { mockStaffingApi,staffingShowcaseSummary,markStaffingShowcaseOpened } from './mock-staffing.js';
import { mockPriceCheckApi } from './mock-price-check.js';
const BASE=(window.STOREOPS_CONFIG?.apiBase||'').replace(/\/$/,'');
const SHOWCASE_VERSION='1.29.0-showcase';
const bootConsumed=new Set();
function apiUrl(path){return `${BASE}${path}`}
function cashPath(path){return /^\/api\/(cash(?:\/|$)|stores\/[^/]+\/cash-closing(?:\/|$))/.test(path.split('?')[0])}
function lossPath(path){return /^\/api\/(loss(?:\/|$)|losses(?:\/|$)|stores\/[^/]+\/losses(?:\/|$))/.test(path.split('?')[0])}
function cashOpeningPath(path){return /^\/api\/(cash-opening(?:\/|$)|stores\/[^/]+\/cash-opening(?:\/|$))/.test(path.split('?')[0])}
function coldChainPath(path){return /^\/api\/(cold-chain(?:\/|$)|stores\/[^/]+\/cold-chain(?:\/|$))/.test(path.split('?')[0])}
function staffingPath(path){return /^\/api\/(staffing(?:\/|$)|stores\/[^/]+\/staffing(?:\/|$))/.test(path.split('?')[0])}
function priceCheckPath(path){return /^\/api\/stores\/[^/]+\/price-check(?:\/|s(?:\?|$)|$)/.test(path)}
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
async function autoCompleteLegacyCashTask(storeId,closing){if(!closing||!['READY','CLOSED'].includes(closing.status))return;try{let data=await mockApi(`/api/stores/${storeId}/tasks?group=closing`);if(data.day?.opening_status!=='OPENED')return;const task=(data.tasks||[]).find(t=>Number(t.step_order)===3);if(!task||task.status==='COMPLETED')return;const m=closing.metrics||{};await mockApi(`/api/tasks/${task.id}/submit`,{method:'POST',body:JSON.stringify({values:{ca_commercial:Number(m.expectedSales||0),ca_comptable:Number(m.expectedSales||0),especes_attendues:Number(m.expectedCash||0),especes_declarees:Number(m.expectedCash||0),tpe_systeme:Number(m.expectedCard||0),tpe_cloture:Number(m.expectedCard||0),statement:true}})})}catch{}}
async function showcaseApi(path,options={}){const clean=path.split('?')[0],method=String(options.method||'GET').toUpperCase();
  if(priceCheckPath(path))return mockPriceCheckApi(path,options,mockApi);
  if(staffingPath(path))return mockStaffingApi(path,options,mockApi);
  if(coldChainPath(path))return mockColdChainApi(path,options,mockApi);
  if(cashOpeningPath(path))return mockCashOpeningApi(path,options,mockApi);
  if(cashPath(path)){const r=await mockCashApi(path,options);const m=clean.match(/^\/api\/cash\/([^/]+)\/finalize$/);if(m&&r?.closing)await autoCompleteLegacyCashTask(r.closing.store_id,r.closing);return r}
  if(lossPath(path))return mockLossApi(path,options,mockApi);
  const dlcTreatment=clean.match(/^\/api\/dlc\/([^/]+)\/treatments$/);if(dlcTreatment&&method==='POST'){const data=await mockApi(path,options),b=options.body?(typeof options.body==='string'?JSON.parse(options.body):options.body):{},reason={DESTROY:'EXPIRED',RETURN_SUPPLIER:'RETURN_SUPPLIER',DONATE:'DONATION'}[b.actionType];if(reason&&Number(b.quantity)>0){const treatment=data.treatments?.[0],evidence=data.evidence?.[0];const generated=await mockLossApi(`/api/stores/${data.store_id}/losses`,{method:'POST',body:JSON.stringify({ean:data.ean,reasonCode:reason,quantity:Number(b.quantity),unit:data.unit||'pièce',note:[`Générée automatiquement depuis DLC ${data.expiry_date}`,data.lot_ref?`lot ${data.lot_ref}`:null,b.note||null].filter(Boolean).join(' · '),sourceType:'DLC_TREATMENT',sourceId:treatment?.id||dlcTreatment[1],evidenceAlreadySatisfied:!!evidence,evidenceSourceType:evidence?'DLC_TREATMENT':null,evidenceSourceId:evidence?treatment?.id:null,externalEvidence:evidence?{id:evidence.id,file_name:evidence.file_name,caption:evidence.caption||'',source:'DLC'}:null})},mockApi);return{...data,generated_loss:generated}}return data}
  const openingValidate=clean.match(/^\/api\/stores\/([^/]+)\/process\/opening\/validate$/);if(openingValidate){const storeId=openingValidate[1],staff=staffingShowcaseSummary(storeId),cold=coldChainShowcaseSummary(storeId),cashOpening=cashOpeningShowcaseSummary(storeId);if(staff.blocking){const e=new Error('La couverture équipe d’ouverture n’est pas conforme.');e.status=409;e.details={staffingBlocking:staff.blocking};throw e}if(cold.blocking){const e=new Error(`${cold.blocking} zone(s) froid ne sont pas conformes.`);e.status=409;e.details={coldBlocking:cold.blocking};throw e}if(cashOpening.blocking){const e=new Error(`${cashOpening.blocking} caisse(s) ne sont pas prêtes.`);e.status=409;e.details={cashOpeningBlocking:cashOpening.blocking};throw e}const data=await mockApi(path,options);markStaffingShowcaseOpened(storeId);markColdChainShowcaseOpened(storeId);markCashOpeningShowcaseOpened(storeId);return data}
  const closingValidate=clean.match(/^\/api\/stores\/([^/]+)\/process\/closing\/validate$/);if(closingValidate){const storeId=closingValidate[1],cash=cashShowcaseSummary(storeId),loss=lossShowcaseSummary(storeId);if(cash.blocking){const e=new Error('La clôture caisses doit être rapprochée et validée avant fermeture magasin.');e.status=409;throw e}if(loss.blocking){const e=new Error(`${loss.blocking} perte(s) / démarque(s) restent à documenter ou poster avant fermeture.`);e.status=409;throw e}try{const c=await mockCashApi(`/api/stores/${storeId}/cash-closing`);await autoCompleteLegacyCashTask(storeId,c.closing)}catch{}}
  let data=await mockApi(path,options);if(clean==='/api/config')return{...data,version:SHOWCASE_VERSION};let m=clean.match(/^\/api\/stores\/([^/]+)\/dashboard$/);if(m)return{...data,cash:cashShowcaseSummary(m[1]),loss:lossShowcaseSummary(m[1]),cashOpening:cashOpeningShowcaseSummary(m[1]),coldChain:coldChainShowcaseSummary(m[1]),staffing:staffingShowcaseSummary(m[1])};m=clean.match(/^\/api\/stores\/([^/]+)\/tasks$/);if(m){const storeId=m[1],group=new URL(path,'https://showcase.local').searchParams.get('group');if(group==='opening')return{...data,staffing:staffingShowcaseSummary(storeId),cashOpening:cashOpeningShowcaseSummary(storeId),coldChain:coldChainShowcaseSummary(storeId)};if(group==='closing')return{...data,cash:cashShowcaseSummary(storeId),loss:lossShowcaseSummary(storeId)}}if(clean==='/api/network'&&Array.isArray(data))return data.map(r=>({...r,staffing:staffingShowcaseSummary(r.id),cash:cashShowcaseSummary(r.id),loss:lossShowcaseSummary(r.id),cashOpening:cashOpeningShowcaseSummary(r.id),coldChain:coldChainShowcaseSummary(r.id)}));return data}
async function parseJsonResponse(r,url){const type=String(r.headers.get('content-type')||'').toLowerCase();if(!type.includes('application/json')){let preview='';try{preview=(await r.text()).slice(0,120).replace(/\s+/g,' ')}catch{}const hint=preview.startsWith('<')||type.includes('text/html')?`StoreOps attend du JSON mais reçoit une page HTML. Vérifie STOREOPS_API_BASE côté Netlify : il doit pointer vers l'origine publique du backend, sans /api à la fin.`:`Réponse API inattendue (${type||'type inconnu'}).`;const e=new Error(`${hint} URL appelée : ${url}`);e.status=r.status;e.code='API_NOT_JSON';throw e}try{return await r.json()}catch{const e=new Error(`Réponse JSON invalide depuis ${url}.`);e.status=r.status;e.code='API_INVALID_JSON';throw e}}
function isPlainJsonBody(body){return body!==null&&typeof body==='object'&&!(body instanceof Blob)&&!(body instanceof FormData)&&!(body instanceof URLSearchParams)&&!(body instanceof ArrayBuffer)&&!ArrayBuffer.isView(body)}
function normalizeLiveRequest(options={}){
  const next={...options},headers={...(options.headers||{})};
  if(isPlainJsonBody(next.body))next.body=JSON.stringify(next.body);
  const formLike=next.body instanceof FormData||next.body instanceof Blob||next.body instanceof URLSearchParams;
  if(!formLike&&!Object.keys(headers).some(k=>k.toLowerCase()==='content-type'))headers['content-type']='application/json';
  next.headers=applyAuth(headers);
  return next
}
export async function api(path,options={}){
  if(isShowcase())return showcaseApi(path,options);
  const cached=bootResponse(path,options);if(cached?.handled){if(cached.error)throw cached.error;return cached.data}
  const url=apiUrl(path),request=normalizeLiveRequest(options);let r;try{r=await fetch(url,request)}catch{const e=new Error(`Impossible de joindre l'API StoreOps. Vérifie STOREOPS_API_BASE et que le backend est déployé. URL : ${url}`);e.code='API_UNREACHABLE';throw e}const data=await parseJsonResponse(r,url);if(!r.ok){const e=new Error(data.error||`Erreur HTTP ${r.status}`);e.status=r.status;e.code=data.code;e.details=data.details||data.issues;e.endpoint=path;throw e}return data
}
export async function health(){
  if(isShowcase()){const h=await mockApi('/api/health');return{...h,version:SHOWCASE_VERSION}}
  if(window.STOREOPS_BOOT_HEALTH&&!window.STOREOPS_BOOT_HEALTH_CONSUMED){window.STOREOPS_BOOT_HEALTH_CONSUMED=true;return window.STOREOPS_BOOT_HEALTH}
  const url=apiUrl('/api/health');let r;try{r=await fetch(url,{cache:'no-store'})}catch{const e=new Error(`Impossible de joindre l'API StoreOps. Configure STOREOPS_API_BASE dans Netlify puis redéploie. URL : ${url}`);e.code='API_UNREACHABLE';throw e}const data=await parseJsonResponse(r,url);if(!r.ok){const e=new Error(data.error||`Healthcheck API en erreur (${r.status}).`);e.status=r.status;throw e}return data
}
export async function apiBlob(path){if(isShowcase())return mockBlob(path);const headers=applyAuth({}),r=await fetch(apiUrl(path),{headers});if(!r.ok)throw new Error(`Erreur HTTP ${r.status}`);return r.blob()}
export { isShowcase };

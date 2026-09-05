import { app } from './state.js';
import { mockApi,mockBlob,isShowcase } from './mock-api.js';
import { mockCashApi,cashShowcaseSummary } from './mock-cash.js';
import { mockLossApi,lossShowcaseSummary } from './mock-loss.js';
import { mockCashOpeningApi,cashOpeningShowcaseSummary,markCashOpeningShowcaseOpened } from './mock-cash-opening.js';
const BASE=(window.STOREOPS_CONFIG?.apiBase||'').replace(/\/$/,'');

function apiUrl(path){return `${BASE}${path}`}
function cashPath(path){return /^\/api\/(cash(?:\/|$)|stores\/[^/]+\/cash-closing(?:\/|$))/.test(path.split('?')[0])}
function lossPath(path){return /^\/api\/(loss(?:\/|$)|losses(?:\/|$)|stores\/[^/]+\/losses(?:\/|$))/.test(path.split('?')[0])}
function cashOpeningPath(path){return /^\/api\/(cash-opening(?:\/|$)|stores\/[^/]+\/cash-opening(?:\/|$))/.test(path.split('?')[0])}
async function autoCompleteLegacyCashTask(storeId,closing){
  if(!closing||!['READY','CLOSED'].includes(closing.status))return;
  try{
    let data=await mockApi(`/api/stores/${storeId}/tasks?group=closing`);
    if(data.day?.opening_status!=='OPENED')return;
    const task=(data.tasks||[]).find(t=>Number(t.step_order)===3);
    if(!task||task.status==='COMPLETED')return;
    const m=closing.metrics||{};
    await mockApi(`/api/tasks/${task.id}/submit`,{method:'POST',body:JSON.stringify({values:{ca_commercial:Number(m.expectedSales||0),ca_comptable:Number(m.expectedSales||0),especes_attendues:Number(m.expectedCash||0),especes_declarees:Number(m.expectedCash||0),tpe_systeme:Number(m.expectedCard||0),tpe_cloture:Number(m.expectedCard||0),statement:true}})});
  }catch{}
}
async function showcaseApi(path,options={}){
  const clean=path.split('?')[0],method=String(options.method||'GET').toUpperCase();
  if(cashOpeningPath(path))return mockCashOpeningApi(path,options,mockApi);
  if(cashPath(path)){
    const r=await mockCashApi(path,options);
    const m=clean.match(/^\/api\/cash\/([^/]+)\/finalize$/);
    if(m&&r?.closing)await autoCompleteLegacyCashTask(r.closing.store_id,r.closing);
    return r;
  }
  if(lossPath(path))return mockLossApi(path,options,mockApi);
  const dlcTreatment=clean.match(/^\/api\/dlc\/([^/]+)\/treatments$/);
  if(dlcTreatment&&method==='POST'){
    const data=await mockApi(path,options),b=options.body?JSON.parse(options.body):{},reason={DESTROY:'EXPIRED',RETURN_SUPPLIER:'RETURN_SUPPLIER',DONATE:'DONATION'}[b.actionType];
    if(reason&&Number(b.quantity)>0){
      const treatment=data.treatments?.[0],evidence=data.evidence?.[0];
      const generated=await mockLossApi(`/api/stores/${data.store_id}/losses`,{method:'POST',body:JSON.stringify({ean:data.ean,reasonCode:reason,quantity:Number(b.quantity),unit:data.unit||'pièce',note:[`Générée automatiquement depuis DLC ${data.expiry_date}`,data.lot_ref?`lot ${data.lot_ref}`:null,b.note||null].filter(Boolean).join(' · '),sourceType:'DLC_TREATMENT',sourceId:treatment?.id||dlcTreatment[1],evidenceAlreadySatisfied:!!evidence,evidenceSourceType:evidence?'DLC_TREATMENT':null,evidenceSourceId:evidence?treatment?.id:null,externalEvidence:evidence?{id:evidence.id,file_name:evidence.file_name,caption:evidence.caption||'',source:'DLC'}:null})},mockApi);
      return{...data,generated_loss:generated};
    }
    return data;
  }
  const openingValidate=clean.match(/^\/api\/stores\/([^/]+)\/process\/opening\/validate$/);
  if(openingValidate){
    const storeId=openingValidate[1],cashOpening=cashOpeningShowcaseSummary(storeId);
    if(cashOpening.blocking){const e=new Error(`${cashOpening.blocking} caisse(s) ne sont pas prêtes. Affectation, fond, POS, TPE, imprimante et shift Dynamics doivent être conformes avant ouverture.`);e.status=409;e.details={cashOpeningBlocking:cashOpening.blocking,cashOpeningStatus:cashOpening.status};throw e}
    const data=await mockApi(path,options);markCashOpeningShowcaseOpened(storeId);return data;
  }
  const closingValidate=clean.match(/^\/api\/stores\/([^/]+)\/process\/closing\/validate$/);
  if(closingValidate){
    const storeId=closingValidate[1],cash=cashShowcaseSummary(storeId),loss=lossShowcaseSummary(storeId);
    if(cash.blocking){const e=new Error('La clôture caisses doit être rapprochée et validée avant fermeture magasin.');e.status=409;e.details={cashBlocking:1,cashStatus:cash.status};throw e}
    if(loss.blocking){const e=new Error(`${loss.blocking} perte(s) / démarque(s) restent à documenter ou poster avant fermeture.`);e.status=409;e.details={lossBlocking:loss.blocking};throw e}
    try{const c=await mockCashApi(`/api/stores/${storeId}/cash-closing`);await autoCompleteLegacyCashTask(storeId,c.closing)}catch{}
  }
  let data=await mockApi(path,options);
  let m=clean.match(/^\/api\/stores\/([^/]+)\/dashboard$/);
  if(m)return{...data,cash:cashShowcaseSummary(m[1]),loss:lossShowcaseSummary(m[1]),cashOpening:cashOpeningShowcaseSummary(m[1])};
  m=clean.match(/^\/api\/stores\/([^/]+)\/tasks$/);
  if(m){const storeId=m[1],group=new URL(path,'https://showcase.local').searchParams.get('group');if(group==='opening')return{...data,cashOpening:cashOpeningShowcaseSummary(storeId)};if(group==='closing'){const cash=cashShowcaseSummary(storeId),loss=lossShowcaseSummary(storeId);if(['READY','CLOSED'].includes(cash.status)){try{const c=await mockCashApi(`/api/stores/${storeId}/cash-closing`);await autoCompleteLegacyCashTask(storeId,c.closing);data=await mockApi(path,options)}catch{}}return{...data,cash,loss}}}
  if(clean==='/api/network'&&Array.isArray(data))return data.map(r=>({...r,cash:cashShowcaseSummary(r.id,r.day?.business_date),loss:lossShowcaseSummary(r.id,r.day?.business_date),cashOpening:cashOpeningShowcaseSummary(r.id,r.day?.business_date)}));
  return data;
}
async function parseJsonResponse(r,url){
  const type=String(r.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('application/json')){
    let preview='';try{preview=(await r.text()).slice(0,120).replace(/\s+/g,' ')}catch{}
    const hint=preview.startsWith('<')||type.includes('text/html')
      ?`StoreOps attend du JSON mais reçoit une page HTML. Vérifie STOREOPS_API_BASE côté Netlify : il doit pointer vers l'origine publique du backend, sans /api à la fin.`
      :`Réponse API inattendue (${type||'type inconnu'}).`;
    const e=new Error(`${hint} URL appelée : ${url}`);e.status=r.status;e.code='API_NOT_JSON';throw e;
  }
  try{return await r.json()}catch{const e=new Error(`Réponse JSON invalide depuis ${url}.`);e.status=r.status;e.code='API_INVALID_JSON';throw e}
}
export async function api(path,options={}){
  if(isShowcase()) return showcaseApi(path,options);
  const headers={'content-type':'application/json',...(options.headers||{})};
  if(app.authMode==='demo') headers['x-demo-user']=localStorage.getItem('storeops_user')||'u-vf';
  else {const token=sessionStorage.getItem('storeops_access_token');if(token)headers.authorization=`Bearer ${token}`;}
  const url=apiUrl(path);let r;
  try{r=await fetch(url,{...options,headers})}catch{const e=new Error(`Impossible de joindre l'API StoreOps. Vérifie STOREOPS_API_BASE et que le backend est déployé. URL : ${url}`);e.code='API_UNREACHABLE';throw e}
  const data=await parseJsonResponse(r,url);
  if(!r.ok){const e=new Error(data.error||`Erreur HTTP ${r.status}`);e.status=r.status;e.code=data.code;e.details=data.details||data.issues;throw e}
  return data;
}
export async function health(){
  if(isShowcase()){const h=await mockApi('/api/health');return{...h,version:'1.11-showcase'}}
  const url=apiUrl('/api/health');let r;
  try{r=await fetch(url,{cache:'no-store'})}catch{const e=new Error(`Impossible de joindre l'API StoreOps. Configure STOREOPS_API_BASE dans Netlify puis redéploie. URL : ${url}`);e.code='API_UNREACHABLE';throw e}
  const data=await parseJsonResponse(r,url);
  if(!r.ok){const e=new Error(data.error||`Healthcheck API en erreur (${r.status}).`);e.status=r.status;e.code=data.code;throw e}
  return data;
}
export async function apiBlob(path){
  if(isShowcase()) return mockBlob(path);
  const headers={};
  if(app.authMode==='demo') headers['x-demo-user']=localStorage.getItem('storeops_user')||'u-vf';
  else {const token=sessionStorage.getItem('storeops_access_token');if(token)headers.authorization=`Bearer ${token}`;}
  const url=apiUrl(path);const r=await fetch(url,{headers});
  if(!r.ok){let msg=`Erreur HTTP ${r.status}`;try{const type=String(r.headers.get('content-type')||'');if(type.includes('application/json')){const j=await r.json();msg=j.error||msg}}catch{}throw new Error(msg)}
  return r.blob();
}
export { isShowcase };

import { app } from './state.js';
import { mockApi,mockBlob,isShowcase } from './mock-api.js';
const BASE=(window.STOREOPS_CONFIG?.apiBase||'').replace(/\/$/,'');

function apiUrl(path){return `${BASE}${path}`}
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
  if(isShowcase()) return mockApi(path,options);
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
  if(isShowcase()) return mockApi('/api/health');
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

import { app } from './state.js';
const BASE=(window.STOREOPS_CONFIG?.apiBase||'').replace(/\/$/,'');
export async function api(path,options={}){
  const headers={'content-type':'application/json',...(options.headers||{})};
  if(app.authMode==='demo') headers['x-demo-user']=localStorage.getItem('storeops_user')||'u-vf';
  else {const token=sessionStorage.getItem('storeops_access_token'); if(token) headers.authorization=`Bearer ${token}`;}
  const r=await fetch(`${BASE}${path}`,{...options,headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(data.error||`Erreur HTTP ${r.status}`);e.status=r.status;e.code=data.code;e.details=data.details||data.issues;throw e}
  return data;
}
export async function health(){
  const r=await fetch(`${BASE}/api/health`,{cache:'no-store'});return r.json();
}

export async function apiBlob(path){
  const headers={};
  if(app.authMode==='demo') headers['x-demo-user']=localStorage.getItem('storeops_user')||'u-vf';
  else {const token=sessionStorage.getItem('storeops_access_token');if(token)headers.authorization=`Bearer ${token}`;}
  const r=await fetch(`${BASE}${path}`,{headers});
  if(!r.ok){let msg=`Erreur HTTP ${r.status}`;try{const j=await r.json();msg=j.error||msg}catch{}throw new Error(msg)}
  return r.blob();
}

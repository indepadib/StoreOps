import { canAccessStore } from './permissions.mjs';
import { todayISO } from '../db.mjs';
import { getBusinessPulse,clearBusinessPulseCache } from './business-pulse.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
const forbidden=()=>({status:403,data:{error:'Accès interdit à ce magasin.'}});

export async function handleBusinessPulseApi({req,url,user}){
 let p=route(url.pathname,'/api/stores/:storeId/business-pulse');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden();
  const businessDate=url.searchParams.get('date')||todayISO(),force=url.searchParams.get('force')==='1';
  return{status:200,data:await getBusinessPulse(p.storeId,businessDate,{force})};
 }
 p=route(url.pathname,'/api/stores/:storeId/business-pulse/refresh');
 if(p&&req.method==='POST'){
  if(!canAccessStore(user,p.storeId))return forbidden();
  clearBusinessPulseCache(p.storeId);const businessDate=url.searchParams.get('date')||todayISO();
  return{status:200,data:await getBusinessPulse(p.storeId,businessDate,{force:true})};
 }
 return null;
}

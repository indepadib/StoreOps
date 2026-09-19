import { canAccessStore } from './permissions.mjs';
import { todayISO } from '../db.mjs';
import { getBusinessPulse,clearBusinessPulseCache } from './business-pulse.mjs';
import { getManagerHomeFast } from './manager-home-fast.mjs';
import { getManagerInboxBatch } from './manager-inbox-batch.mjs';
import { handleRuntimeBootstrapApi } from './runtime-bootstrap-api.mjs';
import { ensureD365SalesAutoConnected,clearD365SalesAutoConnectCache } from './d365-sales-autoconnect.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
const forbidden=()=>({status:403,data:{error:'Accès interdit à ce magasin.'}});

export async function handleBusinessPulseApi({req,url,user}){
 const bootstrap=await handleRuntimeBootstrapApi({req,url,user});
 if(bootstrap)return bootstrap;
 const force=url.searchParams.get('force')==='1';
 let p=route(url.pathname,'/api/stores/:storeId/manager-home-fast');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden();
  return{status:200,data:getManagerHomeFast(p.storeId,url.searchParams.get('date')||todayISO(),{force})};
 }
 p=route(url.pathname,'/api/stores/:storeId/manager-inbox-batch');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden();
  return{status:200,data:await getManagerInboxBatch(p.storeId,url.searchParams.get('date')||todayISO(),{force})};
 }
 p=route(url.pathname,'/api/stores/:storeId/business-pulse');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden();
  const businessDate=url.searchParams.get('date')||todayISO();
  return{status:200,data:await getBusinessPulse(p.storeId,businessDate,{force})};
 }
 p=route(url.pathname,'/api/stores/:storeId/business-pulse/auto-connect');
 if(p&&req.method==='POST'){
  if(!canAccessStore(user,p.storeId))return forbidden();
  clearD365SalesAutoConnectCache(p.storeId);
  const autoConnect=await ensureD365SalesAutoConnected(p.storeId);
  clearBusinessPulseCache(p.storeId);
  const businessDate=url.searchParams.get('date')||todayISO();
  const pulse=autoConnect.connected?await getBusinessPulse(p.storeId,businessDate,{force:true}):await getBusinessPulse(p.storeId,businessDate,{force:false});
  return{status:200,data:{autoConnect,pulse}};
 }
 p=route(url.pathname,'/api/stores/:storeId/business-pulse/refresh');
 if(p&&req.method==='POST'){
  if(!canAccessStore(user,p.storeId))return forbidden();
  clearBusinessPulseCache(p.storeId);const businessDate=url.searchParams.get('date')||todayISO();
  return{status:200,data:await getBusinessPulse(p.storeId,businessDate,{force:true})};
 }
 return null;
}

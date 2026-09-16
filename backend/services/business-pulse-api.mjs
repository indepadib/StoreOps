import { canAccessStore } from './permissions.mjs';
import { todayISO } from '../db.mjs';
import { config } from '../config.mjs';
import { getBusinessPulse,clearBusinessPulseCache } from './business-pulse.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
const forbidden=()=>({status:403,data:{error:'Accès interdit à ce magasin.'}});

function forwardedAuthHeaders(req){
 const headers={};
 for(const name of ['authorization','x-demo-user']){
  const value=req.headers?.[name];
  if(value)headers[name]=Array.isArray(value)?value[0]:String(value);
 }
 return headers
}
async function localJson(req,path){
 const started=Date.now();
 try{
  const response=await fetch(`http://127.0.0.1:${config.port}${path}`,{headers:forwardedAuthHeaders(req),cache:'no-store'});
  const type=String(response.headers.get('content-type')||'');
  const data=type.includes('application/json')?await response.json():null;
  if(!response.ok)return{ok:false,status:response.status,error:data?.error||`HTTP ${response.status}`,durationMs:Date.now()-started};
  return{ok:true,status:response.status,data,durationMs:Date.now()-started}
 }catch(error){return{ok:false,status:0,error:error instanceof Error?error.message:String(error),durationMs:Date.now()-started}}
}
async function managerHomePack(req,storeId,businessDate){
 const paths=[
  `/api/stores/${storeId}/dashboard`,
  `/api/stores/${storeId}/commercial`,
  `/api/stores/${storeId}/receipts`,
  `/api/stores/${storeId}/inventory?status=ALL`,
  `/api/stores/${storeId}/losses`,
  `/api/stores/${storeId}/incidents?status=OPEN`,
  `/api/stores/${storeId}/staffing`,
  `/api/stores/${storeId}/cold-chain`,
  `/api/stores/${storeId}/cash-opening`,
  `/api/stores/${storeId}/quality`,
  `/api/stores/${storeId}/stock-signals`
 ];
 const started=Date.now(),results=await Promise.all(paths.map(async path=>[path,await localJson(req,path)]));
 const responses={},errors={},timings={};
 for(const [path,result] of results){timings[path]=result.durationMs;if(result.ok)responses[path]=result.data;else errors[path]={status:result.status,error:result.error}}
 const pulsePath=`/api/stores/${storeId}/business-pulse`;
 try{const pulseStarted=Date.now();responses[pulsePath]=await getBusinessPulse(storeId,businessDate);timings[pulsePath]=Date.now()-pulseStarted}catch(error){errors[pulsePath]={status:500,error:error instanceof Error?error.message:String(error)}}
 return{storeId,businessDate,generatedAt:new Date().toISOString(),durationMs:Date.now()-started,responses,errors,timings,complete:Object.keys(errors).length===0}
}

export async function handleBusinessPulseApi({req,url,user}){
 let p=route(url.pathname,'/api/stores/:storeId/manager-home-pack');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden();
  const businessDate=url.searchParams.get('date')||todayISO();
  return{status:200,data:await managerHomePack(req,p.storeId,businessDate)}
 }
 p=route(url.pathname,'/api/stores/:storeId/business-pulse');
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

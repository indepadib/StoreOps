import { canAccessStore } from './permissions.mjs';
import { db,todayISO } from '../db.mjs';
import { getBusinessPulse,clearBusinessPulseCache } from './business-pulse.mjs';
import { getManagerHomeFast } from './manager-home-fast.mjs';
import { getManagerInboxBatch } from './manager-inbox-batch.mjs';
import { handleRuntimeBootstrapApi } from './runtime-bootstrap-api.mjs';
import { ensureD365SalesAutoConnected,clearD365SalesAutoConnectCache } from './d365-sales-autoconnect.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
const forbidden=()=>({status:403,data:{error:'Accès interdit à ce magasin.'}});


function requireDirector(user){if(user?.role!=='ops_director')throw Object.assign(new Error('Réservé au Directeur d’exploitation'),{status:403,code:'OPS_DIRECTOR_REQUIRED'})}
function mappedNetworkStores(){
 return db.prepare(`SELECT id,name,code FROM stores WHERE active=1 ORDER BY name`).all().map(store=>({store,settings:storeOperationalSettings(store.id)})).filter(x=>x.settings?.d365?.storeNumber||x.settings?.storeWarehouseId)
}
async function networkPulseSnapshot(businessDate,{autoConnect=false}={}){
 const targets=mappedNetworkStores(),connect=new Map();
 if(autoConnect){
  for(const target of targets){
   clearD365SalesAutoConnectCache(target.store.id);
   try{connect.set(target.store.id,await ensureD365SalesAutoConnected(target.store.id))}catch(error){connect.set(target.store.id,{status:'ERROR',connected:false,reason:error?.message||String(error)})}
  }
 }
 const items=await Promise.all(targets.map(async target=>{
  const auto=connect.get(target.store.id)||null;
  let pulse;
  try{pulse=await getBusinessPulse(target.store.id,businessDate,{force:!!auto?.connected})}catch(error){pulse={status:'DEGRADED',storeId:target.store.id,businessDate,snapshot:null,error:{code:error?.code||'BUSINESS_PULSE_FAILED',message:error?.message||String(error)}}}
  return{storeId:target.store.id,name:target.store.name,code:target.store.code,d365:{storeNumber:target.settings?.d365?.storeNumber||null,retailChannelId:target.settings?.d365?.retailChannelId||null,warehouseId:target.settings?.storeWarehouseId||null},autoConnect:auto,pulse}
 }));
 return{status:'READY',businessDate,generatedAt:new Date().toISOString(),items}
}

export async function handleBusinessPulseApi({req,url,user}){
 const bootstrap=await handleRuntimeBootstrapApi({req,url,user});
 if(bootstrap)return bootstrap;
 const force=url.searchParams.get('force')==='1';
 if(url.pathname==='/api/network/business-pulse'&&req.method==='GET'){requireDirector(user);return{status:200,data:await networkPulseSnapshot(url.searchParams.get('date')||todayISO(),{autoConnect:false})}}
 if(url.pathname==='/api/network/business-pulse/auto-connect'&&req.method==='POST'){requireDirector(user);return{status:200,data:await networkPulseSnapshot(url.searchParams.get('date')||todayISO(),{autoConnect:true})}}
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

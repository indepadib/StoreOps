import { canAccessStore,canManageStore } from './permissions.mjs';
import { todayISO } from '../db.mjs';
import { config } from '../config.mjs';
import { receivingIntegrationConfig,syncExpectedReceiptsFromDynamics,listReceiptsForStore } from './dynamics-receiving.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function requireManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Gestion réception réservée au Responsable magasin ou à la Direction.'),{status:403})}
function degraded(error,storeId){const c=receivingIntegrationConfig(storeId);return{ok:false,mode:c.mode,source:'D365',warehouseId:c.warehouseId||null,code:error?.code||'D365_RECEIVING_UNAVAILABLE',error:error?.message||String(error),details:error?.details||null}}

async function readStoreReceipts(storeId,businessDate,{required=false}={}){
 let sync;
 try{sync=await syncExpectedReceiptsFromDynamics(storeId,{businessDate})}
 catch(error){if(required)throw error;sync=degraded(error,storeId)}
 const items=listReceiptsForStore(storeId,{realOnly:config.realOnly});
 const integration=sync?.synced?{ok:true,mode:'LIVE',source:'D365',warehouseId:sync.warehouseId||null,syncedAt:new Date().toISOString(),diagnostics:sync.diagnostics||null}:{ok:false,mode:sync?.mode||receivingIntegrationConfig(storeId).mode,source:sync?.source||'D365',warehouseId:sync?.warehouseId||receivingIntegrationConfig(storeId).warehouseId||null,code:sync?.diagnostics?.code||sync?.code||'D365_RECEIVING_NOT_CONNECTED',error:sync?.error||(!sync?.synced?'Flux Purchase Orders non connecté ou non activé.':null),diagnostics:sync?.diagnostics||null};
 return{storeId,businessDate,items,integration}
}

export async function handleReceivingReadApi({req,url,user}){
 const path=url.pathname;let p=route(path,'/api/stores/:storeId/receipts-feed');
 if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:await readStoreReceipts(p.storeId,url.searchParams.get('date')||todayISO())}}
 p=route(path,'/api/stores/:storeId/receipts/sync');
 if(p&&req.method==='POST'){requireStore(user,p.storeId);requireManage(user,p.storeId);return{status:200,data:await readStoreReceipts(p.storeId,url.searchParams.get('date')||todayISO(),{required:true})}}
 return null
}

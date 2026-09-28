import {canAccessStore,canManageStore} from './permissions.mjs';
import {sellThroughSnapshot} from './sell-through.mjs';
import {buildGlovoAvailability,pushGlovoAvailability} from './glovo-availability.mjs';
import {coolSaveBasket,coolSaveSuggestions,createCoolSaveBasket,publishCoolSaveBasket,markCoolSaveSold,cancelCoolSaveBasket,listCoolSaveBaskets,coolSaveSummary} from './cool-save.mjs';
import {listCoolSaveExternalOrders,coolSaveExternalOrderSummary} from './cool-save-orders.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function requireStore(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function ensureManage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou Directeur d’exploitation.'),{status:403})}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>3e6)reject(Object.assign(new Error('Payload trop volumineux.'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide.'),{status:400}))}});req.on('error',reject)})}

export async function handleStoreGrowthApi({req,url,user}){
 const path=url.pathname;let p;
 p=route(path,'/api/stores/:storeId/sell-through');if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:await sellThroughSnapshot(p.storeId,{businessDate:url.searchParams.get('date')||undefined,force:url.searchParams.get('force')==='1'})}}
 p=route(path,'/api/stores/:storeId/channels/glovo');if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:await buildGlovoAvailability(p.storeId,{businessDate:url.searchParams.get('date')||undefined})}}
 p=route(path,'/api/stores/:storeId/channels/glovo/sync');if(p&&req.method==='POST'){requireStore(user,p.storeId);ensureManage(user,p.storeId);return{status:202,data:await pushGlovoAvailability(p.storeId,{businessDate:url.searchParams.get('date')||undefined})}}
 p=route(path,'/api/stores/:storeId/cool-save/suggestions');if(p&&req.method==='GET'){requireStore(user,p.storeId);return{status:200,data:await coolSaveSuggestions(p.storeId,{businessDate:url.searchParams.get('date')||undefined})}}
 p=route(path,'/api/stores/:storeId/cool-save');if(p){
  requireStore(user,p.storeId);
  if(req.method==='GET')return{status:200,data:{summary:coolSaveSummary(p.storeId),items:listCoolSaveBaskets(p.storeId,{status:(url.searchParams.get('status')||'ALL').toUpperCase()}),externalOrders:listCoolSaveExternalOrders(p.storeId,{limit:url.searchParams.get('orderLimit')||100}),externalOrderSummary:coolSaveExternalOrderSummary(p.storeId)}};
  if(req.method==='POST'){ensureManage(user,p.storeId);const b=await body(req);return{status:201,data:createCoolSaveBasket({storeId:p.storeId,user,title:b.title,salePrice:b.salePrice,expiresAt:b.expiresAt,items:b.items||[],clientRequestId:b.clientRequestId||null})}}
 }
 p=route(path,'/api/cool-save/:basketId/:action');if(p&&req.method==='POST'){
  const basket=coolSaveBasket(p.basketId);if(!basket)return{status:404,data:{error:'Panier Cool & Save introuvable.'}};requireStore(user,basket.store_id);ensureManage(user,basket.store_id);const b=await body(req);
  if(p.action==='publish')return{status:200,data:publishCoolSaveBasket({id:p.basketId,user})};
  if(p.action==='sold')return{status:200,data:markCoolSaveSold({id:p.basketId,user,settlementReference:b.settlementReference||null})};
  if(p.action==='cancel')return{status:200,data:cancelCoolSaveBasket({id:p.basketId,user})};
 }
 return null
}

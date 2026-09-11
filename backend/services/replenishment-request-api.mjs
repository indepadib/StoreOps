import {canAccessStore,canManageStore} from './permissions.mjs';
import {createReplenishmentRequest,listReplenishmentRequests,replenishmentRequest,transitionReplenishmentRequest} from './replenishment-requests.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req){raw+=c;if(raw.length>1e6)throw Object.assign(new Error('Payload trop volumineux'),{status:413})}try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
const forbidden=message=>({status:403,data:{error:message||'Accès interdit'}});

export async function handleReplenishmentRequestApi({req,url,user}){
 const path=url.pathname;let p;
 p=route(path,'/api/stores/:storeId/replenishment-requests');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  return{status:200,data:{storeId:p.storeId,items:listReplenishmentRequests({storeId:p.storeId,status:url.searchParams.get('status')||null,limit:url.searchParams.get('limit')||200})}}
 }
 if(p&&req.method==='POST'){
  if(!canManageStore(user,p.storeId))return forbidden('Demande de réappro réservée au Responsable magasin ou à la Direction.');
  const b=await body(req);return{status:201,data:await createReplenishmentRequest({storeId:p.storeId,ean:b.ean,user,quantity:b.quantity??null,overrideReason:b.overrideReason||'',businessDate:b.businessDate||null})}
 }
 if(path==='/api/network/replenishment-requests'&&req.method==='GET'){
  if(user?.role!=='ops_director')return forbidden('Vue réseau réservée à la Direction.');
  return{status:200,data:{items:listReplenishmentRequests({status:url.searchParams.get('status')||null,limit:url.searchParams.get('limit')||500})}}
 }
 p=route(path,'/api/replenishment-requests/:requestId');
 if(p&&req.method==='GET'){
  const item=replenishmentRequest(p.requestId);if(!item)return{status:404,data:{error:'Demande de réappro introuvable.'}};
  if(!canAccessStore(user,item.store_id))return forbidden('Accès interdit à cette demande.');
  return{status:200,data:item}
 }
 p=route(path,'/api/replenishment-requests/:requestId/status');
 if(p&&req.method==='POST'){
  const item=replenishmentRequest(p.requestId);if(!item)return{status:404,data:{error:'Demande de réappro introuvable.'}};
  if(!canAccessStore(user,item.store_id))return forbidden('Accès interdit à cette demande.');
  const b=await body(req);return{status:200,data:transitionReplenishmentRequest({id:p.requestId,user,action:b.action,note:b.note||'',externalReference:b.externalReference||'',receivedQty:b.receivedQty??null})}
 }
 return null
}

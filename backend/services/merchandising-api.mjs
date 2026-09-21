import { productTaxonomy } from './assortment.mjs';
import { assortmentIndex,assortmentMembership } from './assortment-resolver.mjs';
import { merchandisingReadiness,syncTaxonomyFromDynamics,syncStoreAssortmentFromDynamics } from './dynamics-merchandising.mjs';
import { productAssortmentReadiness,syncProductAssortmentsFromDynamics } from './dynamics-product-assortment.mjs';
import { storeAssortmentLookupReadiness,previewStoreAssortmentsFromDynamics,syncStoreAssortmentsFromDynamicsChannel } from './dynamics-store-assortment.mjs';
import { listProductAssortmentCatalog,getStoreAssortmentAssignments,saveStoreAssortmentAssignments } from './assortment-admin.mjs';
import { buildItemAssistant } from './item-assistant.mjs';
import { canAccessStore } from './permissions.mjs';
import { resolveAssortmentProfile,applyAssortmentProfile } from './assortment-profiles.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
function forbidden(message='Accès interdit'){return{status:403,data:{error:message}}}
function director(user){return user?.role==='ops_director'}
function storeAccess(user,storeId){return canAccessStore(user,storeId)}
function serializeIndex(idx){return{status:idx.status,model:idx.model||'SNAPSHOT',storeId:idx.storeId,businessDate:idx.businessDate,source:idx.source||null,syncedAt:idx.syncedAt,assortments:idx.assortments||[],includedCount:idx.included?.size||0,excludedCount:idx.excluded?.size||0}}

export async function handleMerchandisingApi({req,url,user}){
 const path=url.pathname;
 if(path==='/api/merchandising/readiness'&&req.method==='GET'){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');
  const storeId=url.searchParams.get('storeId')||null;return{status:200,data:{...merchandisingReadiness(storeId),productAssortments:productAssortmentReadiness(),storeChannelAssortments:storeAssortmentLookupReadiness(storeId)}}
 }
 if(path==='/api/merchandising/taxonomy/sync'&&req.method==='POST'){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');
  return{status:200,data:await syncTaxonomyFromDynamics()}
 }
 if(path==='/api/merchandising/product-assortments/sync'&&req.method==='POST'){
  if(!director(user))return forbidden('Synchronisation assortiment produit réservée à la Direction StoreOps');
  return{status:200,data:await syncProductAssortmentsFromDynamics()}
 }
 if(path==='/api/admin/assortments/catalog'&&req.method==='GET'){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');
  return{status:200,data:{items:listProductAssortmentCatalog(),readiness:productAssortmentReadiness()}}
 }
 let p=route(path,'/api/admin/stores/:storeId/assortments/profile');
 if(p&&req.method==='GET'){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');
  const settings=storeOperationalSettings(p.storeId),profileCode=settings.assortmentProfile||null;
  return{status:200,data:{storeId:p.storeId,profileCode,profileSource:settings.assortmentProfileSource||'UNMAPPED',resolution:resolveAssortmentProfile(profileCode),assignments:getStoreAssortmentAssignments(p.storeId)}}
 }
 p=route(path,'/api/admin/stores/:storeId/assortments/apply-profile');
 if(p&&req.method==='POST'){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');
  const settings=storeOperationalSettings(p.storeId),b=await body(req),profileCode=b.profileCode||settings.assortmentProfile;
  if(!profileCode)return{status:409,data:{error:'Aucun profil assortiment configuré pour ce magasin.',code:'ASSORTMENT_PROFILE_UNCONFIGURED'}};
  return{status:200,data:applyAssortmentProfile({storeId:p.storeId,profileCode,user})}
 }
 let p=route(path,'/api/admin/stores/:storeId/assortments/dynamics-preview');
 if(p&&req.method==='GET'){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');
  return{status:200,data:await previewStoreAssortmentsFromDynamics(p.storeId)}
 }
 p=route(path,'/api/admin/stores/:storeId/assortments/sync-channel');
 if(p&&req.method==='POST'){
  if(!director(user))return forbidden('Synchronisation canal → assortiment réservée à la Direction StoreOps');
  return{status:200,data:await syncStoreAssortmentsFromDynamicsChannel(p.storeId)}
 }
 p=route(path,'/api/admin/stores/:storeId/assortments');
 if(p&&req.method==='GET'){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');
  return{status:200,data:getStoreAssortmentAssignments(p.storeId)}
 }
 if(p&&(req.method==='PUT'||req.method==='PATCH')){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');const b=await body(req);
  return{status:200,data:saveStoreAssortmentAssignments({storeId:p.storeId,user,assortmentKeys:b.assortmentKeys||[]})}
 }
 p=route(path,'/api/stores/:storeId/item-assistant/:ean');
 if(p&&req.method==='GET'){
  if(!storeAccess(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  return{status:200,data:await buildItemAssistant({storeId:p.storeId,ean:p.ean,businessDate:url.searchParams.get('date')||null})}
 }
 p=route(path,'/api/stores/:storeId/assortment/sync');
 if(p&&req.method==='POST'){
  if(!director(user))return forbidden('Synchronisation assortiment réservée à la Direction StoreOps');
  return{status:200,data:await syncStoreAssortmentFromDynamics(p.storeId)}
 }
 p=route(path,'/api/stores/:storeId/assortment');
 if(p&&req.method==='GET'){
  if(!storeAccess(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  const maxAgeHours=Math.max(1,Math.min(24*30,Number(process.env.STOREOPS_ASSORTMENT_MAX_AGE_HOURS)||36));
  const idx=assortmentIndex(p.storeId,{businessDate:url.searchParams.get('date')||null,source:url.searchParams.get('source')||null,maxAgeHours});
  const productNumber=url.searchParams.get('productNumber')||null;
  return{status:200,data:{...serializeIndex(idx),maxAgeHours,product:productNumber?{membership:assortmentMembership(p.storeId,productNumber,{index:idx}),taxonomy:productTaxonomy(productNumber)}:null}}
 }
 p=route(path,'/api/stores/:storeId/products/:productNumber/merchandising');
 if(p&&req.method==='GET'){
  if(!storeAccess(user,p.storeId))return forbidden('Accès interdit à ce magasin.');
  const maxAgeHours=Math.max(1,Math.min(24*30,Number(process.env.STOREOPS_ASSORTMENT_MAX_AGE_HOURS)||36)),idx=assortmentIndex(p.storeId,{businessDate:url.searchParams.get('date')||null,maxAgeHours});
  return{status:200,data:{storeId:p.storeId,productNumber:p.productNumber,assortment:assortmentMembership(p.storeId,p.productNumber,{index:idx}),taxonomy:productTaxonomy(p.productNumber),assortmentSnapshot:serializeIndex(idx)}}
 }
 return null
}

import { assortmentIndex,assortmentMembership,productTaxonomy } from './assortment.mjs';
import { merchandisingReadiness,syncTaxonomyFromDynamics,syncStoreAssortmentFromDynamics } from './dynamics-merchandising.mjs';
import { buildItemAssistant } from './item-assistant.mjs';
import { canAccessStore } from './permissions.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function forbidden(message='Accès interdit'){return{status:403,data:{error:message}}}
function director(user){return user?.role==='ops_director'}
function storeAccess(user,storeId){return canAccessStore(user,storeId)}
function serializeIndex(idx){return{status:idx.status,storeId:idx.storeId,businessDate:idx.businessDate,source:idx.source,syncedAt:idx.syncedAt,assortments:idx.assortments||[],includedCount:idx.included?.size||0,excludedCount:idx.excluded?.size||0}}

export async function handleMerchandisingApi({req,url,user}){
 const path=url.pathname;
 if(path==='/api/merchandising/readiness'&&req.method==='GET'){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');
  const storeId=url.searchParams.get('storeId')||null;return{status:200,data:merchandisingReadiness(storeId)}
 }
 if(path==='/api/merchandising/taxonomy/sync'&&req.method==='POST'){
  if(!director(user))return forbidden('Réservé à la Direction StoreOps');
  return{status:200,data:await syncTaxonomyFromDynamics()}
 }
 let p=route(path,'/api/stores/:storeId/item-assistant/:ean');
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

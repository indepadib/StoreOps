import { canAccessStore } from './permissions.mjs';
import { storeOperationalSettings,saveStoreOperationalSettings,allStoreOperationalSettings,networkOperationalSettings,saveNetworkOperationalSettings } from './store-settings.mjs';
import { listWarehouseOptions } from './dynamics-stock.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
function director(user){if(user.role!=='ops_director')throw Object.assign(new Error('Configuration réservée à la Direction / Administrateur.'),{status:403})}

export async function handleStoreSettingsApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/admin/warehouses'&&req.method==='GET'){director(user);return{status:200,data:await listWarehouseOptions()}}
 if(path==='/api/admin/network/settings'&&req.method==='GET'){director(user);return{status:200,data:networkOperationalSettings()}}
 if(path==='/api/admin/network/settings'&&(req.method==='PUT'||req.method==='PATCH')){director(user);const b=await body(req);return{status:200,data:saveNetworkOperationalSettings({user,defaultSupplyWarehouseId:b.defaultSupplyWarehouseId})}}
 if(path==='/api/admin/stores/settings'&&req.method==='GET'){director(user);return{status:200,data:{items:allStoreOperationalSettings(),network:networkOperationalSettings()}}}
 p=route(path,'/api/stores/:storeId/settings');
 if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403});
  return{status:200,data:storeOperationalSettings(p.storeId)}
 }
 if(p&&(req.method==='PUT'||req.method==='PATCH')){
  director(user);const b=await body(req);
  return{status:200,data:saveStoreOperationalSettings({storeId:p.storeId,user,storeWarehouseId:b.storeWarehouseId,supplyWarehouseId:b.supplyWarehouseId,secondarySupplyWarehouseIds:b.secondarySupplyWarehouseIds||[],d365StoreNumber:b.d365StoreNumber,d365RetailChannelId:b.d365RetailChannelId,d365OperatingUnitNumber:b.d365OperatingUnitNumber,d365LegalEntityId:b.d365LegalEntityId,assortmentProfile:b.assortmentProfile})}
 }
 return null
}

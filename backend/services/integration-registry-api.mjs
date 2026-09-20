import { isNetworkDirector,isPlatformAdmin } from './access-management.mjs';
import { integrationSnapshot,listCustomConnectors,createCustomConnector,updateCustomConnector } from './integration-registry.mjs';
import { d365MappingDiagnosticReadiness,diagnoseD365Mappings,discoverD365SalesMapping,discoverD365PriceHistoryMapping } from './d365-mapping-diagnostics.mjs';
import { d365SalesMappingSettings,saveD365SalesMappingDraft,smokeD365SalesMapping,activateD365SalesMapping,disableD365SalesMapping } from './d365-sales-mapping.mjs';
import { d365PriceHistoryMappingSettings,saveD365PriceHistoryMappingDraft,smokeD365PriceHistoryMapping,activateD365PriceHistoryMapping,disableD365PriceHistoryMapping } from './d365-price-history-mapping.mjs';
import { d365TaxonomyMappingSettings,saveD365TaxonomyMappingDraft,smokeD365TaxonomyMapping,activateD365TaxonomyMapping,disableD365TaxonomyMapping } from './d365-taxonomy-mapping.mjs';
import { d365CostMappingSettings,saveD365CostMappingDraft,smokeD365CostMapping,activateD365CostMapping,disableD365CostMapping } from './d365-cost-mapping.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
function readAccess(user){if(!isNetworkDirector(user))throw Object.assign(new Error('Intégrations réservées à la Direction.'),{status:403,code:'INTEGRATION_ADMIN_REQUIRED'})}
function writeAccess(user){if(!isPlatformAdmin(user))throw Object.assign(new Error('Création et modification des connecteurs réservées à un Administrateur StoreOps.'),{status:403,code:'PLATFORM_ADMIN_REQUIRED'})}

export async function handleIntegrationRegistryApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/admin/integrations'&&req.method==='GET'){readAccess(user);return{status:200,data:{...integrationSnapshot(),custom:listCustomConnectors(),canManage:isPlatformAdmin(user)}}}
 if(path==='/api/admin/integrations/d365-mapping/readiness'&&req.method==='GET'){readAccess(user);return{status:200,data:{...d365MappingDiagnosticReadiness(url.searchParams.get('storeId')||'val-fleuri'),canManage:isPlatformAdmin(user)}}}
 if(path==='/api/admin/integrations/d365-sales-mapping'&&req.method==='GET'){readAccess(user);return{status:200,data:{mapping:d365SalesMappingSettings(),canManage:isPlatformAdmin(user)}}}
 if(path==='/api/admin/integrations/d365-price-history-mapping'&&req.method==='GET'){readAccess(user);return{status:200,data:{mapping:d365PriceHistoryMappingSettings(),canManage:isPlatformAdmin(user)}}}
 if(path==='/api/admin/integrations/d365-taxonomy-mapping'&&req.method==='GET'){readAccess(user);return{status:200,data:{mapping:d365TaxonomyMappingSettings(),canManage:isPlatformAdmin(user)}}}
 if(path==='/api/admin/integrations/d365-cost-mapping'&&req.method==='GET'){readAccess(user);return{status:200,data:{mapping:d365CostMappingSettings(),canManage:isPlatformAdmin(user)}}}
 if(path==='/api/admin/integrations/d365-mapping/diagnose'&&req.method==='POST'){readAccess(user);const b=await body(req);return{status:200,data:await diagnoseD365Mappings(b.storeId||'val-fleuri')}}
 if(path==='/api/admin/integrations/d365-sales-mapping/auto-connect'&&req.method==='POST'){
  writeAccess(user);const b=await body(req),storeId=b.storeId||'val-fleuri',discovery=await discoverD365SalesMapping(storeId),rec=discovery?.recommendation;
  if(!rec?.salesEntity)return{status:409,data:{error:'Aucun mapping ventes exploitable détecté automatiquement.',code:'D365_SALES_AUTO_DISCOVERY_FAILED',discovery}};
  const mapping={entity:rec.salesEntity,fields:rec.fields||{},dateFilterMode:rec.dateFilterMode||'datetime',salesSign:rec.salesSign??-1,quantitySign:rec.quantitySign??1,costSign:rec.costSign??-1};
  const validated=await smokeD365SalesMapping({actor:user,storeId,input:mapping});
  if(validated?.smoke?.status!=='PASSED')return{status:200,data:{activated:false,mapping:validated,discovery}};
  const live=activateD365SalesMapping({actor:user});
  return{status:200,data:{activated:true,mapping:live,discovery}}
 }
 if(path==='/api/admin/integrations/d365-sales-mapping/draft'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:saveD365SalesMappingDraft({actor:user,input:b})}}
 if(path==='/api/admin/integrations/d365-sales-mapping/smoke'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:await smokeD365SalesMapping({actor:user,storeId:b.storeId||'val-fleuri',input:b.mapping||null})}}
 if(path==='/api/admin/integrations/d365-sales-mapping/activate'&&req.method==='POST'){writeAccess(user);return{status:200,data:activateD365SalesMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-sales-mapping/disable'&&req.method==='POST'){writeAccess(user);return{status:200,data:disableD365SalesMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-price-history-mapping/auto-connect'&&req.method==='POST'){
  writeAccess(user);const b=await body(req),discovery=await discoverD365PriceHistoryMapping(),rec=discovery?.recommendation;
  if(!rec?.entity)return{status:409,data:{error:'Aucune source Trade Agreements datée exploitable détectée automatiquement.',code:'D365_PRICE_HISTORY_AUTO_DISCOVERY_FAILED',discovery}};
  const productNumber=String(b.productNumber||discovery.sampleProductNumber||'').trim();
  if(!productNumber)return{status:409,data:{error:'Une source prix a été détectée mais aucun SKU témoin n’a pu être choisi automatiquement.',code:'D365_PRICE_HISTORY_SAMPLE_ITEM_REQUIRED',discovery}};
  const validated=await smokeD365PriceHistoryMapping({actor:user,productNumber,input:{entity:rec.entity,fields:rec.fields||{}}});
  if(validated?.smoke?.status!=='PASSED')return{status:200,data:{activated:false,mapping:validated,discovery,sampleProductNumber:productNumber}};
  const live=activateD365PriceHistoryMapping({actor:user});
  return{status:200,data:{activated:true,mapping:live,discovery,sampleProductNumber:productNumber}}
 }
 if(path==='/api/admin/integrations/d365-price-history-mapping/draft'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:saveD365PriceHistoryMappingDraft({actor:user,input:b})}}
 if(path==='/api/admin/integrations/d365-price-history-mapping/smoke'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:await smokeD365PriceHistoryMapping({actor:user,productNumber:b.productNumber,input:b.mapping||null})}}
 if(path==='/api/admin/integrations/d365-price-history-mapping/activate'&&req.method==='POST'){writeAccess(user);return{status:200,data:activateD365PriceHistoryMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-price-history-mapping/disable'&&req.method==='POST'){writeAccess(user);return{status:200,data:disableD365PriceHistoryMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-cost-mapping/draft'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:saveD365CostMappingDraft({actor:user,input:b})}}
 if(path==='/api/admin/integrations/d365-cost-mapping/smoke'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:await smokeD365CostMapping({actor:user,productNumber:b.productNumber,input:b.mapping||null})}}
 if(path==='/api/admin/integrations/d365-cost-mapping/activate'&&req.method==='POST'){writeAccess(user);return{status:200,data:activateD365CostMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-cost-mapping/disable'&&req.method==='POST'){writeAccess(user);return{status:200,data:disableD365CostMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-taxonomy-mapping/draft'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:saveD365TaxonomyMappingDraft({actor:user,input:b})}}
 if(path==='/api/admin/integrations/d365-taxonomy-mapping/smoke'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:await smokeD365TaxonomyMapping({actor:user,productNumber:b.productNumber,input:b.mapping||null})}}
 if(path==='/api/admin/integrations/d365-taxonomy-mapping/activate'&&req.method==='POST'){writeAccess(user);return{status:200,data:activateD365TaxonomyMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-taxonomy-mapping/disable'&&req.method==='POST'){writeAccess(user);return{status:200,data:disableD365TaxonomyMapping({actor:user})}}
 if(path==='/api/admin/integrations/connectors'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:201,data:createCustomConnector({actor:user,name:b.name,family:b.family,plannedCapabilities:b.plannedCapabilities,note:b.note})}}
 p=route(path,'/api/admin/integrations/connectors/:key');if(p&&(req.method==='PUT'||req.method==='PATCH')){writeAccess(user);const b=await body(req);return{status:200,data:updateCustomConnector({actor:user,key:p.key,name:b.name,family:b.family,plannedCapabilities:b.plannedCapabilities,note:b.note,active:b.active!==false})}}
 return null
}

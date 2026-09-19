import { isNetworkDirector,isPlatformAdmin } from './access-management.mjs';
import { integrationSnapshot,listCustomConnectors,createCustomConnector,updateCustomConnector } from './integration-registry.mjs';
import { d365MappingDiagnosticReadiness,diagnoseD365Mappings } from './d365-mapping-diagnostics.mjs';
import { d365SalesMappingSettings,saveD365SalesMappingDraft,smokeD365SalesMapping,activateD365SalesMapping,disableD365SalesMapping } from './d365-sales-mapping.mjs';
import { d365PriceHistoryMappingSettings,saveD365PriceHistoryMappingDraft,smokeD365PriceHistoryMapping,activateD365PriceHistoryMapping,disableD365PriceHistoryMapping } from './d365-price-history-mapping.mjs';
import { d365TaxonomyMappingSettings,saveD365TaxonomyMappingDraft,smokeD365TaxonomyMapping,activateD365TaxonomyMapping,disableD365TaxonomyMapping } from './d365-taxonomy-mapping.mjs';

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
 if(path==='/api/admin/integrations/d365-mapping/diagnose'&&req.method==='POST'){readAccess(user);const b=await body(req);return{status:200,data:await diagnoseD365Mappings(b.storeId||'val-fleuri')}}
 if(path==='/api/admin/integrations/d365-sales-mapping/draft'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:saveD365SalesMappingDraft({actor:user,input:b})}}
 if(path==='/api/admin/integrations/d365-sales-mapping/smoke'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:await smokeD365SalesMapping({actor:user,storeId:b.storeId||'val-fleuri',input:b.mapping||null})}}
 if(path==='/api/admin/integrations/d365-sales-mapping/autoconfigure'&&req.method==='POST'){
  writeAccess(user);const b=await body(req),storeId=b.storeId||'val-fleuri',diagnostic=await diagnoseD365Mappings(storeId),rec=diagnostic?.recommendation||{},fields=rec.fields||{};
  const missing=['channel','businessDate','transaction','net'].filter(key=>!fields[key]);
  if(!rec.salesEntity||missing.length)throw Object.assign(new Error(`Le diagnostic D365 ne fournit pas encore un mapping ventes complet : ${missing.join(', ')||'entité'}.`),{status:409,code:'D365_SALES_AUTOCONFIG_INCOMPLETE',details:{diagnosticStatus:diagnostic?.status||null,salesEntity:rec.salesEntity||null,missing}});
  const mapping={entity:rec.salesEntity,fields,dateFilterMode:rec.dateFilterMode||'datetime',salesSign:rec.salesSign??-1,quantitySign:rec.quantitySign??1,costSign:rec.costSign??-1};
  const validated=await smokeD365SalesMapping({actor:user,storeId,input:mapping});
  if(validated.state!=='VALIDATED'||validated.smoke?.status!=='PASSED'||validated.smoke?.channelValidated!==true)throw Object.assign(new Error('Le smoke ventes n’a pas validé les transactions du magasin ciblé. Aucune activation effectuée.'),{status:409,code:'D365_SALES_AUTOCONFIG_SMOKE_FAILED',details:{smoke:validated.smoke||null}});
  const live=activateD365SalesMapping({actor:user});
  return{status:200,data:{mapping:live,smoke:validated.smoke,diagnostic:{status:diagnostic.status,salesEntity:rec.salesEntity,fields}}}
 }
 if(path==='/api/admin/integrations/d365-sales-mapping/activate'&&req.method==='POST'){writeAccess(user);return{status:200,data:activateD365SalesMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-sales-mapping/disable'&&req.method==='POST'){writeAccess(user);return{status:200,data:disableD365SalesMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-price-history-mapping/draft'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:saveD365PriceHistoryMappingDraft({actor:user,input:b})}}
 if(path==='/api/admin/integrations/d365-price-history-mapping/smoke'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:await smokeD365PriceHistoryMapping({actor:user,productNumber:b.productNumber,input:b.mapping||null})}}
 if(path==='/api/admin/integrations/d365-price-history-mapping/activate'&&req.method==='POST'){writeAccess(user);return{status:200,data:activateD365PriceHistoryMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-price-history-mapping/disable'&&req.method==='POST'){writeAccess(user);return{status:200,data:disableD365PriceHistoryMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-taxonomy-mapping/draft'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:saveD365TaxonomyMappingDraft({actor:user,input:b})}}
 if(path==='/api/admin/integrations/d365-taxonomy-mapping/smoke'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:200,data:await smokeD365TaxonomyMapping({actor:user,productNumber:b.productNumber,input:b.mapping||null})}}
 if(path==='/api/admin/integrations/d365-taxonomy-mapping/activate'&&req.method==='POST'){writeAccess(user);return{status:200,data:activateD365TaxonomyMapping({actor:user})}}
 if(path==='/api/admin/integrations/d365-taxonomy-mapping/disable'&&req.method==='POST'){writeAccess(user);return{status:200,data:disableD365TaxonomyMapping({actor:user})}}
 if(path==='/api/admin/integrations/connectors'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:201,data:createCustomConnector({actor:user,name:b.name,family:b.family,plannedCapabilities:b.plannedCapabilities,note:b.note})}}
 p=route(path,'/api/admin/integrations/connectors/:key');if(p&&(req.method==='PUT'||req.method==='PATCH')){writeAccess(user);const b=await body(req);return{status:200,data:updateCustomConnector({actor:user,key:p.key,name:b.name,family:b.family,plannedCapabilities:b.plannedCapabilities,note:b.note,active:b.active!==false})}}
 return null
}

import { isNetworkDirector,isPlatformAdmin } from './access-management.mjs';
import { integrationSnapshot,listCustomConnectors,createCustomConnector,updateCustomConnector } from './integration-registry.mjs';
import { d365MappingDiagnosticReadiness,diagnoseD365Mappings } from './d365-mapping-diagnostics.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
function readAccess(user){if(!isNetworkDirector(user))throw Object.assign(new Error('Intégrations réservées à la Direction.'),{status:403,code:'INTEGRATION_ADMIN_REQUIRED'})}
function writeAccess(user){if(!isPlatformAdmin(user))throw Object.assign(new Error('Création et modification des connecteurs réservées à un Administrateur StoreOps.'),{status:403,code:'PLATFORM_ADMIN_REQUIRED'})}

export async function handleIntegrationRegistryApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/admin/integrations'&&req.method==='GET'){readAccess(user);return{status:200,data:{...integrationSnapshot(),custom:listCustomConnectors(),canManage:isPlatformAdmin(user)}}}
 if(path==='/api/admin/integrations/d365-mapping/readiness'&&req.method==='GET'){readAccess(user);return{status:200,data:d365MappingDiagnosticReadiness(url.searchParams.get('storeId')||'val-fleuri')}}
 if(path==='/api/admin/integrations/d365-mapping/diagnose'&&req.method==='POST'){readAccess(user);const b=await body(req);return{status:200,data:await diagnoseD365Mappings(b.storeId||'val-fleuri')}}
 if(path==='/api/admin/integrations/connectors'&&req.method==='POST'){writeAccess(user);const b=await body(req);return{status:201,data:createCustomConnector({actor:user,name:b.name,family:b.family,plannedCapabilities:b.plannedCapabilities,note:b.note})}}
 p=route(path,'/api/admin/integrations/connectors/:key');if(p&&(req.method==='PUT'||req.method==='PATCH')){writeAccess(user);const b=await body(req);return{status:200,data:updateCustomConnector({actor:user,key:p.key,name:b.name,family:b.family,plannedCapabilities:b.plannedCapabilities,note:b.note,active:b.active!==false})}}
 return null
}

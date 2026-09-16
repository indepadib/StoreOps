import { accessProfiles,accessIntegrationStatus,isNetworkDirector,isPlatformAdmin,listAccessAccounts,listAccessEmployees,createAccessAccount,updateAccessAccount,setAccessAccountActive } from './access-management.mjs';
import { capabilityCatalog,capabilityView,profileCapabilityDefaults,setCapabilityOverrides } from './access-capabilities.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
function director(user){if(!isNetworkDirector(user))throw Object.assign(new Error('Gestion des accès réservée à la Direction.'),{status:403,code:'ACCESS_ADMIN_REQUIRED'})}
function profileDefaults(){return Object.fromEntries(accessProfiles().map(p=>[p.code,profileCapabilityDefaults(p.code)]))}

export async function handleAccessManagementApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/admin/access/config'&&req.method==='GET'){director(user);return{status:200,data:{profiles:accessProfiles(),integration:accessIntegrationStatus(),canManageSensitive:isPlatformAdmin(user),capabilities:capabilityCatalog(),profileDefaults:profileDefaults()}}}
 if(path==='/api/admin/access/accounts'){
  director(user);
  if(req.method==='GET')return{status:200,data:{items:listAccessAccounts({includeInactive:url.searchParams.get('all')!=='0'})}};
  if(req.method==='POST'){
   const b=await body(req),created=createAccessAccount({actor:user,name:b.name,emailAddress:b.email,profileCode:b.profileCode,storeId:b.storeId||null,linkedEmployeeId:b.linkedEmployeeId||null,identityProvider:b.identityProvider||'ENTRA',identitySubject:b.identitySubject||null,note:b.note||null});
   if(b.capabilityOverrides&&isPlatformAdmin(user))setCapabilityOverrides({actor:user,userId:created.id,overrides:b.capabilityOverrides,replace:true});
   return{status:201,data:{...created,capabilityView:capabilityView({id:created.id,role:created.profileCode==='OPS_DIRECTOR'||created.profileCode==='PLATFORM_ADMIN'?'ops_director':created.profileCode==='STORE_MANAGER'?'store_manager':'employee',permissions_profile:created.profileCode==='PLATFORM_ADMIN'?'platform_admin':created.profileCode==='QUALITY_AUDIT'?'quality_audit':created.profileCode==='DEVELOPMENT'?'development':created.profileCode==='STORE_USER'?'store_user':null})}}
  }
 }
 p=route(path,'/api/admin/access/accounts/:userId/capabilities');if(p){
  director(user);
  if(req.method==='GET'){
   const account=listAccessAccounts({includeInactive:true}).find(x=>x.id===p.userId);if(!account)return{status:404,data:{error:'Compte StoreOps introuvable.',code:'ACCESS_ACCOUNT_NOT_FOUND'}};
   return{status:200,data:capabilityView({id:account.id,role:account.profileCode==='OPS_DIRECTOR'||account.profileCode==='PLATFORM_ADMIN'?'ops_director':account.profileCode==='STORE_MANAGER'?'store_manager':'employee',permissions_profile:account.profileCode==='PLATFORM_ADMIN'?'platform_admin':account.profileCode==='QUALITY_AUDIT'?'quality_audit':account.profileCode==='DEVELOPMENT'?'development':account.profileCode==='STORE_USER'?'store_user':null})}
  }
  if(req.method==='PUT'||req.method==='PATCH'){const b=await body(req);return{status:200,data:setCapabilityOverrides({actor:user,userId:p.userId,overrides:b.overrides||{},replace:b.replace!==false})}}
 }
 p=route(path,'/api/admin/access/accounts/:userId');if(p&&(req.method==='PUT'||req.method==='PATCH')){
  director(user);const b=await body(req),updated=updateAccessAccount({actor:user,userId:p.userId,name:b.name,emailAddress:b.email,profileCode:b.profileCode,storeId:b.storeId||null,linkedEmployeeId:b.linkedEmployeeId||null,identityProvider:b.identityProvider||'ENTRA',identitySubject:b.identitySubject||null,note:b.note||null});
  if(b.capabilityOverrides&&isPlatformAdmin(user))setCapabilityOverrides({actor:user,userId:p.userId,overrides:b.capabilityOverrides,replace:true});
  return{status:200,data:updated}
 }
 p=route(path,'/api/admin/access/accounts/:userId/active');if(p&&req.method==='POST'){director(user);const b=await body(req);return{status:200,data:setAccessAccountActive({actor:user,userId:p.userId,active:b.active!==false})}}
 if(path==='/api/admin/access/employees'&&req.method==='GET'){director(user);return{status:200,data:{items:listAccessEmployees({storeId:url.searchParams.get('storeId')||null,includeEnded:url.searchParams.get('includeEnded')==='1'})}}}
 return null
}

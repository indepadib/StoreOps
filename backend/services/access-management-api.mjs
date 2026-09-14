import { accessProfiles,accessIntegrationStatus,isNetworkDirector,isPlatformAdmin,listAccessAccounts,listAccessEmployees,createAccessAccount,updateAccessAccount,setAccessAccountActive } from './access-management.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
function director(user){if(!isNetworkDirector(user))throw Object.assign(new Error('Gestion des accès réservée à la Direction.'),{status:403,code:'ACCESS_ADMIN_REQUIRED'})}

export async function handleAccessManagementApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/admin/access/config'&&req.method==='GET'){director(user);return{status:200,data:{profiles:accessProfiles(),integration:accessIntegrationStatus(),canManageSensitive:isPlatformAdmin(user)}}}
 if(path==='/api/admin/access/accounts'){
  director(user);
  if(req.method==='GET')return{status:200,data:{items:listAccessAccounts({includeInactive:url.searchParams.get('all')!=='0'})}};
  if(req.method==='POST'){const b=await body(req);return{status:201,data:createAccessAccount({actor:user,name:b.name,emailAddress:b.email,profileCode:b.profileCode,storeId:b.storeId||null,linkedEmployeeId:b.linkedEmployeeId||null,identityProvider:b.identityProvider||'ENTRA',identitySubject:b.identitySubject||null,note:b.note||null})}}
 }
 p=route(path,'/api/admin/access/accounts/:userId');if(p&&(req.method==='PUT'||req.method==='PATCH')){director(user);const b=await body(req);return{status:200,data:updateAccessAccount({actor:user,userId:p.userId,name:b.name,emailAddress:b.email,profileCode:b.profileCode,storeId:b.storeId||null,linkedEmployeeId:b.linkedEmployeeId||null,identityProvider:b.identityProvider||'ENTRA',identitySubject:b.identitySubject||null,note:b.note||null})}}
 p=route(path,'/api/admin/access/accounts/:userId/active');if(p&&req.method==='POST'){director(user);const b=await body(req);return{status:200,data:setAccessAccountActive({actor:user,userId:p.userId,active:b.active!==false})}}
 if(path==='/api/admin/access/employees'&&req.method==='GET'){director(user);return{status:200,data:{items:listAccessEmployees({storeId:url.searchParams.get('storeId')||null,includeEnded:url.searchParams.get('includeEnded')==='1'})}}}
 return null
}

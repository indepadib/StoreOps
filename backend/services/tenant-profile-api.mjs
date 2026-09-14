import { isPlatformAdmin } from './access-management.mjs';
import { tenantProfile,updateTenantProfile } from './tenant-profile.mjs';

async function body(req){let raw='';for await(const c of req)raw+=c;try{return raw?JSON.parse(raw):{}}catch{throw Object.assign(new Error('JSON invalide'),{status:400})}}
export async function handleTenantProfileApi({req,url,user}){
 const path=url.pathname;
 if(path==='/api/tenant/profile'&&req.method==='GET')return{status:200,data:tenantProfile()};
 if(path==='/api/admin/tenant/profile'&&(req.method==='PUT'||req.method==='PATCH')){if(!isPlatformAdmin(user))throw Object.assign(new Error('Configuration enseigne réservée à un Administrateur StoreOps.'),{status:403,code:'PLATFORM_ADMIN_REQUIRED'});const b=await body(req);return{status:200,data:updateTenantProfile({actor:user,input:b})}}
 return null
}

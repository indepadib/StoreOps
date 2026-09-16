import { db } from '../db.mjs';
import { config } from '../config.mjs';
import { canAccessStore,canAccessDevelopment } from './permissions.mjs';

function userView(user){return user?{id:user.id,name:user.name,email:user.email,role:user.role,store_id:user.store_id,permissions_profile:user.permissions_profile||null}:null}

export function runtimeBootstrap(user){
 const stores=db.prepare(`SELECT * FROM stores WHERE active=1 ORDER BY name`).all().filter(s=>canAccessStore(user,s.id));
 const demoUsers=config.authMode==='demo'?db.prepare(`SELECT id,name,role,store_id,permissions_profile FROM users WHERE active=1 ORDER BY role,name`).all():[];
 return{
  authMode:config.authMode,
  version:config.appVersion,
  dynamicsMode:config.dynamics.mode,
  user:userView(user),
  availableDemoUsers:demoUsers,
  stores,
  developmentAccess:canAccessDevelopment(user),
  generatedAt:new Date().toISOString(),
  diagnostics:{httpFanout:0,source:'RUNTIME_BOOTSTRAP'}
 }
}

export async function handleRuntimeBootstrapApi({req,url,user}){
 if(req.method!=='GET'||url.pathname!=='/api/bootstrap')return null;
 return{status:200,data:runtimeBootstrap(user)}
}

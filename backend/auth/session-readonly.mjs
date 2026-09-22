import { config } from '../config.mjs';
import { db } from '../db.mjs';
import { verifyEntraToken } from './entra.mjs';

function header(req,name){
 const headers=req?.headers;
 if(!headers)return'';
 if(typeof headers.get==='function')return String(headers.get(name)||'');
 return String(headers[name]||headers[name.toLowerCase()]||'');
}
function bearer(req){
 const h=header(req,'authorization');
 return h.startsWith('Bearer ')?h.slice(7).trim():null;
}
function claimIdentity(claims){return{oid:claims?.oid||claims?.sub||null,email:String(claims?.preferred_username||claims?.email||claims?.upn||'').trim().toLowerCase()}}
function findUserByClaimsReadOnly(claims,{activeOnly=true}={}){
 const {oid,email}=claimIdentity(claims),active=activeOnly?' AND active=1':'';
 let user=oid?db.prepare(`SELECT * FROM users WHERE (entra_oid=? OR (identity_provider='ENTRA' AND identity_subject=?))${active}`).get(oid,oid):null;
 if(!user&&email)user=db.prepare(`SELECT * FROM users WHERE (lower(email)=? OR lower(dynamics_email)=?)${active}`).get(email,email);
 return user||null
}

export function supportsReadOnlySession(){return config.authMode==='entra'||config.authMode==='demo'}

export async function readOnlySessionFromRequest(req){
 if(config.authMode==='demo'){
  const id=header(req,'x-demo-user')||'u-vf';
  const user=db.prepare(`SELECT * FROM users WHERE id=? AND active=1`).get(String(id));
  if(!user)throw Object.assign(new Error('Utilisateur de démonstration inconnu ou désactivé'),{status:401});
  return{user,claims:null,mode:'demo'}
 }
 if(config.authMode!=='entra')throw Object.assign(new Error('Session légère non disponible pour ce mode d’authentification.'),{status:501,code:'READ_ONLY_SESSION_UNSUPPORTED'});
 const token=bearer(req);
 if(!token)throw Object.assign(new Error('Authentification requise'),{status:401});
 const claims=await verifyEntraToken(token);
 const user=findUserByClaimsReadOnly(claims,{activeOnly:true});
 if(!user){const existing=findUserByClaimsReadOnly(claims,{activeOnly:false});if(existing&&!existing.active)throw Object.assign(new Error('Compte StoreOps désactivé.'),{status:403,code:'USER_DEACTIVATED'});throw Object.assign(new Error('Compte Microsoft authentifié mais non provisionné dans StoreOps.'),{status:403,code:'USER_NOT_PROVISIONED'})}
 return{user,claims,mode:'entra'}
}

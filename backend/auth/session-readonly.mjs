import { config } from '../config.mjs';
import { db } from '../db.mjs';
import { verifyEntraToken } from './entra.mjs';
import { findStoreOpsUserFromEntraClaims,unauthorizedEntraError } from './identity.mjs';

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
 const {user}=findStoreOpsUserFromEntraClaims(claims,{bind:false});
 if(!user)throw unauthorizedEntraError(claims);
 return{user,claims,mode:'entra'}
}

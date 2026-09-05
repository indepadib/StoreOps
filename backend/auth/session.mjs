import { config } from '../config.mjs';
import { db } from '../db.mjs';
import '../services/pilot-profile.mjs';
import { verifyEntraToken } from './entra.mjs';
import { localSessionFromRequest } from './local.mjs';

function bearer(req){
  const h=String(req.headers.authorization||'');
  return h.startsWith('Bearer ')?h.slice(7).trim():null;
}

function userByClaims(claims){
  const oid=claims.oid||claims.sub||null;
  const email=(claims.preferred_username||claims.email||claims.upn||'').toLowerCase();
  let user=oid?db.prepare(`SELECT * FROM users WHERE entra_oid=?`).get(oid):null;
  if(!user && email) user=db.prepare(`SELECT * FROM users WHERE lower(email)=? OR lower(dynamics_email)=?`).get(email,email);
  if(user&&oid&&!user.entra_oid){db.prepare(`UPDATE users SET entra_oid=? WHERE id=? AND entra_oid IS NULL`).run(oid,user.id);user=db.prepare(`SELECT * FROM users WHERE id=?`).get(user.id)}
  return user||null;
}

export async function sessionFromRequest(req){
  if(config.authMode==='demo'){
    const id=req.headers['x-demo-user']||'u-vf';
    const user=db.prepare(`SELECT * FROM users WHERE id=?`).get(String(id));
    if(!user) throw Object.assign(new Error('Utilisateur de démonstration inconnu'),{status:401});
    return {user,claims:null,mode:'demo'};
  }
  if(config.authMode==='local')return {user:localSessionFromRequest(req),claims:null,mode:'local'};
  const token=bearer(req);
  if(!token) throw Object.assign(new Error('Authentification requise'),{status:401});
  const claims=await verifyEntraToken(token);
  const user=userByClaims(claims);
  if(!user) throw Object.assign(new Error('Compte authentifié mais non autorisé dans StoreOps'),{status:403,code:'USER_NOT_PROVISIONED'});
  return {user,claims,mode:'entra'};
}

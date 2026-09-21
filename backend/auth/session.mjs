import { config } from '../config.mjs';
import { db } from '../db.mjs';
import '../services/pilot-profile.mjs';
import { verifyEntraToken } from './entra.mjs';
import { verifyLocalRequest } from './local.mjs';

function bearer(req){
  const h=String(req.headers.authorization||'');
  return h.startsWith('Bearer ')?h.slice(7).trim():null;
}

function userByClaims(claims){
  const oid=claims.oid||claims.sub||null;
  const email=(claims.preferred_username||claims.email||claims.upn||'').toLowerCase();
  const qualityAliases=new Set([process.env.STOREOPS_QUALITY_AUDIT_EMAIL,process.env.STOREOPS_QUALITY_AUDIT_MICROSOFT_EMAIL,...String(process.env.STOREOPS_QUALITY_AUDIT_ALIASES||'').split(/[;,]/)].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean));
  if(email&&qualityAliases.has(email)){const quality=db.prepare(`SELECT * FROM users WHERE id='u-quality-audit' AND active=1`).get();if(quality)return quality}
  let user=oid?db.prepare(`SELECT * FROM users WHERE entra_oid=? AND active=1`).get(oid):null;
  if(!user && email) user=db.prepare(`SELECT * FROM users WHERE active=1 AND (lower(email)=? OR lower(dynamics_email)=?)`).get(email,email);
  if(user&&oid&&!user.entra_oid){db.prepare(`UPDATE users SET entra_oid=? WHERE id=? AND entra_oid IS NULL`).run(oid,user.id);user=db.prepare(`SELECT * FROM users WHERE id=? AND active=1`).get(user.id)}
  return user||null;
}

export async function sessionFromRequest(req){
  if(config.authMode==='demo'){
    const id=req.headers['x-demo-user']||'u-vf';
    const user=db.prepare(`SELECT * FROM users WHERE id=? AND active=1`).get(String(id));
    if(!user) throw Object.assign(new Error('Utilisateur de démonstration inconnu ou désactivé'),{status:401});
    return {user,claims:null,mode:'demo'};
  }
  if(config.authMode==='local'){
    const user=verifyLocalRequest(req);
    if(!user?.active)throw Object.assign(new Error('Compte StoreOps désactivé'),{status:403,code:'USER_DEACTIVATED'});
    return {user,claims:null,mode:'local'};
  }
  const token=bearer(req);
  if(!token) throw Object.assign(new Error('Authentification requise'),{status:401});
  const claims=await verifyEntraToken(token);
  const user=userByClaims(claims);
  if(!user) throw Object.assign(new Error('Compte authentifié mais non autorisé ou désactivé dans StoreOps'),{status:403,code:'USER_NOT_PROVISIONED'});
  return {user,claims,mode:'entra'};
}

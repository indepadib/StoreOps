import { config } from '../config.mjs';
import { db } from '../db.mjs';
import '../services/pilot-profile.mjs';
import { verifyEntraToken } from './entra.mjs';
import { verifyLocalRequest } from './local.mjs';

function bearer(req){
  const h=String(req.headers.authorization||'');
  return h.startsWith('Bearer ')?h.slice(7).trim():null;
}

function claimIdentity(claims){
  return{oid:claims.oid||claims.sub||null,email:String(claims.preferred_username||claims.email||claims.upn||'').trim().toLowerCase()}
}
function findUserByClaims(claims,{activeOnly=true}={}){
  const {oid,email}=claimIdentity(claims),active=activeOnly?' AND active=1':'';
  let user=oid?db.prepare(`SELECT * FROM users WHERE (entra_oid=? OR (identity_provider='ENTRA' AND identity_subject=?))${active}`).get(oid,oid):null;
  if(!user&&email)user=db.prepare(`SELECT * FROM users WHERE (lower(email)=? OR lower(dynamics_email)=?)${active}`).get(email,email);
  return user||null
}
function userByClaims(claims){
  const {oid}=claimIdentity(claims);
  let user=findUserByClaims(claims,{activeOnly:true});
  if(user&&oid&&!user.entra_oid){
    db.prepare(`UPDATE users SET entra_oid=?,identity_provider=COALESCE(identity_provider,'ENTRA'),identity_subject=COALESCE(identity_subject,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND entra_oid IS NULL`).run(oid,oid,user.id);
    user=db.prepare(`SELECT * FROM users WHERE id=? AND active=1`).get(user.id)
  }
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
  if(!user){
    const existing=findUserByClaims(claims,{activeOnly:false});
    if(existing&&!existing.active)throw Object.assign(new Error('Compte StoreOps désactivé. Contacte un administrateur pour le réactiver.'),{status:403,code:'USER_DEACTIVATED'});
    throw Object.assign(new Error('Compte Microsoft authentifié mais non provisionné dans StoreOps. Un administrateur doit créer ou rattacher ce compte dans Utilisateurs & accès.'),{status:403,code:'USER_NOT_PROVISIONED'});
  }
  return {user,claims,mode:'entra'};
}

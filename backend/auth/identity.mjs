import { db } from '../db.mjs';

function ensureColumn(table,column,definition){
 const cols=db.prepare(`PRAGMA table_info(${table})`).all();
 if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
ensureColumn('users','dynamics_email','TEXT NULL');
ensureColumn('users','identity_provider','TEXT NULL');
ensureColumn('users','identity_subject','TEXT NULL');

const norm=v=>String(v??'').trim().toLowerCase();
export function entraIdentity(claims={}){
 const oid=String(claims?.oid||claims?.sub||'').trim()||null;
 const raw=[claims?.preferred_username,claims?.email,claims?.upn,claims?.unique_name,claims?.signInName,...(Array.isArray(claims?.emails)?claims.emails:[])];
 const aliases=[...new Set(raw.map(norm).filter(x=>x&&x.includes('@')))];
 return{oid,aliases,loginHint:aliases[0]||null}
}

export function findStoreOpsUserFromEntraClaims(claims,{bind=false}={}){
 const identity=entraIdentity(claims);
 let user=null,matchedBy=null;
 if(identity.oid){
  user=db.prepare(`SELECT * FROM users WHERE active=1 AND (entra_oid=? OR identity_subject=?) LIMIT 1`).get(identity.oid,identity.oid)||null;
  if(user)matchedBy='OBJECT_ID'
 }
 if(!user&&identity.aliases.length){
  const ph=identity.aliases.map(()=>'?').join(',');
  const rows=db.prepare(`SELECT * FROM users WHERE active=1 AND (lower(email) IN (${ph}) OR lower(dynamics_email) IN (${ph})) ORDER BY id`).all(...identity.aliases,...identity.aliases);
  if(rows.length>1)throw Object.assign(new Error('Plusieurs comptes StoreOps correspondent à cette identité Microsoft. Corrige les doublons dans Admin Studio.'),{status:409,code:'ACCESS_IDENTITY_AMBIGUOUS'});
  user=rows[0]||null;if(user)matchedBy='EMAIL_OR_UPN'
 }
 if(user&&bind&&identity.oid){
  db.prepare(`UPDATE users SET entra_oid=COALESCE(entra_oid,?),identity_provider=COALESCE(identity_provider,'ENTRA'),identity_subject=COALESCE(identity_subject,?),updated_at=COALESCE(updated_at,CURRENT_TIMESTAMP) WHERE id=?`).run(identity.oid,identity.oid,user.id);
  user=db.prepare(`SELECT * FROM users WHERE id=? AND active=1`).get(user.id)||user
 }
 return{user:user||null,identity,matchedBy}
}

export function unauthorizedEntraError(claims){
 const {loginHint}=entraIdentity(claims);
 return Object.assign(new Error(loginHint?`Compte Microsoft connecté : ${loginHint}. Aucun accès StoreOps actif ne correspond encore à cet email/UPN.`:'Compte Microsoft authentifié mais aucun accès StoreOps actif ne correspond à cette identité.'),{status:403,code:'USER_NOT_PROVISIONED',details:{loginHint}})
}

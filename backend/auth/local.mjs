import { randomBytes,scryptSync,timingSafeEqual,createHash } from 'node:crypto';
import { db } from '../db.mjs';

const LOCK_AFTER=7;
const LOCK_MINUTES=15;
const SESSION_HOURS=18;

// Pilot credentials and sessions are stored only as one-way hashes.
db.exec(`
CREATE TABLE IF NOT EXISTS local_credentials(
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS local_sessions(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_local_sessions_user ON local_sessions(user_id,expires_at);
`);

function hashPassword(password,salt){return scryptSync(String(password),Buffer.from(salt,'hex'),64).toString('hex')}
function hashToken(token){return createHash('sha256').update(String(token)).digest('hex')}
function secureEqual(a,b){const x=Buffer.from(String(a||''),'hex'),y=Buffer.from(String(b||''),'hex');return x.length===y.length&&x.length>0&&timingSafeEqual(x,y)}
function normalizeEmail(v){return String(v||'').trim().toLowerCase()}
function sqlDate(ms){return new Date(ms).toISOString().replace('T',' ').replace('Z','')}
function bearer(req){const h=String(req?.headers?.authorization||'');return h.startsWith('Bearer ')?h.slice(7).trim():null}
function invalid(){return Object.assign(new Error('Email ou mot de passe incorrect.'),{status:401,code:'LOCAL_AUTH_INVALID'})}

function provision({userId,name,email,password}){
  const mail=normalizeEmail(email),pass=String(password||'');
  if(name)db.prepare(`UPDATE users SET name=?,active=1 WHERE id=?`).run(String(name).trim(),userId);
  if(mail)db.prepare(`UPDATE users SET email=?,active=1 WHERE id=?`).run(mail,userId);
  if(!mail||!pass)return;
  if(pass.length<12)throw new Error(`Mot de passe pilote trop court pour ${userId} : 12 caractères minimum.`);
  const salt=randomBytes(16).toString('hex'),hash=hashPassword(pass,salt);
  db.prepare(`INSERT INTO local_credentials(user_id,password_hash,password_salt,failed_attempts,locked_until,updated_at)
    VALUES(?,?,?,0,NULL,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,password_salt=excluded.password_salt,failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP`)
    .run(userId,hash,salt);
}

provision({userId:'u-vf',name:'Ayoub Nachiti',email:process.env.STOREOPS_VF_MANAGER_EMAIL,password:process.env.STOREOPS_VF_MANAGER_PASSWORD});
provision({userId:'u-ops',name:process.env.STOREOPS_OPS_DIRECTOR_NAME||'Mourad',email:process.env.STOREOPS_OPS_DIRECTOR_EMAIL,password:process.env.STOREOPS_OPS_DIRECTOR_PASSWORD});

function verifyCredentials(email,password){
  const mail=normalizeEmail(email),pass=String(password||'');if(!mail||!pass)throw invalid();
  const row=db.prepare(`SELECT u.*,c.password_hash,c.password_salt,c.failed_attempts,c.locked_until FROM users u JOIN local_credentials c ON c.user_id=u.id WHERE lower(u.email)=? AND u.active=1`).get(mail);
  if(!row){scryptSync(pass,Buffer.alloc(16,1),64);throw invalid()}
  if(row.locked_until&&new Date(row.locked_until+'Z').getTime()>Date.now())throw Object.assign(new Error('Trop de tentatives. Réessaie dans quelques minutes.'),{status:429,code:'LOCAL_AUTH_LOCKED'});
  const candidate=hashPassword(pass,row.password_salt);
  if(!secureEqual(candidate,row.password_hash)){
    const attempts=Number(row.failed_attempts||0)+1;
    if(attempts>=LOCK_AFTER)db.prepare(`UPDATE local_credentials SET failed_attempts=0,locked_until=? WHERE user_id=?`).run(sqlDate(Date.now()+LOCK_MINUTES*60_000),row.id);
    else db.prepare(`UPDATE local_credentials SET failed_attempts=? WHERE user_id=?`).run(attempts,row.id);
    throw invalid();
  }
  db.prepare(`UPDATE local_credentials SET failed_attempts=0,locked_until=NULL WHERE user_id=?`).run(row.id);
  const {password_hash,password_salt,failed_attempts,locked_until,...user}=row;return user;
}

export function createLocalSession({email,password}){
  const user=verifyCredentials(email,password),token=randomBytes(32).toString('base64url'),id=`locals_${randomBytes(12).toString('hex')}`,expiresAt=sqlDate(Date.now()+SESSION_HOURS*60*60_000);
  db.prepare(`DELETE FROM local_sessions WHERE expires_at<=CURRENT_TIMESTAMP`).run();
  db.prepare(`INSERT INTO local_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)`).run(id,user.id,hashToken(token),expiresAt);
  return{token,expiresAt,user:{id:user.id,name:user.name,email:user.email,role:user.role,store_id:user.store_id}};
}

export function localSessionFromRequest(req){
  const token=bearer(req);if(!token)throw Object.assign(new Error('Authentification requise'),{status:401,code:'LOCAL_SESSION_REQUIRED'});
  const row=db.prepare(`SELECT s.id session_id,s.expires_at,u.* FROM local_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.active=1`).get(hashToken(token));
  if(!row)throw Object.assign(new Error('Session expirée. Reconnectez-vous.'),{status:401,code:'LOCAL_SESSION_EXPIRED'});
  db.prepare(`UPDATE local_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?`).run(row.session_id);
  const {session_id,expires_at,...user}=row;return user;
}

export function revokeLocalSession(req){const token=bearer(req);if(token)db.prepare(`DELETE FROM local_sessions WHERE token_hash=?`).run(hashToken(token));return{ok:true}}

export function localAuthStatus(){
  const rows=db.prepare(`SELECT u.id,u.name,u.email,u.role,u.store_id,c.updated_at FROM users u JOIN local_credentials c ON c.user_id=u.id WHERE u.active=1 ORDER BY u.role,u.name`).all();
  return{configured:rows.length>0,accounts:rows.map(x=>({id:x.id,name:x.name,email:x.email,role:x.role,store_id:x.store_id,updated_at:x.updated_at})),sessionHours:SESSION_HOURS};
}

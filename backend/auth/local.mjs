import { randomBytes,scryptSync,timingSafeEqual } from 'node:crypto';
import { db } from '../db.mjs';

const LOCK_AFTER=7;
const LOCK_MINUTES=15;

// Local pilot credentials are stored only as salted scrypt hashes.
db.exec(`
CREATE TABLE IF NOT EXISTS local_credentials(
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function hashPassword(password,salt){
  return scryptSync(String(password),Buffer.from(salt,'hex'),64).toString('hex');
}
function secureEqual(a,b){
  const x=Buffer.from(String(a||''),'hex'),y=Buffer.from(String(b||''),'hex');
  return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);
}
function normalizeEmail(v){return String(v||'').trim().toLowerCase()}

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

provision({
  userId:'u-vf',
  name:'Ayoub Nachiti',
  email:process.env.STOREOPS_VF_MANAGER_EMAIL,
  password:process.env.STOREOPS_VF_MANAGER_PASSWORD
});
provision({
  userId:'u-ops',
  name:process.env.STOREOPS_OPS_DIRECTOR_NAME||'Mourad',
  email:process.env.STOREOPS_OPS_DIRECTOR_EMAIL,
  password:process.env.STOREOPS_OPS_DIRECTOR_PASSWORD
});

function basicCredentials(req){
  const h=String(req?.headers?.authorization||'');
  if(!h.startsWith('Basic '))return null;
  try{
    const raw=Buffer.from(h.slice(6).trim(),'base64').toString('utf8'),i=raw.indexOf(':');
    if(i<1)return null;
    return{email:normalizeEmail(raw.slice(0,i)),password:raw.slice(i+1)};
  }catch{return null}
}
function invalid(){return Object.assign(new Error('Email ou mot de passe incorrect.'),{status:401,code:'LOCAL_AUTH_INVALID'})}

export function verifyLocalRequest(req){
  const cred=basicCredentials(req);if(!cred?.email||!cred.password)throw invalid();
  const row=db.prepare(`SELECT u.*,c.password_hash,c.password_salt,c.failed_attempts,c.locked_until
    FROM users u JOIN local_credentials c ON c.user_id=u.id
    WHERE lower(u.email)=? AND u.active=1`).get(cred.email);
  if(!row){
    // Constant-ish work to reduce trivial account enumeration timing differences.
    scryptSync(cred.password,Buffer.alloc(16,1),64);
    throw invalid();
  }
  if(row.locked_until&&new Date(row.locked_until+'Z').getTime()>Date.now())throw Object.assign(new Error('Trop de tentatives. Réessaie dans quelques minutes.'),{status:429,code:'LOCAL_AUTH_LOCKED'});
  const candidate=hashPassword(cred.password,row.password_salt);
  if(!secureEqual(candidate,row.password_hash)){
    const attempts=Number(row.failed_attempts||0)+1;
    if(attempts>=LOCK_AFTER){
      const until=new Date(Date.now()+LOCK_MINUTES*60_000).toISOString().replace('T',' ').replace('Z','');
      db.prepare(`UPDATE local_credentials SET failed_attempts=0,locked_until=? WHERE user_id=?`).run(until,row.id);
    }else db.prepare(`UPDATE local_credentials SET failed_attempts=? WHERE user_id=?`).run(attempts,row.id);
    throw invalid();
  }
  db.prepare(`UPDATE local_credentials SET failed_attempts=0,locked_until=NULL WHERE user_id=?`).run(row.id);
  const {password_hash,password_salt,failed_attempts,locked_until,...user}=row;
  return user;
}

export function localAuthStatus(){
  const rows=db.prepare(`SELECT u.id,u.name,u.email,u.role,u.store_id,c.updated_at FROM users u JOIN local_credentials c ON c.user_id=u.id WHERE u.active=1 ORDER BY u.role,u.name`).all();
  return{configured:rows.length>0,accounts:rows.map(x=>({id:x.id,name:x.name,email:x.email,role:x.role,store_id:x.store_id,updated_at:x.updated_at}))};
}

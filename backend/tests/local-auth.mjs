process.env.STOREOPS_DB=process.env.STOREOPS_DB||'/tmp/storeops-local-auth-ci.db';
process.env.AUTH_MODE='local';
process.env.STOREOPS_VF_MANAGER_EMAIL='ayoub.test@oneretail.ma';
process.env.STOREOPS_VF_MANAGER_PASSWORD='AyoubPilot-2026-X7';
process.env.STOREOPS_OPS_DIRECTOR_NAME='Mourad';
process.env.STOREOPS_OPS_DIRECTOR_EMAIL='mourad.test@oneretail.ma';
process.env.STOREOPS_OPS_DIRECTOR_PASSWORD='MouradPilot-2026-Z9';

const {sessionFromRequest}=await import('../auth/session.mjs');
const {db}=await import('../db.mjs');
function ok(v,m){if(!v)throw new Error(m)}
const basic=(email,password)=>'Basic '+Buffer.from(`${email}:${password}`,'utf8').toString('base64');

let s=await sessionFromRequest({headers:{authorization:basic('ayoub.test@oneretail.ma','AyoubPilot-2026-X7')}});
ok(s.mode==='local'&&s.user.id==='u-vf'&&s.user.role==='store_manager'&&s.user.store_id==='val-fleuri','Ayoub local login failed');
s=await sessionFromRequest({headers:{authorization:basic('mourad.test@oneretail.ma','MouradPilot-2026-Z9')}});
ok(s.user.id==='u-ops'&&s.user.role==='ops_director'&&s.user.name==='Mourad','Mourad director local login failed');
let denied=false;try{await sessionFromRequest({headers:{authorization:basic('ayoub.test@oneretail.ma','wrong-password')}})}catch(e){denied=e.status===401&&e.code==='LOCAL_AUTH_INVALID'}ok(denied,'wrong local password must be rejected');
const cols=db.prepare(`PRAGMA table_info(local_credentials)`).all().map(x=>x.name);
ok(cols.includes('password_hash')&&cols.includes('password_salt')&&!cols.includes('password'),'local credentials must not store plaintext password');
const raw=db.prepare(`SELECT * FROM local_credentials WHERE user_id='u-vf'`).get();
ok(raw.password_hash&&!raw.password_hash.includes('AyoubPilot'),'password hash was not stored safely');
console.log('StoreOps V1.41 local pilot authentication tests passed');

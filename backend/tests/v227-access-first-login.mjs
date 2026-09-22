import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v227-access-login.db';

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {createAccessAccount}=await import('../services/access-management.mjs');
const {userByClaims}=await import('../auth/session.mjs');
const {canAccessStore,canManageStore}=await import('../services/permissions.mjs');

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
const account=createAccessAccount({actor:admin,name:'Oussama Test',emailAddress:'oussama.test@oneretail.ma',profileCode:'MANAGEMENT_CONTROL',identityProvider:'ENTRA'});
assert.equal(account.profileCode,'MANAGEMENT_CONTROL');
assert.equal(account.scope,'NETWORK');
assert.equal(account.active,true);
assert.equal(account.entraOid,null);

const resolved=userByClaims({oid:'entra-oussama-001',preferred_username:'OUSSAMA.TEST@ONERETAIL.MA'});
assert(resolved);
assert.equal(resolved.id,account.id);
assert.equal(resolved.entra_oid,'entra-oussama-001');
assert.equal(resolved.permissions_profile,'management_control');
assert.equal(canAccessStore(resolved,'val-fleuri'),true);
assert.equal(canAccessStore(resolved,'trefle'),true);
assert.equal(canManageStore(resolved,'val-fleuri'),false);
assert.equal(canManageStore(resolved,'trefle'),false);

console.log('V2.27 Admin create -> first Entra login management control: OK');

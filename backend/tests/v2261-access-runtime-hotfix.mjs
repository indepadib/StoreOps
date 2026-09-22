import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v2261-access-runtime.db';

const {db}=await import('../db.mjs');
const {findUserByClaims}=await import('../auth/session.mjs');

db.prepare(`INSERT OR REPLACE INTO users(id,name,email,entra_oid,role,store_id,active,dynamics_email,permissions_profile,identity_provider,identity_subject)
VALUES('u-oid-test','Oussama Test',NULL,NULL,'employee','val-fleuri',1,NULL,'store_user','ENTRA','oid-2261')`).run();
let u=findUserByClaims({oid:'oid-2261'},{activeOnly:true});
assert.equal(u?.id,'u-oid-test','identity_subject must authorize Entra account');

db.prepare(`UPDATE users SET active=0 WHERE id='u-oid-test'`).run();
assert.equal(findUserByClaims({oid:'oid-2261'},{activeOnly:true}),null);
assert.equal(findUserByClaims({oid:'oid-2261'},{activeOnly:false})?.id,'u-oid-test');

db.prepare(`INSERT OR REPLACE INTO users(id,name,email,entra_oid,role,store_id,active,permissions_profile)
VALUES('u-amine-hotfix','Amine Chibani','amine.hotfix@example.invalid',NULL,'store_manager','trefle',1,NULL)`).run();
await import('../services/access-management.mjs');
const amine=db.prepare(`SELECT role,store_id,permissions_profile FROM users WHERE id='u-amine-hotfix'`).get();
assert.equal(amine.role,'employee');
assert.equal(amine.store_id,null);
assert.equal(amine.permissions_profile,'quality_audit');

const {canAccessStore,canManageDlc,canManageQuality,canManageStore}=await import('../services/permissions.mjs');
const quality={id:'u-amine-hotfix',role:amine.role,store_id:amine.store_id,permissions_profile:amine.permissions_profile};
for(const storeId of ['val-fleuri','trefle']){
 assert.equal(canAccessStore(quality,storeId),true);
 assert.equal(canManageDlc(quality,storeId),true);
 assert.equal(canManageQuality(quality,storeId),true);
 assert.equal(canManageStore(quality,storeId),false);
}

const {readFileSync}=await import('node:fs');
const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const staffing=readFileSync(new URL('../../frontend/js/pages/staffing.js',import.meta.url),'utf8');
const accessUi=readFileSync(new URL('../../frontend/js/admin-studio-access.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../../frontend/js/api.js',import.meta.url),'utf8');

assert.match(app,/document\.querySelectorAll\('#nav button\[data-page\],#managerNav button\[data-page\],#qualityAuditNav button\[data-page\],#developmentNavBar button\[data-page\]'\)\.forEach/);
assert.doesNotMatch(app,/\$\('#nav button\[data-page\],[^\n]+\.forEach/);
assert.match(staffing,/rawMetrics=d\.metrics\|\|data\.summary\|\|\{\}/);
assert.match(accessUi,/body:b/);
assert.match(api,/typeof options\.body==='object'[\s\S]*JSON\.stringify\(options\.body\)/);

console.log('V2.26.1 access/runtime hotfix contract OK');
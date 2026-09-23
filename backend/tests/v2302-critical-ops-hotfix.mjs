import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-v2302-hotfix-${process.pid}.db`;

const appSource=fs.readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const openingSource=fs.readFileSync(new URL('../services/opening-api.mjs',import.meta.url),'utf8');
assert.match(appSource,/\$\$\('#nav button\[data-page\],#managerNav button\[data-page\],#qualityAuditNav button\[data-page\],#developmentNavBar button\[data-page\]'\)\.forEach/);
assert.doesNotMatch(openingSource,/force\|\|!opening/);
assert.doesNotMatch(openingSource,/force\|\|!day/);
assert.match(openingSource,/CASH_OPENING_NOT_SYNCED/);
assert.match(openingSource,/STAFFING_NOT_SYNCED/);

const {db}=await import('../db.mjs');
const {updateAccessAccount}=await import('../services/access-management.mjs');
const {canAccessStore,canManageQuality,canManageDlc,canManageStore}=await import('../services/permissions.mjs');

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
assert(admin,'u-admin seed required');
const tr=db.prepare(`SELECT * FROM users WHERE id='u-tr'`).get();
assert(tr,'u-tr seed required');

const updated=updateAccessAccount({
 actor:admin,
 userId:'u-tr',
 name:tr.name||'Responsable Trèfle',
 emailAddress:'',
 profileCode:'STORE_MANAGER',
 storeId:'trefle',
 linkedEmployeeId:null,
 identityProvider:'ENTRA',
 identitySubject:null,
 note:'legacy seed edit regression'
});
assert.equal(updated.storeId,'trefle');
assert.equal(updated.profileCode,'STORE_MANAGER');

const quality={id:'quality-test',role:'employee',store_id:null,permissions_profile:'quality_audit'};
for(const storeId of ['val-fleuri','trefle']){
 assert.equal(canAccessStore(quality,storeId),true);
 assert.equal(canManageQuality(quality,storeId),true);
 assert.equal(canManageDlc(quality,storeId),true);
 assert.equal(canManageStore(quality,storeId),false);
}

console.log('V2.30.2 critical ops hotfix contract: OK');

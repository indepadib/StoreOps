import assert from 'node:assert/strict';
process.env.STOREOPS_DB=`/tmp/storeops-v251-access-${process.pid}.db`;

const {db}=await import('../db.mjs');
const userCols=db.prepare(`PRAGMA table_info(users)`).all();
if(!userCols.some(x=>x.name==='permissions_profile'))db.exec(`ALTER TABLE users ADD COLUMN permissions_profile TEXT NULL`);
db.prepare(`UPDATE users SET name='Amine Chibani',role='store_manager',store_id='trefle',permissions_profile=NULL,active=1 WHERE id='u-tr'`).run();
await import('../services/pilot-profile.mjs');
const amine=db.prepare(`SELECT role,store_id,permissions_profile,active FROM users WHERE id='u-tr'`).get();
assert.equal(amine.role,'employee');
assert.equal(amine.store_id,null);
assert.equal(amine.permissions_profile,'quality_audit');
assert.equal(Number(amine.active),1);
const {findStoreOpsUserFromEntraClaims}=await import('../auth/identity.mjs');
const {accessProfiles}=await import('../services/access-management.mjs');
const {canAccessStore,canManageStore,canManageQuality,canManageDlc,isControlling,isExecutive}=await import('../services/permissions.mjs');
const {readFileSync}=await import('node:fs');

db.prepare(`DELETE FROM users WHERE id='u-v251-entra'`).run();
db.prepare(`INSERT INTO users(id,name,email,entra_oid,role,store_id,active,dynamics_email,permissions_profile,identity_provider,identity_subject)
 VALUES('u-v251-entra','Test Entra','new.user@oneretail.ma',NULL,'employee',NULL,1,NULL,'controlling','ENTRA',NULL)`).run();

let match=findStoreOpsUserFromEntraClaims({preferred_username:'NEW.USER@ONERETAIL.MA',oid:'oid-v251'},{bind:false});
assert.equal(match.user?.id,'u-v251-entra');
assert.equal(match.matchedBy,'EMAIL_OR_UPN');
assert.equal(db.prepare(`SELECT entra_oid FROM users WHERE id='u-v251-entra'`).get().entra_oid,null,'read-only bootstrap must not mutate identity');

match=findStoreOpsUserFromEntraClaims({email:'new.user@oneretail.ma',oid:'oid-v251'},{bind:true});
assert.equal(match.user?.id,'u-v251-entra');
const linked=db.prepare(`SELECT entra_oid,identity_subject FROM users WHERE id='u-v251-entra'`).get();
assert.equal(linked.entra_oid,'oid-v251');
assert.equal(linked.identity_subject,'oid-v251');

const controller={id:'ctrl',role:'employee',store_id:null,permissions_profile:'controlling'};
const executive={id:'exec',role:'employee',store_id:null,permissions_profile:'executive'};
const quality={id:'qa',role:'employee',store_id:null,permissions_profile:'quality_audit'};
const amineUser={id:'u-tr',role:amine.role,store_id:amine.store_id,permissions_profile:amine.permissions_profile};
for(const user of [controller,executive,quality]){
 assert.equal(canAccessStore(user,'val-fleuri'),true);
 assert.equal(canAccessStore(user,'trefle'),true);
}
assert.equal(isControlling(controller),true);
assert.equal(isExecutive(executive),true);
assert.equal(canManageStore(controller,'val-fleuri'),false);
assert.equal(canManageStore(executive,'trefle'),false);
assert.equal(canManageQuality(quality,'val-fleuri'),true);
assert.equal(canManageQuality(quality,'trefle'),true);
assert.equal(canManageDlc(quality,'val-fleuri'),true);
assert.equal(canManageStore(quality,'val-fleuri'),false);
assert.equal(canManageQuality(amineUser,'val-fleuri'),true);
assert.equal(canManageQuality(amineUser,'trefle'),true);
assert.equal(canManageDlc(amineUser,'val-fleuri'),true);
assert.equal(canManageDlc(amineUser,'trefle'),true);
assert.equal(canManageStore(amineUser,'trefle'),false);

const profiles=accessProfiles().map(x=>x.code);
for(const code of ['QUALITY_AUDIT','CONTROLLING','EXECUTIVE'])assert(profiles.includes(code),code);

const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../../frontend/sw.js',import.meta.url),'utf8');
const accessUi=readFileSync(new URL('../../frontend/js/admin-studio-access.js',import.meta.url),'utf8');
const cash=readFileSync(new URL('../../frontend/js/pages/cash-opening.js',import.meta.url),'utf8');
const staffing=readFileSync(new URL('../../frontend/js/pages/staffing.js',import.meta.url),'utf8');
const headers=readFileSync(new URL('../../frontend/_headers',import.meta.url),'utf8');

assert.match(app,/document\.querySelectorAll\('#nav button\[data-page\]/);
assert.doesNotMatch(app,/\$\([^)]*\)\.forEach/,'$() returns one element and must never be used with forEach');
assert.match(app,/\$\$\('\.page'\)\.forEach/);
assert.match(index,/id="controllingNav"/);
assert.match(index,/id="executiveNav"/);
assert.match(index,/v=2251/);
assert.match(sw,/registration\.unregister/);
assert.match(sw,/client\.navigate/);
assert.match(headers,/\/index\.html[\s\S]*Cache-Control: no-store/);
assert.match(accessUi,/premier login Microsoft/i);
assert.match(cash,/data-till-code/);
assert.match(cash,/submitCashOpeningCheck/);
assert.match(cash,/retry:false/);
assert.match(staffing,/baseMetrics=/);
assert.match(staffing,/rawMetrics=d\.metrics\|\|data\.summary\|\|\{\}/);

console.log('V2.25.1 access, stale-cache and runtime stability contract: OK');

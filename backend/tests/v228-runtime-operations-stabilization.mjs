import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v228-stabilization.db';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

const app=read('frontend/js/app.js');
const api=read('frontend/js/api.js');
const staffing=read('frontend/js/pages/staffing.js');
const cash=read('frontend/js/pages/cash-opening.js');
const receipts=read('frontend/js/pages/receipts.js');
const inventory=read('frontend/js/pages/inventory.js');
const accessUi=read('frontend/js/admin-studio-access.js');
const openingApi=read('backend/services/opening-api.mjs');
const netlify=read('netlify.toml');
const pwa=read('frontend/js/pwa.js');
const authEntry=read('frontend/js/auth-entry.js');

assert.match(app,/document\.querySelectorAll\('#nav button\[data-page\],#managerNav button\[data-page\],#qualityAuditNav button\[data-page\],#developmentNavBar button\[data-page\]'\)\.forEach/);
assert.doesNotMatch(app,/\$\('#nav button\[data-page\],[^\n]+\.forEach/);
assert.match(api,/typeof options\.body==='object'[\s\S]*JSON\.stringify\(options\.body\)/);
assert.match(staffing,/if\(!d\)/);
assert.match(staffing,/rawMetrics=d\.metrics\|\|data\.summary\|\|\{\}/);
assert.match(cash,/\/api\/stores\/\$\{app\.storeId\}\/cash-opening\/check/);
assert.doesNotMatch(cash,/\/api\/cash-opening\/lines\/\$\{[^}]+\}\/check/);
assert.match(openingApi,/CASH_OPENING_LINE_STALE/);
assert.match(receipts,/receipts\/po/);
assert.match(receipts,/receipts\/to/);
assert.match(receipts,/data-receipt-type="PO"/);
assert.match(receipts,/data-receipt-type="TO"/);
assert.match(inventory,/Compter maintenant/);
assert.match(inventory,/Inventaires en cours/);
assert.match(inventory,/Historique & export/);
assert.match(inventory,/storeops_inventory_entry_mode/);
assert.match(accessUi,/Création autonome/);
assert.match(accessUi,/StoreOps associe automatiquement son Object ID/);
assert.match(authEntry,/BUILD_LABEL='2\.29\.0'/);
assert.match(netlify,/for = "\/js\/\*"[\s\S]*Cache-Control = "no-cache, max-age=0, must-revalidate"/);
assert.match(netlify,/for = "\/\*\.css"[\s\S]*Cache-Control = "no-cache, max-age=0, must-revalidate"/);
assert.doesNotMatch(pwa,/serviceWorker\.register/);

const {db}=await import('../db.mjs');
const {createAccessAccount,updateAccessAccount,setAccessAccountActive}=await import('../services/access-management.mjs');
const {findUserByClaims}=await import('../auth/session.mjs');
const {canAccessStore,canManageDlc,canManageQuality,canManageStore}=await import('../services/permissions.mjs');

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
assert(admin,'platform admin required');
const email='v228.quality@example.invalid';
const account=createAccessAccount({actor:admin,name:'Qualité V228',emailAddress:email,profileCode:'QUALITY_AUDIT',identityProvider:'ENTRA'});
assert.equal(account.profileCode,'QUALITY_AUDIT');
assert.equal(account.scope,'NETWORK');
assert.equal(account.active,true);
assert.equal(findUserByClaims({preferred_username:email},{activeOnly:true})?.id,account.id);

let row=db.prepare(`SELECT * FROM users WHERE id=?`).get(account.id);
for(const storeId of ['val-fleuri','trefle']){
 assert.equal(canAccessStore(row,storeId),true);
 assert.equal(canManageDlc(row,storeId),true);
 assert.equal(canManageQuality(row,storeId),true);
 assert.equal(canManageStore(row,storeId),false);
}
const updated=updateAccessAccount({actor:admin,userId:account.id,name:'Qualité V228 MAJ',emailAddress:email,profileCode:'QUALITY_AUDIT',identityProvider:'ENTRA'});
assert.equal(updated.name,'Qualité V228 MAJ');
assert.equal(setAccessAccountActive({actor:admin,userId:account.id,active:false}).active,false);
assert.equal(setAccessAccountActive({actor:admin,userId:account.id,active:true}).active,true);

db.prepare(`INSERT OR REPLACE INTO users(id,name,email,role,store_id,active,permissions_profile) VALUES('u-amine-v228','Amine Chibani','amine.v228@example.invalid','store_manager','trefle',1,NULL)`).run();
const accessModule=await import('../services/access-management.mjs?amine-v228');
void accessModule;
row=db.prepare(`SELECT * FROM users WHERE id='u-amine-v228'`).get();
assert.equal(row.role,'employee');
assert.equal(row.store_id,null);
assert.equal(row.permissions_profile,'quality_audit');

console.log('V2.28 runtime & operations stabilization contract: OK');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB='/tmp/storeops-v227-ops-regressions.db';

const {db}=await import('../db.mjs');
const access=await import('../services/access-management.mjs');
const perms=await import('../services/permissions.mjs');

db.prepare(`UPDATE users SET name='Amine Chibani',role='store_manager',store_id='trefle',permissions_profile=NULL WHERE id='u-tr'`).run();
access.migrateLegacyQualityPilotAccount();
const amine=db.prepare(`SELECT * FROM users WHERE id='u-tr'`).get();
assert.equal(amine.name,'Amine Chibani');
assert.equal(amine.role,'employee');
assert.equal(amine.store_id,null);
assert.equal(amine.permissions_profile,'quality_audit');
assert.equal(perms.canAccessStore(amine,'val-fleuri'),true);
assert.equal(perms.canAccessStore(amine,'trefle'),true);
assert.equal(perms.canManageDlc(amine,'val-fleuri'),true);
assert.equal(perms.canManageDlc(amine,'trefle'),true);
assert.equal(perms.canManageQuality(amine,'val-fleuri'),true);
assert.equal(perms.canManageQuality(amine,'trefle'),true);
assert.equal(perms.canManageStore(amine,'val-fleuri'),false);

const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const staffing=readFileSync(new URL('../../frontend/js/pages/staffing.js',import.meta.url),'utf8');
const cashOpening=readFileSync(new URL('../../frontend/js/pages/cash-opening.js',import.meta.url),'utf8');
const accessUi=readFileSync(new URL('../../frontend/js/admin-studio-access.js',import.meta.url),'utf8');
const receipts=readFileSync(new URL('../../frontend/js/pages/receipts.js',import.meta.url),'utf8');

assert.match(app,/document\.querySelectorAll\('#nav button\[data-page\],#managerNav button\[data-page\],#qualityAuditNav button\[data-page\],#developmentNavBar button\[data-page\]'\)\.forEach/);
assert.doesNotMatch(app,/\$\('#nav button\[data-page\],#managerNav button\[data-page\],#qualityAuditNav button\[data-page\],#developmentNavBar button\[data-page\]'\)\.forEach/);

assert.match(staffing,/if\(!d\)/,'Staffing must handle a missing day before reading metrics');
assert.match(staffing,/d\.metrics\|\|data\.summary\|\|\{\}/);

assert.match(cashOpening,/CASH_OPENING_LINE_STALE[\\s\\S]*?e\\.status===404/);
assert.match(cashOpening,/cash-opening\/sync/);

assert.match(accessUi,/body:b/,'Admin Access must pass an object to api() so JSON is serialized exactly once');
assert.doesNotMatch(accessUi,/body:JSON\.stringify\(b\)/);

assert.match(receipts,/data-receipt-type="PO"/);
assert.match(receipts,/data-receipt-type="TO"/);
assert.match(receipts,/receipts\/po/);
assert.match(receipts,/receipts\/to/);

console.log('V2.27 operational regressions contract: OK');

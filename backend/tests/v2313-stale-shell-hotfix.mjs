import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

const app=read('frontend/js/app.js');
const staffing=read('frontend/js/pages/staffing.js');
const cash=read('frontend/js/pages/cash-opening.js');
const access=read('frontend/js/admin-studio-access.js');
const permissions=read('backend/services/permissions.mjs');
const accessApi=read('backend/services/access-management-api.mjs');
const sw=read('frontend/sw.js');
const boot=read('frontend/js/boot-rescue.js');
const repair=read('frontend/repair.html');
const index=read('frontend/index.html');
const auth=read('frontend/js/auth-entry.js');

// The exact login crash reported from the old v2211 shell must never exist.
assert.doesNotMatch(app,/\$\('#nav button\[data-page\],[^\n]+\.forEach/);
assert.match(app,/document\.querySelectorAll\('#nav button\[data-page\],#managerNav button\[data-page\],#qualityAuditNav button\[data-page\],#developmentNavBar button\[data-page\]'\)\.forEach/);

// Staffing must survive null/absent metrics.
assert.match(staffing,/d\.metrics\|\|data\.summary\|\|\{\}/);
assert.match(staffing,/const baseMetrics=\{pending:0,present:0/);

// Cash opening must use the current store-level check API, not the removed line route.
assert.match(cash,/\/cash-opening\/check/);
assert.doesNotMatch(cash,/\/cash-opening\/lines\/\$\{[^}]+\}\/check/);

// Access editor sends an object; backend still tolerates a legacy double-encoded body.
assert.match(access,/body:b/);
assert.match(accessApi,/typeof value==='string'&&value\.trim\(\)\.startsWith\('\{'\)/);

// Quality/Audit is network-wide and can create/modify DLC + quality controls.
assert.match(permissions,/user\.role==='ops_director'\|\|isQualityAudit\(user\)/);
assert.match(permissions,/canManageDlc/);
assert.match(permissions,/canManageQuality/);

// New recovery generation: stale ?v=2211 assets cannot win offline.
assert.match(sw,/const CACHE='storeops-shell-v2\.31\.3'/);
assert.match(sw,/const BUILD='2313'/);
assert.match(sw,/requestedBuild&&requestedBuild!==BUILD/);
assert.match(sw,/cache\.match\(canonical\)/);
assert.match(sw,/client\.navigate/);
assert.match(boot,/storeops_boot_rescue_v2313/);
assert.match(repair,/storeops_clean=2313/);

// The HTML/bootstrap generation must be coherent.
assert.match(index,/v2\.31\.3/);
assert.match(index,/auth-entry\.js\?v=2313/);
assert.match(auth,/const BUILD='2313'/);
assert.match(auth,/const BUILD_LABEL='2\.31\.3'/);

console.log('V2.31.3 stale-shell + runtime regression contract: OK');

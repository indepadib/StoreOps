import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const access=readFileSync(new URL('../../frontend/js/admin-studio-access.js',import.meta.url),'utf8');
const staffing=readFileSync(new URL('../../frontend/js/pages/staffing.js',import.meta.url),'utf8');
const workforce=readFileSync(new URL('../services/workforce-api.mjs',import.meta.url),'utf8');
const readiness=readFileSync(new URL('../services/readiness-api.mjs',import.meta.url),'utf8');

assert.match(access,/body:JSON\.stringify\(b\)/,'access save must serialize JSON');
assert.match(access,/body:JSON\.stringify\(\{active:!a\.active\}\)/,'access toggle must serialize JSON');
assert.match(staffing,/if\(!d\)/,'staffing UI must handle missing day');
assert.match(staffing,/staffing\/sync/,'staffing UI must offer explicit sync');
assert.match(workforce,/handleReadinessApi/,'readiness routes must be wired into API');
assert.match(readiness,/\/api\/cash-opening\/lines\/:lineId\/check/);
assert.match(readiness,/\/api\/staffing\/lines\/:lineId\/attendance/);
assert.match(readiness,/canManageStore/);
console.log('V2.24.2 operational hotfix static contract OK');

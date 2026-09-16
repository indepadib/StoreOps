import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v197-mobile-instant-today.db';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

const today=read('frontend/js/pages/today.js');
const mobile=read('frontend/mobile-v197.css');
const enhancements=read('frontend/js/enhancements-entry.js');
const auth=read('frontend/js/auth-entry.js');
const boot=read('frontend/js/boot-classic.js');
const build=read('frontend/netlify-build.sh');
const fastService=read('backend/services/manager-home-fast.mjs');

assert.match(today,/\/manager-home-fast/,'Director Today must use the local fast snapshot in production');
assert.doesNotMatch(today,/\/manager-inbox-batch/,'Director initial Today must not wait for the external enrichment bundle');
assert.match(today,/dataset\.httpFanout/,'Today must expose HTTP fanout diagnostics');
assert.match(today,/dataset\.externalCalls/,'Today must expose external-call diagnostics');
assert.match(fastService,/externalCalls:0,httpFanout:0/,'local fast snapshot must guarantee zero connector fanout');
assert.match(fastService,/maintenance/,'local fast snapshot must include maintenance summary');
assert.match(fastService,/dueToday/,'local fast snapshot must include receipt due-today summary');

assert.match(mobile,/body\.director-experience/,'mobile director shell must be scoped to director experience');
assert.match(mobile,/position:fixed!important/,'director mobile navigation must be fixed');
assert.match(mobile,/bottom:0/,'director mobile navigation must stay at the bottom');
assert.match(mobile,/safe-area-inset-bottom/,'iPhone safe area must be respected');
assert.match(mobile,/#refreshBtn[\s\S]*46px/,'refresh control must be compact on mobile');
assert.match(mobile,/#logoutBtn[\s\S]*46px/,'logout control must be compact on mobile');
assert.match(mobile,/attr\(data-mobile-label\)/,'mobile tabs must use explicit compact labels');
assert.doesNotMatch(mobile,/overflow-x:auto/,'director mobile nav must not require horizontal scrolling');

assert.match(enhancements,/document\.body\.classList\.add\('director-experience'\)/,'director experience class must be installed');
assert.match(enhancements,/nav\.classList\.add\('ux191-network-nav'\)/,'director navigation contract must be installed');
assert.match(enhancements,/mobile-v197\.css\?v=\$\{BUILD\}/,'mobile stylesheet must share release cache key');
assert.match(enhancements,/setMobileLabel\(development,'Dév\.'/,'Development tab must fit narrow phones');
assert.match(enhancements,/clearOperationsActive/,'Operations active state must be cleared when returning to canonical tabs');

assert.match(auth,/const BUILD='1970'/,'auth graph must use V1.97 cache key');
assert.match(auth,/BUILD_LABEL='1\.97\.0'/,'auth release label must be V1.97.0');
assert.match(boot,/BUILD='1\.97\.0'/,'classic boot release label must be V1.97.0');
assert.match(build,/STOREOPS_RELEASE_BUILD:-1970/,'Netlify build must publish V1.97 assets coherently');

const {db}=await import('../db.mjs');
const {getManagerHomeFast}=await import('../services/manager-home-fast.mjs');
const businessDate='2099-01-02';
db.prepare(`DELETE FROM store_days WHERE store_id='val-fleuri' AND business_date=?`).run(businessDate);
const snap=getManagerHomeFast('val-fleuri',businessDate,{force:true});
assert.equal(snap.status,'READY');
assert.equal(snap.source,'STOREOPS_LOCAL');
assert.equal(snap.diagnostics.externalCalls,0);
assert.equal(snap.diagnostics.httpFanout,0);
assert.equal(snap.diagnostics.readOnly,true);
assert.ok(snap.maintenance,'fast snapshot must include maintenance');
assert.equal(typeof snap.maintenance.openCount,'number');
assert.ok(snap.receipts,'fast snapshot must include receipts');
assert.equal(typeof snap.receipts.dueToday,'number');

console.log('V1.97 mobile + instant Today contract: OK');

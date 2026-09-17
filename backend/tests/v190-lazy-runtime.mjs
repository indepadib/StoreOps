import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const app=read('frontend/js/app.js');
const home=read('frontend/js/pages/manager-home.js');
const router=read('backend/services/business-pulse-api.mjs');

assert.match(app,/function lazy\(path\)/,'app runtime must have one module loader');
assert.match(app,/moduleCache=new Map\(\)/,'lazy modules must be cached after first use');
assert.match(app,/import\(path\)/,'page modules must use dynamic import');
assert.doesNotMatch(app,/^import\s+\{[^\n]+\}\s+from\s+'\.\/pages\//m,'app.js must not statically import operational pages');
assert.doesNotMatch(app,/^import\s+\{[^\n]+\}\s+from\s+'\.\/mock-/m,'production app bootstrap must not statically import showcase reset modules');
assert.match(app,/invoke\('\.\/pages\/manager-home\.js','renderManagerHome'\)/,'Today manager page must stay lazy');
assert.match(app,/invoke\('\.\/pages\/admin-studio\.js','renderAdminStudio'\)/,'Admin Studio must stay off the initial bundle');
assert.match(app,/invoke\('\.\/pages\/development\.js','renderDevelopment'\)/,'Development must stay off the initial bundle');
assert.match(app,/Promise\.all\(\[lazy\('\.\/pages\/process\.js'\),lazy\('\.\/custom-process-runs\.js'\)\]\)/,'opening/closing dependencies should load concurrently');

assert.match(home,/manager-home-fast/,'manager Today must render from fast local endpoint first');
assert.match(home,/manager-inbox-batch/,'manager Today must enrich from grouped inbox endpoint');
assert.match(router,/manager-home-fast/,'active backend router must expose manager fast endpoint');
assert.match(router,/manager-inbox-batch/,'active backend router must expose manager batch endpoint');

console.log('V1.90 lazy operational runtime contract OK');

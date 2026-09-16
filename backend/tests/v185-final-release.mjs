import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const boot=read('frontend/js/boot-classic.js');
const pwa=read('frontend/js/pwa.js');
const auth=read('frontend/js/auth-entry.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const home=read('frontend/js/pages/manager-home.js');
const bridge=read('netlify/functions/api.mts');

assert.match(boot,/BUILD='1\.85\.0'/,'classic boot must expose v1.85.0');
assert.match(boot,/storeops_runtime_cleaned_1850/,'legacy runtime cleanup must be version-scoped');
assert.match(boot,/localStorage\.getItem\(CLEAN_KEY\)/,'cleanup must not repeat on every page load');
assert.doesNotMatch(pwa,/getRegistrations\(/,'PWA enhancement must not unregister workers again');
assert.match(auth,/const BUILD='1850'/,'auth runtime must use final release cache key');
assert.match(auth,/BUILD_LABEL='1\.85\.0'/,'auth runtime must expose final release label');
assert.match(enhancements,/\?v=1850/,'deferred modules must use the same final release version');
assert.match(home,/function renderFast\(/,'Today must have a progressive first paint');
assert.match(home,/const inboxPromise=loadManagerInbox\(\)/,'detailed manager actions must load asynchronously');
assert.match(home,/api\(`\/api\/stores\/\$\{storeId\}\/dashboard`\)/,'Today must render from the lightweight dashboard while details load');
assert.match(home,/Promise\.all\(\[inboxPromise,pulsePromise\]\)/,'full Today enrichment must stay concurrent');
assert.match(bridge,/X-StoreOps-Bridge/,'final release must retain V1.84 bridge timing diagnostics');
assert.match(bridge,/read-fast/,'final release must retain fast read path');

console.log('V1.85 final release startup + progressive Today contract OK');

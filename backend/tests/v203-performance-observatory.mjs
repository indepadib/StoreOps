import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const api=read('frontend/js/api.js');
const auth=read('frontend/js/auth-entry.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const observatory=read('frontend/js/performance-observatory.js');

assert.match(auth,/BUILD='2030'/,'V2.03 runtime build must be explicit');
assert.match(auth,/BUILD_LABEL='2\.03\.0'/,'V2.03 runtime label missing');
assert.match(auth,/window\.STOREOPS_PERF/,'boot performance state missing');
assert.match(auth,/perf\.phases\.push/,'boot phases must be captured');
assert.match(auth,/perf\.readyAt/,'StoreOps ready timing missing');

assert.match(api,/function recordApi/,'API timing collector missing');
assert.match(api,/x-storeops-bridge/,'API collector must capture bridge mode');
assert.match(api,/x-storeops-fast-path/,'API collector must capture fast path');
assert.match(api,/server-timing/,'API collector must capture Server-Timing');
assert.match(api,/split\('\?'\)\[0\]/,'API diagnostics must strip query strings');
assert.match(api,/perf\.api\.length>50/,'API diagnostic ring buffer must stay bounded');

assert.match(enhancements,/performance-observatory\.js/,'performance observatory must be wired');
assert.match(enhancements,/if\(isDirector\(\)\)/,'performance observatory must remain in director/admin runtime');
assert.match(observatory,/PERFORMANCE/,'Admin performance surface missing');
assert.match(observatory,/uniquement sur cet appareil/,'local-only privacy copy missing');
assert.match(observatory,/\/api\/health/,'live health measurement missing');
assert.match(observatory,/serverTiming/,'Server-Timing breakdown missing');
assert.match(observatory,/navigator\.clipboard/,'copyable diagnostic missing');

assert.doesNotMatch(observatory,/method\s*:\s*['"]POST['"]/i,'performance observatory must never POST telemetry');
assert.doesNotMatch(observatory,/localStorage\./,'performance observatory must not persist diagnostics across sessions');
assert.doesNotMatch(observatory,/sessionStorage\./,'performance observatory must not persist diagnostics across sessions');
assert.doesNotMatch(observatory,/authorization|access_token|bearer/i,'performance diagnostic UI must not inspect auth secrets');

console.log('V2.03 local-only performance observatory contract OK');

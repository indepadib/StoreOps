import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const build=readFileSync(new URL('../../frontend/netlify-build.sh',import.meta.url),'utf8');
const config=readFileSync(new URL('../config.mjs',import.meta.url),'utf8');
const env=readFileSync(new URL('../../.env.example',import.meta.url),'utf8');
const doc=readFileSync(new URL('../../docs/PILOT-MICROSOFT-LOGIN.md',import.meta.url),'utf8');
assert.match(config,/ENTRA_API_CLIENT_ID \|\| process\.env\.ENTRA_CLIENT_ID/,'backend must accept common Entra client id');
assert.match(config,/ENTRA_REQUIRED_SCOPE \|\| 'StoreOps\.Access'/,'StoreOps.Access must be the default API scope');
assert.match(config,/allowedTenantId: process\.env\.ENTRA_ALLOWED_TENANT_ID \|\| ''/,'tenant authority domain must not be compared directly with JWT tid GUID');
assert.match(build,/STOREOPS_ENTRA_CLIENT_ID/,'Netlify must accept the common client id');
assert.match(build,/api:\/\//,'frontend must derive the api:// scope');
assert.match(build,/StoreOps\.Access/,'frontend must derive StoreOps.Access');
assert.match(env,/AUTH_MODE=entra/,'pilot example must be Microsoft-first');
assert.match(env,/ENTRA_TENANT_ID=dislogroup\.onmicrosoft\.com/,'pilot tenant domain authority must be documented');
assert.match(env,/STOREOPS_OPS_DIRECTOR_D365_EMAIL=/,'director Microsoft identity must be provisionable separately');
assert.match(doc,/Une seule App Registration/,'pilot setup must document the single-registration path');
for(const text of [build,config,env,doc]){
  assert.doesNotMatch(text,/a\.nachiti@/i,'real pilot manager email must not be committed');
  assert.doesNotMatch(text,/m\.boukenter@/i,'real operations director email must not be committed');
}
console.log('Single App Registration Entra contract OK');

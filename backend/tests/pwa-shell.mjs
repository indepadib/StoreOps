import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const frontend=path.join(root,'frontend');
const sw=fs.readFileSync(path.join(frontend,'sw.js'),'utf8');
const index=fs.readFileSync(path.join(frontend,'index.html'),'utf8');
const rescue=fs.readFileSync(path.join(frontend,'js/boot-rescue.js'),'utf8');
const authEntry=fs.readFileSync(path.join(frontend,'js/auth-entry.js'),'utf8');
const coreBlock=sw.match(/const CORE=\[([\s\S]*?)\];/)?.[1]||'';
const assets=[...coreBlock.matchAll(/'([^']+)'/g)].map(m=>m[1]);
assert.ok(assets.length>20,'PWA core should include the complete application shell');
for(const asset of assets){
  const local=asset==='/'?path.join(frontend,'index.html'):path.join(frontend,asset.replace(/^\//,''));
  assert.ok(fs.existsSync(local),`PWA precache asset missing: ${asset}`);
}
assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/,'service worker must explicitly exclude API routes');
assert.match(sw,/if\(req\.method!==['"]GET['"]\)return/,'service worker must never cache writes');
assert.match(sw,/async function networkFirst/,'mutable application assets must use network-first delivery');
assert.match(sw,/cache:'no-store'/,'network-first shell refresh must bypass stale HTTP caches');
assert.match(sw,/Promise\.allSettled\(CORE\.map/,'one failed precache asset must not prevent service worker activation');
assert.ok(assets.includes('/js/boot-rescue.js'),'boot rescue must be part of the PWA shell');
assert.match(index,/\/js\/boot-rescue\.js/,'boot rescue must load before application startup');
assert.match(index,/\/manager-dlc-focus\.css/,'DLC focused manager stylesheet must be linked');
assert.match(index,/\/manager-commercial-focus\.css/,'commercial focused manager stylesheet must be linked');
assert.match(rescue,/storeops_boot_rescue_v153/,'boot rescue must guard against reload loops');
assert.match(rescue,/getRegistrations\(\)/,'boot rescue must be able to remove a broken service worker');
assert.match(rescue,/caches\.delete/,'boot rescue must clear stale StoreOps shell caches');
assert.match(authEntry,/healthWithTimeout/,'startup healthcheck must fail fast instead of hanging on Chargement');
assert.match(authEntry,/Backend indisponible/,'API startup failures must be visible to the user');
const manifest=JSON.parse(fs.readFileSync(path.join(frontend,'manifest.webmanifest'),'utf8'));
assert.equal(manifest.display,'standalone');
assert.equal(manifest.start_url,'/');
console.log(`StoreOps V1.53 PWA boot resilience test passed · ${assets.length} cached assets`);

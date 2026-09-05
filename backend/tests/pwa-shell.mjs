import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const frontend=path.join(root,'frontend');
const sw=fs.readFileSync(path.join(frontend,'sw.js'),'utf8');
const coreBlock=sw.match(/const CORE=\[([\s\S]*?)\];/)?.[1]||'';
const assets=[...coreBlock.matchAll(/'([^']+)'/g)].map(m=>m[1]);
assert.ok(assets.length>20,'PWA core should include the complete application shell');
for(const asset of assets){
  const local=asset==='/'?path.join(frontend,'index.html'):path.join(frontend,asset.replace(/^\//,''));
  assert.ok(fs.existsSync(local),`PWA precache asset missing: ${asset}`);
}
assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/,'service worker must explicitly exclude API routes');
assert.match(sw,/if\(req\.method!==['"]GET['"]\)return/,'service worker must never cache writes');
const manifest=JSON.parse(fs.readFileSync(path.join(frontend,'manifest.webmanifest'),'utf8'));
assert.equal(manifest.display,'standalone');
assert.equal(manifest.start_url,'/');
console.log(`StoreOps V1.23 PWA shell test passed · ${assets.length} cached assets`);

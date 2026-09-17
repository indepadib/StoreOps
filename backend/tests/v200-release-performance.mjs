import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const build=read('frontend/netlify-build.sh');
const netlify=read('netlify.toml');
const auth=read('frontend/js/auth-entry.js');
const index=read('frontend/index.html');

const sourceCssLinks=[...index.matchAll(/<link\s+rel="stylesheet"\s+href="(\/[^"?]+\.css)/g)].map(x=>x[1]);
assert(sourceCssLinks.length>=25,`expected current source CSS graph to expose the optimization target, got ${sourceCssLinks.length}`);
assert.match(build,/storeops\.bundle\.css/,'production build must generate one CSS bundle');
assert.match(build,/unique\.length/,'build must deduplicate stylesheet inputs');
assert.match(build,/STOREOPS_RELEASE_BUILD/,'release build must drive cache keys');
assert.match(build,/enhancements-entry\.js\?v=/,'build must normalize the deferred enhancement generation');
assert.match(netlify,/for = "\/storeops\.bundle\.css"[\s\S]*?max-age=31536000, immutable/,'versioned CSS bundle must be immutable');
assert.match(auth,/const BUILD='2000';/,'source runtime should identify V2.00');
assert.match(auth,/BUILD_LABEL='2\.00\.0'/,'source runtime label should identify V2.00');

console.log(`V2.00 release performance source contract OK · ${sourceCssLinks.length} CSS requests collapse at build time`);

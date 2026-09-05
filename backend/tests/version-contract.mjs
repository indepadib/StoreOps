import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const config=readFileSync(new URL('../config.mjs',import.meta.url),'utf8');
const env=readFileSync(new URL('../../.env.example',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const frontendApi=readFileSync(new URL('../../frontend/js/api.js',import.meta.url),'utf8');
assert.equal(pkg.version,'1.29.0');
assert.match(config,/STOREOPS_VERSION \|\| '1\.29\.0'/);
assert.match(env,/STOREOPS_VERSION=1\.29\.0/);
assert.match(server,/version:config\.appVersion/g);
assert.doesNotMatch(server,/version:'1\.10'|StoreOps V1\.10/);
assert.match(frontendApi,/SHOWCASE_VERSION='1\.29\.0-showcase'/);
console.log('StoreOps V1.29 version contract tests passed');

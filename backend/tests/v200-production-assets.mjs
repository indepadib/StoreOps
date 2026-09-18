import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const api=read('frontend/js/api.js');
const showcase=read('frontend/js/api-showcase.js');
const app=read('frontend/js/app.js');
const html=read('frontend/index.html');
const auth=read('frontend/js/auth-entry.js');

assert.doesNotMatch(api,/^import\s+.*['"]\.\/mock-/m,'live API runtime must not statically import showcase mocks');
assert.match(api,/import\('\.\/api-showcase\.js'\)/,'showcase graph must load dynamically');
assert.match(api,/function showcaseRuntime\(/,'showcase dynamic import must be memoized');
assert.match(api,/export function isShowcase\(/,'lightweight runtime mode detection must stay in live API facade');
assert.match(showcase,/from '\.\/mock-api\.js'/,'showcase implementation must retain mock routing');
assert.match(showcase,/from '\.\/mock-cash\.js'/,'showcase cash mock must stay available');
assert.match(showcase,/from '\.\/mock-price-check\.js'/,'showcase price checker must stay available');
assert.doesNotMatch(app,/^import\s+.*['"]\.\/mock-/m,'app bootstrap must not statically pull showcase reset modules');
assert.match(app,/lazy\('\.\/mock-api\.js'\)/,'showcase reset remains lazy');

const styles=[...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+\.css)"([^>]*)>/g)].map(m=>({href:m[1],attrs:m[2]}));
const blocking=styles.filter(x=>!x.attrs.includes('media="print"'));
const deferred=styles.filter(x=>x.attrs.includes('media="print"'));
assert(blocking.length<=7,`first paint CSS budget exceeded: ${blocking.length} blocking stylesheets`);
for(const href of ['/styles.css','/manager.css','/manager-today.css','/auth.css'])assert(blocking.some(x=>x.href===href),`${href} must remain critical`);
assert(deferred.some(x=>x.href==='/admin-studio.css'),'Admin Studio CSS should not block first paint');
assert(deferred.some(x=>x.href==='/development.css'),'Development CSS should not block first paint');
assert(deferred.some(x=>x.href==='/manager-scan.css'),'Scanner CSS should not block Today first paint');
assert(deferred.every(x=>x.attrs.includes("onload=\"this.media='all'\"")),'deferred CSS must switch to all media after load');
const runtimeBuild=auth.match(/const BUILD='(\\d+)'/)?.[1];
assert(runtimeBuild,'runtime build cache key must be explicit');
assert.match(html,new RegExp(`auth-entry\\.js\\?v=${runtimeBuild}`),'entry asset cache key must match the active runtime build');

console.log(`Production asset isolation contract OK · build ${runtimeBuild} · ${blocking.length} critical CSS · ${deferred.length} deferred CSS`);

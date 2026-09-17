import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const api=read('frontend/js/api.js');
const showcase=read('frontend/js/api-showcase.js');
const app=read('frontend/js/app.js');

assert.doesNotMatch(api,/^import\s+.*['"]\.\/mock-/m,'live API runtime must not statically import showcase mocks');
assert.match(api,/import\('\.\/api-showcase\.js'\)/,'showcase graph must load dynamically');
assert.match(api,/function showcaseRuntime\(/,'showcase dynamic import must be memoized');
assert.match(api,/export function isShowcase\(/,'lightweight runtime mode detection must stay in live API facade');
assert.match(showcase,/from '\.\/mock-api\.js'/,'showcase implementation must retain mock routing');
assert.match(showcase,/from '\.\/mock-cash\.js'/,'showcase cash mock must stay available');
assert.match(showcase,/from '\.\/mock-price-check\.js'/,'showcase price checker must stay available');
assert.doesNotMatch(app,/^import\s+.*['"]\.\/mock-/m,'app bootstrap must not statically pull showcase reset modules');
assert.match(app,/lazy\('\.\/mock-api\.js'\)/,'showcase reset remains lazy');

console.log('V2.00 production asset isolation contract OK');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const repl=readFileSync(new URL('../../frontend/js/manager-replenishment-v2.js',import.meta.url),'utf8');
assert.match(repl,/function rowKey\(r\)/);
assert.match(repl,/r\?\.productNumber\|\|r\?\.ean/);
assert.match(repl,/data-repl2-key=/);
assert.match(repl,/rowByKey\(action\.dataset\.repl2Key\)/);
assert.doesNotMatch(repl,/rowByEan\(/);
assert.match(repl,/productNumber:r\.productNumber/);
assert.match(repl,/app\.storeId==='trefle'\?'FRP0002'/);

const commercial=readFileSync(new URL('../../frontend/js/pages/commercial.js',import.meta.url),'utf8');
assert.match(commercial,/EAN \/ code article \/ code HS/);
assert.match(commercial,/Code article <strong>/);
assert.match(commercial,/Non disponible/);

const scan=readFileSync(new URL('../../frontend/js/pages/manager-scan.js',import.meta.url),'utf8');
assert.match(scan,/EAN \/ code article \/ code HS/);

const access=readFileSync(new URL('../../frontend/js/admin-studio-access.js',import.meta.url),'utf8');
assert.match(access,/body:JSON\.stringify\(b\)/);
assert.match(access,/body:JSON\.stringify\(\{active:!a\.active\}\)/);

console.log('V2.24 operational stability UI contracts: OK');

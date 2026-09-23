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


const state=readFileSync(new URL('../../frontend/js/state.js',import.meta.url),'utf8');
assert.match(state,/isQualityAudit\(\)&&\['quality','dlc'\]\.includes\(app\.page\)/);

const appJs=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
assert.match(appJs,/isQualityAudit\(\)\?'quality':'today'/);
assert.match(appJs,/#qualityAuditNav button\[data-page\]/);
assert.doesNotMatch(appJs,/\$\('#nav button\[data-page\].*\.forEach/);

const dlc=readFileSync(new URL('../../frontend/js/pages/dlc.js',import.meta.url),'utf8');
assert.match(dlc,/canManageQuality/);

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(server,/getProductByIdentifier/);
assert.match(server,/\/api\/cash-opening\/lines\/:lineId\/check/);
assert.match(server,/\/api\/stores\/:storeId\/dlc/);
assert.match(server,/ensureQuality\(user,p\.storeId\)/);

const workforce=readFileSync(new URL('../services/workforce-api.mjs',import.meta.url),'utf8');
assert.match(workforce,/\/api\/stores\/:storeId\/staffing/);
assert.match(workforce,/\/api\/cash-opening\/lines\/:lineId\/check/);
assert.match(workforce,/\/api\/stores\/:storeId\/price-check\/context\/:identifier/);

const pricing=readFileSync(new URL('../services/dynamics-price.mjs',import.meta.url),'utf8');
assert.match(pricing,/normalizedPrice\(r\.Price,r\.SalesPriceQuantity\|\|1\)/);
assert.match(pricing,/normalizedPrice\(r\.SalesPrice,r\.SalesPriceQuantity\|\|1\)/);

console.log('V2.24 operational stability UI contracts: OK');

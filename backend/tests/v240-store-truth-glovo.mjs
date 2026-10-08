import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLOVO_SKUS,GLOVO_CATALOG_VERSION} from '../data/glovo-catalog.mjs';

const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

assert.equal(GLOVO_SKUS.size,1035,'Le catalogue Glovo doit reprendre les 1 035 SKU uniques des Jets 1 à 4.');
assert.equal(GLOVO_CATALOG_VERSION,'2026-09-30');
for(const sku of ['HS-001191','HS-000224','HS-005591'])assert.ok(GLOVO_SKUS.has(sku),`SKU Glovo attendu absent: ${sku}`);

const stock=read('backend/services/stock-signals.mjs');
assert.match(stock,/productNameSource/);
assert.match(stock,/RELEASED_PRODUCTS/);
assert.match(stock,/POS_SALES/);

const sales=read('backend/services/dynamics-sales.mjs');
assert.match(sales,/storeFilterCandidates/);
assert.match(sales,/Number\.isInteger\(v\).*v>=0&&v<=86399/);
assert.match(sales,/Math\.floor\(v\/60\)/);

const scan=read('frontend/js/pages/manager-scan.js');
assert.doesNotMatch(scan,/\\\\\$\{/,'Article 360 ne doit jamais afficher des interpolations littérales.');
assert.match(scan,/ventes caisse de ce magasin/);
assert.match(scan,/saleRows/);

const repl=read('frontend/js/manager-replenishment-v2.js');
for(const label of ['Stocks négatifs','Ruptures','Proches ruptures','Stocks fantômes','Direct fournisseur','DC · LVE Lakhyayta'])assert.match(repl,new RegExp(label.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')));
assert.match(repl,/recommendation:'PO'/);
assert.match(repl,/recommendation:'TO'/);
assert.match(repl,/recommendation:'DC_REQUEST'/);
assert.match(repl,/recommendation:'INVENTORY'/);

const glovo=read('backend/services/glovo-availability.mjs');
assert.match(glovo,/GLOVO_READ_API_KEY/);
assert.match(glovo,/timingSafeEqual/);
assert.match(glovo,/AVAILABILITY_ONLY/);
assert.match(glovo,/items\.map\(x=>\(\{sku:x\.sku,active:!!x\.active\}\)\)/);
assert.doesNotMatch(glovo,/handleGlovoPartnerApi[\s\S]{0,2200}availableOnHandQuantity/,'Le payload partenaire ne doit pas exposer la quantité.');

const server=read('backend/server.mjs');
const glovoHook=server.indexOf('handleGlovoPartnerApi({req,url})'),sessionHook=server.indexOf('sessionFromRequest(req)');
assert.ok(glovoHook>0&&sessionHook>glovoHook,'L API partenaire doit utiliser son Bearer token avant la session StoreOps.');

const html=read('frontend/index.html'),dock=read('frontend/manager-dock-v240.css'),app=read('frontend/js/app.js');
assert.match(html,/manager-dock-v240\.css/);
assert.match(html,/data-page="inventory">Inventaire[\s\S]*data-page="losses">Démarque/);
assert.match(dock,/position:fixed!important/);
assert.match(app,/RELEASE_BUILD='2403'/);
assert.match(app,/La vue Réseau n’a pas pu se charger/);

const inventory=read('frontend/js/pages/inventory.js');
assert.match(inventory,/import\('\.\.\/manager-replenishment-v2\.js\?v=2402'\)/,'Le manager doit charger le réappro uniquement à l ouverture de l inventaire.');
assert.match(read('frontend/js/enhancements-entry.js'),/const BUILD='2403'/,'Les modules Direction doivent utiliser le cache v2.40.');

const barcode=read('frontend/js/mobile-barcode.js');
assert.match(barcode,/apple\?0\.36:0\.46/);
assert.match(barcode,/Changer d’objectif/);
assert.match(read('frontend/js/pwa.js'),/mobile-barcode\.js\?v=2403/);

console.log('StoreOps V2.40 store truth + Glovo contract: OK');

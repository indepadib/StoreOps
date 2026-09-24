import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.STOREOPS_DB='/tmp/storeops-v2310-dlc-prefill.db';
const {resolveDlcProductDefaults}=await import('../services/dlc.mjs');

const weighted=resolveDlcProductDefaults({product:{inventoryUnit:'g',category:'F&L'},taxonomy:[]});
assert.equal(weighted.unit,'g');
assert.equal(weighted.department,'Fruits & Légumes');
assert.equal(weighted.family,null);
assert.equal(weighted.classificationSource,'PRODUCT_CATEGORY_FALLBACK');

const fleg=resolveDlcProductDefaults({product:{inventoryUnit:'g',category:'Autre',searchName:'FLEG'},taxonomy:[]});
assert.equal(fleg.unit,'g');
assert.equal(fleg.department,'Fruits & Légumes');
assert.equal(fleg.classificationSource,'D365_SEARCH_NAME_FALLBACK');

const family=resolveDlcProductDefaults({
 product:{inventoryUnit:'KG',category:'Autre'},
 taxonomy:[{category_name:'Fruits frais',path:'Retail > Fruits & Légumes > Fruits frais'}]
});
assert.equal(family.unit,'kg');
assert.equal(family.department,'Fruits & Légumes');
assert.equal(family.family,'Fruits frais');
assert.equal(family.classificationSource,'D365_TAXONOMY_FAMILY');

const pls=resolveDlcProductDefaults({
 product:{unit:'PC',category:'Frais'},
 taxonomy:[{category_name:'Yaourts et desserts lactés'}]
});
assert.equal(pls.unit,'pièce');
assert.equal(pls.department,'Crémerie / PLS');
assert.equal(pls.family,'Yaourts et desserts lactés');

const ui=readFileSync(new URL('../../frontend/js/pages/dlc.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(ui,/\/api\/stores\/'\+app\.storeId\+'\/dlc\/product-context/);
assert.match(ui,/dlcDefaults/);
assert.match(ui,/qty\.value=''/,'physical DLC quantity must remain manual');
assert.match(ui,/stock D365/);
assert.match(ui,/Prix indisponible/);
assert.match(ui,/Coût indisponible/);
assert.match(server,/\/api\/stores\/:storeId\/dlc\/product-context/);
assert.match(server,/getStoreCommerceProduct/);
assert.match(server,/resolveDlcProductDefaults/);

console.log('V2.31 smart DLC prefill contract: OK');

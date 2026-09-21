import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB='/tmp/storeops-v2242-hotfix.db';
process.env.STOREOPS_MEDIA_DIR='/tmp/storeops-v2242-hotfix-media';
process.env.D365_MODE='simulated';

const {db}=await import('../db.mjs');
const {createInventorySession,addInventoryLine}=await import('../services/inventory.mjs');
const {buildInventoryExcel}=await import('../services/operations-excel.mjs');
const {createAccessAccount}=await import('../services/access-management.mjs');

const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
const director=db.prepare(`SELECT * FROM users WHERE id='u-ops'`).get();
assert(manager&&director);

const inv=createInventorySession({storeId:'val-fleuri',user:manager,type:'TARGETED',zone:'Fruits & légumes'});
const line=addInventoryLine({sessionId:inv.id,user:manager,product:{ean:'MELON-UNIT-TEST',productNumber:'HS-003577',name:'Melon test',category:'F&L',stock:6000,inventoryUnit:'g'}});
assert.equal(line.stock_unit,'g');
assert.equal(line.theoretical_qty,6000);
const excel=buildInventoryExcel({sessionId:inv.id,user:manager});
assert.match(excel.file.content,/Unité stock/);
assert.match(excel.file.content,/>g</);
assert.match(excel.file.content,/Non agrégée entre unités différentes/);

const qa=createAccessAccount({actor:director,name:'Qualité Hotfix',emailAddress:'qualite.hotfix@example.com',profileCode:'QUALITY_AUDIT',identityProvider:'ENTRA'});
assert.equal(qa.profileCode,'QUALITY_AUDIT');
assert.equal(qa.scope,'NETWORK');

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../../frontend/js/api.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');
const receipts=readFileSync(new URL('../../frontend/js/pages/receipts.js',import.meta.url),'utf8');
const staffing=readFileSync(new URL('../../frontend/js/pages/staffing.js',import.meta.url),'utf8');
const inventoryUi=readFileSync(new URL('../../frontend/js/pages/inventory.js',import.meta.url),'utf8');
const session=readFileSync(new URL('../auth/session.mjs',import.meta.url),'utf8');

assert.match(api,/plainObject/);
assert.match(api,/JSON\.stringify\(body\)/);
assert.match(server,/\/api\/cash-opening\/lines\/:lineId\/check/);
assert.match(server,/\/api\/stores\/:storeId\/cash-opening/);
assert.match(server,/\/api\/staffing\/lines\/:lineId\/attendance/);
assert.match(server,/\/api\/stores\/:storeId\/staffing/);
assert.match(server,/\/api\/stores\/:storeId\/products\/:ean/);
assert.match(staffing,/if\(!d\)/);
assert.match(receipts,/PO · commandes/);
assert.match(receipts,/TO · transferts/);
assert.match(receipts,/canManageQuality/);
assert.match(index,/data-page="receipts">Réceptions/);
assert.match(app,/\['quality','dlc','receipts'\]/);
assert.doesNotMatch(app,/\?v=2150/);
assert.match(app,/RELEASE_BUILD='2242'/);
assert.match(inventoryUi,/unité de stock/);
assert.match(inventoryUi,/prepareQuickProduct/);
assert.match(session,/STOREOPS_QUALITY_AUDIT_ALIASES/);
assert.match(index,/v2\.24\.2/);

console.log('V2.24.2 operational hotfix contract OK');

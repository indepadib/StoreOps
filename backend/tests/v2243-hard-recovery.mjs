import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-v2243-${process.pid}.db`;
process.env.STOREOPS_MEDIA_DIR=`/tmp/storeops-v2243-media-${process.pid}`;
process.env.STOREOPS_QUALITY_AUDIT_NAME='Mohammed Amine Chibani';
process.env.STOREOPS_QUALITY_AUDIT_EMAIL='amine.quality@example.com';
process.env.STOREOPS_QUALITY_AUDIT_MICROSOFT_EMAIL='amine.quality@example.com';

const {db}=await import('../db.mjs');

// Simulate the historic identity collision that made the Quality lead log in as another account.
db.prepare(`UPDATE users SET email=?,entra_oid=? WHERE id='u-tr'`).run('amine.quality@example.com','oid-amine-historic');
await import('../services/pilot-profile.mjs');

const quality=db.prepare(`SELECT * FROM users WHERE id='u-quality-audit'`).get();
const legacy=db.prepare(`SELECT * FROM users WHERE id='u-tr'`).get();
assert.equal(quality.permissions_profile,'quality_audit');
assert.equal(quality.role,'employee');
assert.equal(quality.store_id,null);
assert.equal(quality.email,'amine.quality@example.com');
assert.equal(quality.entra_oid,'oid-amine-historic');
assert.equal(legacy.email,null);
assert.equal(legacy.entra_oid,null);

const {canAccessStore,canManageQuality,canManageDlc,canManageStore}=await import('../services/permissions.mjs');
assert.equal(canAccessStore(quality,'val-fleuri'),true);
assert.equal(canAccessStore(quality,'trefle'),true);
assert.equal(canManageQuality(quality,'val-fleuri'),true);
assert.equal(canManageQuality(quality,'trefle'),true);
assert.equal(canManageDlc(quality,'val-fleuri'),true);
assert.equal(canManageDlc(quality,'trefle'),true);
assert.equal(canManageStore(quality,'val-fleuri'),false);

const {createInventorySession,addInventoryLine,countInventoryLine,inventorySession,inventorySummary}=await import('../services/inventory.mjs');
const {buildInventoryExcel}=await import('../services/operations-excel.mjs');
const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
const session=createInventorySession({storeId:'val-fleuri',user:manager,type:'TARGETED',zone:'Test unités'});
const grams=addInventoryLine({sessionId:session.id,user:manager,product:{ean:'TEST-G',productNumber:'TEST-G',name:'Produit pondéré',category:'F&L',stock:6000,inventoryUnit:'g'}});
const pieces=addInventoryLine({sessionId:session.id,user:manager,product:{ean:'TEST-P',productNumber:'TEST-P',name:'Produit pièce',category:'Épicerie',stock:10,inventoryUnit:'pièce'}});
assert.equal(grams.unit,'g');
assert.equal(pieces.unit,'pièce');
countInventoryLine({lineId:grams.id,user:manager,quantity:5999,reasonCode:'COUNT_ERROR'});
countInventoryLine({lineId:pieces.id,user:manager,quantity:9,reasonCode:'COUNT_ERROR'});
const inv=inventorySession(session.id);
assert.equal(inv.metrics.absoluteVarianceQty,null,'mixed units must never be summed into one number');
assert.equal(inv.metrics.absoluteVarianceByUnit.g,1);
assert.equal(inv.metrics.absoluteVarianceByUnit['pièce'],1);
const summary=inventorySummary('val-fleuri');
assert.equal(summary.absoluteVarianceQty,null);
assert.equal(summary.absoluteVarianceByUnit.g,1);
assert.equal(summary.absoluteVarianceByUnit['pièce'],1);
const excel=buildInventoryExcel({sessionId:session.id,user:manager});
assert.match(excel.file.content,/Unité stock/);
assert.match(excel.file.content,/Écart absolu · g/);
assert.match(excel.file.content,/Écart absolu · pièce/);

const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const boot=readFileSync(new URL('../../frontend/js/boot-classic.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../../frontend/sw.js',import.meta.url),'utf8');
const readiness=readFileSync(new URL('../services/readiness-api.mjs',import.meta.url),'utf8');
const cashUi=readFileSync(new URL('../../frontend/js/pages/cash-opening.js',import.meta.url),'utf8');
const staffing=readFileSync(new URL('../../frontend/js/pages/staffing.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

assert.doesNotMatch(app,/\$\('#nav button\[data-page\],#managerNav button\[data-page\],#qualityAuditNav button\[data-page\],#developmentNavBar button\[data-page\]'\)\.forEach/,'navigation must not call forEach on the single-element $ helper');
assert.match(app,/document\.querySelectorAll\('#nav button\[data-page\],#managerNav/);
assert.match(boot,/storeops-legacy-runtime-cleaned-'\+BUILD/,'browser cleanup must be build-specific');
assert.match(boot,/2\.24\.3/);
assert.match(sw,/registration\.unregister/);
assert.doesNotMatch(sw,/addEventListener\('fetch'/,'legacy service worker must not intercept assets');
assert.match(readiness,/cash-opening\/tills\/:tillCode\/check/);
assert.match(cashUi,/cash-opening\/tills\/\$\{encodeURIComponent\(till\)\}\/check/);
assert.match(staffing,/d\.metrics\|\|\{\}/);
assert.match(server,/D365_INVENTORY_WRITE_DISABLED/);

console.log('V2.24.3 hard recovery contract: OK');

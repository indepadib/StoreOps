import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB=`/tmp/storeops-v2303-hardening-${process.pid}.db`;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const app=read('frontend/js/app.js');
const index=read('frontend/index.html');
const api=read('frontend/js/api.js');
const staffing=read('frontend/js/pages/staffing.js');
const cashOpening=read('frontend/js/pages/cash-opening.js');
const accessUi=read('frontend/js/admin-studio-access.js');
const receipts=read('frontend/js/pages/receipts.js');
const inventory=read('frontend/js/pages/inventory.js');
const receiving=read('backend/services/dynamics-receiving.mjs');
const accessApi=read('backend/services/access-management-api.mjs');

// Boot / stale shell.
const selector="$$('#nav button[data-page],#managerNav button[data-page],#qualityAuditNav button[data-page],#developmentNavBar button[data-page]').forEach";
assert.ok(app.includes(selector),'navigation must use multi-selector helper $$');
assert.ok(!app.includes("$('"+selector.slice(3)),'querySelector must never be used as a collection');
assert.match(app,/RELEASE_BUILD='2303'/);
assert.match(index,/v2\.30\.3/);
assert.doesNotMatch([app,index,api,staffing,cashOpening,accessUi].join('\n'),/v=2211|2\.21\.1/);
assert.match(app,/location\.assign\('\/repair'\)/,'boot failure must expose deterministic cache repair');

// API serialization / legacy JSON compatibility.
assert.match(api,/typeof options\.body==='object'[\s\S]*JSON\.stringify\(options\.body\)/);
assert.match(accessApi,/typeof value==='string'[\s\S]*JSON\.parse\(value\)/);

// Cash opening stable route only in current UI.
assert.match(cashOpening,/\/api\/stores\/\$\{app\.storeId\}\/cash-opening\/check/);
assert.doesNotMatch(cashOpening,/\/api\/cash-opening\/lines\//);

// Staffing null-safety.
assert.match(staffing,/rawData\|\|\{\}/);
assert.match(staffing,/rawMetrics=d\.metrics\|\|data\.summary\|\|\{\}/);
assert.match(staffing,/baseMetrics=/);

// Access Studio: create + edit + Quality profile.
assert.match(accessUi,/\+ Créer un compte/);
assert.match(accessUi,/QUALITY_AUDIT/);
assert.match(accessUi,/method:editingId\?'PUT':'POST'/);
assert.match(accessUi,/body:b/);

// PO / TO are distinct product flows.
assert.match(receipts,/data-receipt-type="PO"/);
assert.match(receipts,/data-receipt-type="TO"/);
assert.match(receipts,/\/receipts\/po/);
assert.match(receipts,/\/receipts\/to/);
assert.match(receiving,/d365_receiving_sync_state/);
assert.match(receiving,/d365_transfer_receiving_sync_state/);
assert.match(receiving,/listExpectedPurchaseOrders/);
assert.match(receiving,/listExpectedTransferOrders/);

// Inventory: express + advanced + blind count + history/export.
for(const needle of ['Compter maintenant','Inventaires en cours','Historique & export','Comptage aveugle','Inventaire complet','Inventaire tournant','Inventaire ciblé'])assert.ok(inventory.includes(needle),needle);
assert.match(inventory,/\/inventory\/express\/count/);
assert.match(inventory,/Exporter Excel/);
assert.doesNotMatch(inventory,/\/inventory\/[^'"`]+\/post/);

// Amine / Quality network direct permissions.
const {db}=await import('../db.mjs');
db.prepare(`INSERT OR REPLACE INTO users(id,name,email,role,store_id,active,permissions_profile)
 VALUES('u-amine-v2303','Amine Chibani','amine.v2303@example.invalid','store_manager','trefle',1,NULL)`).run();
const access=await import('../services/access-management.mjs');
const amine=db.prepare(`SELECT * FROM users WHERE id='u-amine-v2303'`).get();
assert.equal(amine.role,'employee');
assert.equal(amine.store_id,null);
assert.equal(amine.permissions_profile,'quality_audit');
const perms=await import('../services/permissions.mjs');
for(const storeId of ['val-fleuri','trefle']){
 assert.equal(perms.canAccessStore(amine,storeId),true);
 assert.equal(perms.canManageQuality(amine,storeId),true);
 assert.equal(perms.canManageDlc(amine,storeId),true);
 assert.equal(perms.canManageStore(amine,storeId),false);
}

// Account creation / assignment is operational.
const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
assert(admin,'admin/director fixture required');
const created=access.createAccessAccount({
 actor:admin,name:'Qualité Réseau V2303',emailAddress:'qualite.v2303@example.invalid',
 profileCode:'QUALITY_AUDIT',identityProvider:'ENTRA',note:'hardening contract'
});
assert.equal(created.profileCode,'QUALITY_AUDIT');
assert.equal(created.scope,'NETWORK');
assert.equal(created.storeId,null);

console.log('V2.30.3 operational hardening contract: OK');

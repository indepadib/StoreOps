import assert from 'node:assert/strict';
import {canAccessStore,canManageQuality,canManageDlc,canManageStore,canGovernQuality,isQualityAudit} from '../services/permissions.mjs';

const manager={id:'u-vf',role:'store_manager',store_id:'val-fleuri',permissions_profile:null};
const director={id:'u-ops',role:'ops_director',store_id:null,permissions_profile:null};
const quality={id:'u-quality-audit',role:'employee',store_id:null,permissions_profile:'quality_audit'};

assert.equal(isQualityAudit(quality),true);
assert.equal(isQualityAudit(manager),false);

// Ayoub: only his own store, operational manager permissions.
assert.equal(canAccessStore(manager,'val-fleuri'),true);
assert.equal(canAccessStore(manager,'trefle'),false);
assert.equal(canManageStore(manager,'val-fleuri'),true);
assert.equal(canManageStore(manager,'trefle'),false);
assert.equal(canManageQuality(manager,'val-fleuri'),true);
assert.equal(canManageDlc(manager,'val-fleuri'),true);

// Mourad: full operational network access.
assert.equal(canAccessStore(director,'val-fleuri'),true);
assert.equal(canAccessStore(director,'trefle'),true);
assert.equal(canManageStore(director,'val-fleuri'),true);
assert.equal(canGovernQuality(director),true);

// Mohammed Amine: network-wide Quality/Audit access, but never operational posting rights.
assert.equal(canAccessStore(quality,'val-fleuri'),true);
assert.equal(canAccessStore(quality,'trefle'),true);
assert.equal(canManageQuality(quality,'val-fleuri'),true);
assert.equal(canManageQuality(quality,'trefle'),true);
assert.equal(canManageDlc(quality,'val-fleuri'),true);
assert.equal(canManageDlc(quality,'trefle'),true);
assert.equal(canGovernQuality(quality),true);
assert.equal(canManageStore(quality,'val-fleuri'),false);
assert.equal(canManageStore(quality,'trefle'),false);

const {readFileSync}=await import('node:fs');
const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const state=readFileSync(new URL('../../frontend/js/state.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');
const dlc=readFileSync(new URL('../../frontend/js/pages/dlc.js',import.meta.url),'utf8');
const qualityUi=readFileSync(new URL('../../frontend/js/pages/quality.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.match(index,/id="qualityAuditNav"/);
assert.match(app,/isQualityAudit\(\)\?'quality'/);
assert.match(app,/qualityAuditNav/);
assert.match(app,/dlc\.js\?v=2243/);
assert.match(app,/quality\.js\?v=2243/);
assert.match(state,/canManageDlc/);
assert.match(dlc,/canManageDlc/);
assert.match(qualityUi,/canManageQuality/);
assert.match(server,/permissions_profile:user\.permissions_profile/);
assert.match(server,/ensureDlc\(user,p\.storeId\)/);
assert.match(server,/\/api\/receipts\/:po\/post[\s\S]*?ensureManage\(user,r\.store_id\)/);
console.log('Quality & Audit access contract OK');

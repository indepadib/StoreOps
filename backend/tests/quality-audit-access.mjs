import assert from 'node:assert/strict';
import {canAccessStore,canManageQuality,canManageStore,canGovernQuality,isQualityAudit} from '../services/permissions.mjs';

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
assert.equal(canGovernQuality(quality),true);
assert.equal(canManageStore(quality,'val-fleuri'),false);
assert.equal(canManageStore(quality,'trefle'),false);

console.log('Quality & Audit access contract OK');

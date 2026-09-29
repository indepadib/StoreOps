import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAccessDevelopment,canAccessWarehouse,canManageStore,isDevelopment,isSupplyChain } from '../services/permissions.mjs';

const staleDevelopmentManager={id:'mgr',role:'store_manager',store_id:'val-fleuri',permissions_profile:'development'};
const staleSupplyManager={id:'mgr2',role:'store_manager',store_id:'trefle',permissions_profile:'supply_chain'};
const supplyUser={id:'supply',role:'employee',store_id:null,permissions_profile:'supply_chain'};

assert.equal(isDevelopment(staleDevelopmentManager),false,'store_manager must never become DEVELOPMENT from a stale profile');
assert.equal(canAccessDevelopment(staleDevelopmentManager),false,'manager must not see Development');
assert.equal(canManageStore(staleDevelopmentManager,'val-fleuri'),true,'manager must manage own store');
assert.equal(canManageStore(staleDevelopmentManager,'trefle'),false,'manager must stay scoped to own store');
assert.equal(isSupplyChain(staleSupplyManager),false,'store_manager must never become SUPPLY_CHAIN from a stale profile');
assert.equal(canAccessWarehouse(staleSupplyManager),false,'manager must not see warehouse cockpit');
assert.equal(canAccessWarehouse(supplyUser),true,'real SUPPLY_CHAIN keeps warehouse access');

const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');
const inventory=readFileSync(new URL('../../frontend/js/pages/inventory.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const network=readFileSync(new URL('../../frontend/js/pages/network.js',import.meta.url),'utf8');
const barcode=readFileSync(new URL('../../frontend/js/mobile-barcode.js',import.meta.url),'utf8');
const pda=readFileSync(new URL('../../frontend/js/pda-mode.js',import.meta.url),'utf8');
const enhancements=readFileSync(new URL('../../frontend/js/enhancements-entry.js',import.meta.url),'utf8');
const authEntry=readFileSync(new URL('../../frontend/js/auth-entry.js',import.meta.url),'utf8');

assert.match(app,/isDevelopmentOnly\(\)/,'frontend must resolve development-only explicitly');
assert.match(app,/await loadStores\(\);await detectDevelopmentAccess\(\);updateHeader\(\);setPage\('today'\)/,'profile switch must recalculate permissions');
assert.match(index,/id="managerNav"[\s\S]*data-page="inventory"[\s\S]*data-page="losses"/,'manager mobile nav must expose inventory and losses');
assert.match(server,/summaryOnly=url\.searchParams\.get\('summary'\)==='1'/,'inventory API must support lightweight session listing');
assert.match(inventory,/inventory\?status=ALL&summary=1/,'inventory frontend must use lightweight listing');
assert.match(inventory,/data-open-inventory-session/,'inventory details must load on demand');
assert.match(network,/safe\(api\('\/api\/network'\),7000\)/,'network bootstrap must have a timeout');

console.log('v2.39.2 manager/mobile inventory hotfix contract: OK');

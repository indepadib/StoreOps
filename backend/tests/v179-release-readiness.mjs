import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(new URL('../..',import.meta.url).pathname);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

// No temporary self-modifying apply workflows may ship in a release branch.
const workflowDir=path.join(root,'.github/workflows');
const workflows=fs.readdirSync(workflowDir);
assert.equal(workflows.filter(x=>/apply-/i.test(x)).length,0,'temporary apply workflow still present');

// Manager UX stays intentionally simple: 4 primary destinations only.
const html=read('frontend/index.html');
const managerNav=html.match(/<nav class="manager-nav"[\s\S]*?<\/nav>/)?.[0]||'';
assert.equal((managerNav.match(/<button /g)||[]).length,4,'manager navigation must keep exactly 4 primary entries');
for(const label of ['Aujourd’hui','Scanner','Équipe','Plus'])assert.match(managerNav,new RegExp(label));

// Assortment must remain part of stock/OOS qualification.
const stockSignals=read('backend/services/stock-signals.mjs');
assert.match(stockSignals,/assortmentIndex/);
assert.match(stockSignals,/OUT_OF_STOCK/);
assert.match(stockSignals,/RESIDUAL_STOCK_OUTSIDE_ASSORTMENT/);
assert.match(stockSignals,/ASSORTMENT_UNKNOWN/);

// Live ERP writes must remain hard-blocked until an adapter is explicitly validated.
const dynamics=read('backend/services/dynamics.mjs');
for(const code of ['D365_RECEIPT_WRITE_NOT_MAPPED','D365_INVENTORY_WRITE_NOT_MAPPED','D365_LOSS_WRITE_NOT_MAPPED'])assert.match(dynamics,new RegExp(code));

// Release must expose canonical pluggable building blocks.
for(const p of [
  'backend/services/connector-contract.mjs',
  'backend/services/process-template-engine.mjs',
  'backend/services/export-template.mjs',
  'backend/services/assortment.mjs',
  'backend/services/workforce.mjs',
  'backend/services/replenishment-engine.mjs',
  'backend/services/business-pulse.mjs',
  'backend/services/item-assistant.mjs'
]) assert.ok(fs.existsSync(path.join(root,p)),`${p} missing`);

// Netlify bridge must carry each independent read-domain configuration.
const netlify=read('netlify/functions/api.mts');
for(const key of ['D365_RECEIVING_READ_MODE','D365_ASSORTMENT_READ_MODE','D365_TAXONOMY_READ_MODE','D365_SALES_READ_MODE','D365_STORE_SUPPLY_WAREHOUSES'])assert.match(netlify,new RegExp(key));

console.log('StoreOps V1.79 release readiness gate OK');

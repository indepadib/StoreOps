import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-v214-integration-p0-${process.pid}.db`;
process.env.D365_MODE='live';
process.env.D365_SALES_READ_MODE='simulated';

await import('../services/pilot-profile.mjs');
const {evaluateD365SalesSmokeRows}=await import('../services/d365-sales-mapping.mjs');

const receiving=readFileSync(new URL('../services/dynamics-receiving.mjs',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const managerHome=readFileSync(new URL('../../frontend/js/pages/manager-home.js',import.meta.url),'utf8');
const receipts=readFileSync(new URL('../../frontend/js/pages/receipts.js',import.meta.url),'utf8');
const integrationApi=readFileSync(new URL('../services/integration-registry-api.mjs',import.meta.url),'utf8');
const mappingDiagnostics=readFileSync(new URL('../services/d365-mapping-diagnostics.mjs',import.meta.url),'utf8');
const salesUi=readFileSync(new URL('../../frontend/js/admin-d365-mapping.js',import.meta.url),'utf8');
const salesMapping=readFileSync(new URL('../services/d365-sales-mapping.mjs',import.meta.url),'utf8');
const auth=readFileSync(new URL('../../frontend/js/auth-entry.js',import.meta.url),'utf8');
const classic=readFileSync(new URL('../../frontend/js/boot-classic.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../../frontend/netlify-build.sh',import.meta.url),'utf8');
const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../../netlify/functions/api.mts',import.meta.url),'utf8');

assert.match(receiving,/RemainingPurchaseQuantity/,'receiving mapping must expose remaining quantity');
assert.match(receiving,/remainingQtyField\} gt 0/,'PO lines must be filtered server-side to remaining quantities when mapped');
assert.match(receiving,/D365_PO_SYNC_TOP/,'PO sync needs a bounded line budget');
assert.match(receiving,/D365_PO_SYNC_TIMEOUT_MS/,'PO sync needs a platform-safe total time budget');
assert.match(receiving,/D365_RECEIVING_SYNC_TIMEOUT/,'PO timeout must become a controlled integration state');
assert.match(receiving,/partial:!authoritative/,'truncated PO reads must be marked partial');
assert.match(receiving,/if\(authoritative\)db\.prepare/,'partial PO reads must not deactivate unseen cached records');

const getReceipts=server.match(/route\(path,'\/api\/stores\/:storeId\/receipts'\)[\s\S]*?receipts\/readiness/)?.[0]||'';
assert(getReceipts,'receipts GET route must exist');
assert.doesNotMatch(getReceipts,/syncExpectedReceiptsFromDynamics/,'receipts GET must be cache-first');
assert.doesNotMatch(managerHome,/receipts\/sync/,'Today must not fire a background PO write/sync');
assert.match(receipts,/Synchroniser D365/,'Receipts must keep an explicit user-controlled sync');
assert.match(receipts,/dernier cache fiable/,'Receipts UI must explain cache-first behavior');
assert.match(receipts,/sync\.partial/,'Receipts UI must distinguish partial sync');
assert.match(receipts,/Le dernier cache est conservé/,'Receipts UI must preserve operational continuity on D365 errors');

assert.match(mappingDiagnostics,/discoverD365SalesMapping/,'focused sales discovery missing');
assert.match(integrationApi,/d365-sales-mapping\/auto-connect/,'safe one-click sales endpoint missing');
assert.match(integrationApi,/smokeD365SalesMapping/,'sales auto-connect must smoke before activation');
assert.match(integrationApi,/activateD365SalesMapping/,'sales auto-connect must only activate through validated lifecycle');
assert.match(salesUi,/Connecter automatiquement les ventes/,'Admin UI must expose one-click sales connection');
assert.match(salesMapping,/smoke\.missingInPayload\|\|\[\]/,'sales smoke audit must not reference an undefined variable');
assert.match(salesMapping,/channelOk=!!channel&&channelMatches>0/,'sales smoke must prove the requested retail channel');

const mapping={entity:'RetailTransactionSalesTransBIEntities',fields:{channel:'RetailChannelId',businessDate:'BusinessDate',transaction:'TransactionId',product:'ItemId',net:'NetAmountInclTax',quantity:'Qty',cost:'',time:'TransactionTime',productName:'ItemName',department:'',category:''},dateFilterMode:'datetime',salesSign:-1,quantitySign:1,costSign:-1};
const wrongChannel=evaluateD365SalesSmokeRows({rows:[{RetailChannelId:'99999',BusinessDate:'2026-09-19T10:00:00Z',TransactionId:'T-1',ItemId:'HS-1',NetAmountInclTax:-100,Qty:1}],mapping,retailChannelId:'10001',filtered:false});
assert.equal(wrongChannel.status,'FAILED','an unrelated retail channel must never validate Val Fleuri sales');
assert.equal(wrongChannel.channelOk,false);

assert.match(auth,/const BUILD='2150'/);
assert.match(auth,/const BUILD_LABEL='2\.15\.0'/);
assert.match(classic,/BUILD='2\.15\.0'/);
assert.match(build,/2150/);
assert.match(index,/v2\.15\.0/);
assert.match(app,/receipts\.js\?v=2150/,'Receipts must bypass the previous five-minute module cache');
assert.match(bridge,/version:envValue\('STOREOPS_VERSION'\)\|\|'2\.15\.0'/);
assert.match(bridge,/D365_PO_SYNC_TIMEOUT_MS/,'Netlify bridge must forward PO safety controls');

console.log('V2.14 Integration P0 contract passed');

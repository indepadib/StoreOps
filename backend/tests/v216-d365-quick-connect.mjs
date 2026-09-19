import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-v216-d365-quick-connect-${process.pid}.db`;
process.env.STOREOPS_REAL_ONLY='true';
process.env.D365_MODE='live';
process.env.D365_RECEIVING_READ_MODE='live';

await import('../services/pilot-profile.mjs');

const config=readFileSync(new URL('../config.mjs',import.meta.url),'utf8');
const receiving=readFileSync(new URL('../services/dynamics-receiving.mjs',import.meta.url),'utf8');
const receipts=readFileSync(new URL('../../frontend/js/pages/receipts.js',import.meta.url),'utf8');
const quick=readFileSync(new URL('../../frontend/js/admin-d365-quick-connect.js',import.meta.url),'utf8');
const enhancements=readFileSync(new URL('../../frontend/js/enhancements-entry.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../../netlify/functions/api.mts',import.meta.url),'utf8');
const auth=readFileSync(new URL('../../frontend/js/auth-entry.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');

assert.match(config,/remainingQtyField:\s*process\.env\.D365_PO_REMAINING_QTY_FIELD \|\| ''/,'PurchaseOrderLinesV2 must not default to an unsupported remainder property');
assert.match(config,/receivedQtyField:\s*process\.env\.D365_PO_RECEIVED_QTY_FIELD \|\| ''/,'PurchaseOrderLinesV2 must not default to an unsupported received quantity property');
assert.match(config,/lineStatusField:\s*process\.env\.D365_PO_LINE_STATUS_FIELD \|\| 'PurchaseOrderLineStatus'/,'PO V2 must use its real line status field');
assert.match(receiving,/function lineIsOpen\(/);
assert.match(receiving,/\['received','invoiced','canceled','cancelled'\]/);
assert.match(receiving,/remainingFilterFallback=true/,'an invalid configured remainder filter must fall back instead of failing the PO flow');
assert.match(receiving,/lineStateReliable/,'PO cache authority must depend on a reliable open\/closed signal');
assert.match(receipts,/reste à confirmer/,'unknown PO remainder must stay explicit in the manager UI');

assert.match(enhancements,/admin-d365-quick-connect\.js/,'Quick Connect must load inside Admin integrations');
assert.match(quick,/d365-sales-mapping\/auto-connect/,'Quick Connect must validate Business Pulse sales');
assert.match(quick,/d365-price-history-mapping\/auto-connect/,'Quick Connect must validate Trade Agreements');
assert.match(quick,/receipts\/sync/,'Quick Connect must validate PO reads');
assert.match(quick,/Les flux non validés restent désactivés ou dégradés/,'Quick Connect must preserve truthful integration semantics');
assert.match(bridge,/D365_PO_LINE_STATUS_FIELD/,'Netlify must forward optional PO line status mapping');

assert.match(auth,/const BUILD='2160'/);
assert.match(auth,/const BUILD_LABEL='2\.16\.0'/);
assert.match(index,/v2\.16\.0/);

console.log('V2.16 D365 quick connect contract passed');

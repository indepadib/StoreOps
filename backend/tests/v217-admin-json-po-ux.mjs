import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

const api=read('frontend/js/api.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const stores=read('frontend/js/admin-studio-stores.js');
const validation=read('frontend/js/admin-validation-center.js');
const receipts=read('frontend/js/pages/receipts.js');
const managerReceiving=read('frontend/js/manager-receiving-focus.js');
const auth=read('frontend/js/auth-entry.js');
const app=read('frontend/js/app.js');
const index=read('frontend/index.html');
const build=read('frontend/netlify-build.sh');

assert.match(api,/function normalizeBody\(body\)/,'api.js must serialize object bodies centrally');
assert.match(api,/JSON\.stringify\(body\)/,'object request bodies must become JSON');
assert.match(api,/body:normalizedBody/,'fetch must receive the normalized body');
assert.match(api,/instanceof FormData/,'FormData must remain a native request body');

assert.match(enhancements,/mountAdminSection/,'lazy Admin loader must call an explicit mount hook when available');
assert.match(stores,/export async function mountAdminSection/,'Store Settings must expose a remount hook');
assert.doesNotMatch(stores,/!root\?\.querySelector\('\.studio-hero'\)/,'Store Settings must not depend on the Admin home hero being present');

assert.match(validation,/const results=\[\]/,'Validation Center must collect per-step outcomes');
assert.match(validation,/Validation terminée avec/,'Validation Center must not abort the whole checklist on one failed smoke');
assert.doesNotMatch(validation,/Validation interrompue/,'legacy all-or-nothing validation messaging must be removed');

assert.match(receipts,/poLimit=25/,'large PO queues must be progressively rendered');
assert.match(receipts,/Rechercher PO, fournisseur, SKU ou EAN/,'PO browser search missing');
assert.match(receipts,/data-receipt-filter/,'PO filters missing');
assert.match(receipts,/receipt-detail-panel/,'one-PO detail panel missing');
assert.doesNotMatch(receipts,/rows\.map\(r=>receipt\(r,ro\)\)/,'all PO details must not render at once');
assert.match(managerReceiving,/D’autres commandes restent ouvertes/,'manager flow must account for multiple open POs');

for(const [name,content] of [['auth-entry',auth],['app',app],['index',index],['netlify-build',build],['enhancements',enhancements]]){
 assert.match(content,/2170|2\.17\.0/,name+' must reference release 2.17');
}

console.log('V2.17 Admin JSON + scalable PO UX contract OK');

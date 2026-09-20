import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v217-demo-ready.db';
process.env.STOREOPS_MEDIA_DIR='/tmp/storeops-v217-demo-media';

const {db}=await import('../db.mjs');
const {getOrCreateExpressInventory,activeExpressInventory,expressInventoryCount,finalizeInventorySession}=await import('../services/inventory.mjs');

const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
assert(manager,'Val Fleuri manager must exist');

let session=getOrCreateExpressInventory({storeId:'val-fleuri',user:manager});
assert.equal(session.inventory_type,'TARGETED');
assert.equal(session.zone,'Express');
assert.equal(session.metrics.lines,0);
assert.equal(activeExpressInventory('val-fleuri').id,session.id);

let result=expressInventoryCount({
 storeId:'val-fleuri',user:manager,
 product:{ean:'9990000000011',productNumber:'EXP-1',name:'Article express conforme',category:'Test',stock:5},
 quantity:5
});
assert.equal(result.step,'COUNTED');
assert.equal(result.line.final_variance,0);
assert.equal(result.session.metrics.lines,1);

result=expressInventoryCount({
 storeId:'val-fleuri',user:manager,
 product:{ean:'9990000000028',productNumber:'EXP-2',name:'Article express écart',category:'Test',stock:10},
 quantity:6
});
assert.equal(result.step,'RECOUNT_REQUIRED');
assert.equal(result.line.status,'RECOUNT');

result=expressInventoryCount({
 storeId:'val-fleuri',user:manager,
 product:{ean:'9990000000028',productNumber:'EXP-2',name:'Article express écart',category:'Test',stock:10},
 quantity:9,reasonCode:'COUNT_ERROR'
});
assert.equal(result.step,'COUNTED');
assert.equal(result.line.final_variance,-1);
assert.equal(result.session.metrics.pending,0);

const done=finalizeInventorySession({sessionId:session.id,user:manager});
assert.equal(done.session.status,'READY_TO_POST');
assert.equal(activeExpressInventory('val-fleuri'),null);

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const inventoryUi=readFileSync(path.join(root,'frontend/js/pages/inventory.js'),'utf8');
const lossUi=readFileSync(path.join(root,'frontend/js/pages/losses.js'),'utf8');
const managerHub=readFileSync(path.join(root,'frontend/js/pages/manager-hubs.js'),'utf8');
const managerScan=readFileSync(path.join(root,'frontend/js/pages/manager-scan.js'),'utf8');
const app=readFileSync(path.join(root,'frontend/js/app.js'),'utf8');
const index=readFileSync(path.join(root,'frontend/index.html'),'utf8');
const server=readFileSync(path.join(root,'backend/server.mjs'),'utf8');
const mockApi=readFileSync(path.join(root,'frontend/js/mock-api.js'),'utf8');

assert.match(server,/\/inventory\/express\/count/);
assert.match(inventoryUi,/INVENTAIRE EXPRESS/);
assert.match(inventoryUi,/Valider & article suivant/);
assert.match(inventoryUi,/Terminer l’inventaire/);
assert.match(lossUi,/DÉMARQUE EXPRESS/);
assert.match(lossUi,/data-loss-reason/);
assert.match(lossUi,/Enregistrer & article suivant/);
assert.match(managerHub,/Inventaire express/);
assert.match(managerHub,/Démarque express/);
assert.match(managerScan,/data-express-tool="inventory"/);
assert.match(managerScan,/data-express-tool="losses"/);
assert.match(managerScan,/storeops_express_prefill_ean/);
assert.match(app,/inventory\.js\?v=2170/);
assert.match(app,/losses\.js\?v=2170/);
assert.match(index,/inventory\.css/);
assert.match(index,/v2\.17\.0/);

console.log('V2.17 demo-ready inventory + loss contract OK');

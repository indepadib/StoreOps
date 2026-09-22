import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v227-inventory-counting.db';

const {db}=await import('../db.mjs');
const {createInventorySession,getOrCreateExpressInventory,addInventoryLine,inventorySession}=await import('../services/inventory.mjs');

const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get()||db.prepare(`SELECT * FROM users WHERE role='store_manager' ORDER BY id LIMIT 1`).get();
assert(manager,'store manager required');

const product={ean:'999227000001',productNumber:'V227-1',name:'Article comptage V2.27',category:'Test',stock:8,inventoryUnit:'pièce'};

const advanced=createInventorySession({storeId:'val-fleuri',user:manager,type:'TARGETED',zone:'Allée 3',comment:'Test session avancée'});
const express=getOrCreateExpressInventory({storeId:'val-fleuri',user:manager});

assert.notEqual(advanced.id,express.id,'Express and advanced inventory must never share the same session');
assert.equal(advanced.zone,'Allée 3');
assert.equal(express.zone,'Express');

const a1=addInventoryLine({sessionId:advanced.id,user:manager,product});
const e1=addInventoryLine({sessionId:express.id,user:manager,product});
assert.equal(a1.ean,product.ean);
assert.equal(e1.ean,product.ean);
assert.equal(inventorySession(advanced.id).lines.length,1);
assert.equal(inventorySession(express.id).lines.length,1);

assert.throws(
 ()=>addInventoryLine({sessionId:advanced.id,user:manager,product}),
 e=>e?.code==='INVENTORY_LINE_ALREADY_EXISTS'&&e?.status===409,
 'duplicate scan inside one inventory must be explicit'
);

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const inventoryUi=readFileSync(path.join(root,'frontend/js/pages/inventory.js'),'utf8');
const appUi=readFileSync(path.join(root,'frontend/js/app.js'),'utf8');
const hubs=readFileSync(path.join(root,'frontend/js/pages/manager-hubs.js'),'utf8');
const focus=readFileSync(path.join(root,'frontend/js/manager-inventory-focus.js'),'utf8');
const repl=readFileSync(path.join(root,'frontend/js/manager-replenishment-v2.js'),'utf8');

assert.match(inventoryUi,/storeops_inventory_entry_mode/);
assert.match(inventoryUi,/requested==='NEW'/);
assert.match(inventoryUi,/data-inventory-session-id/);
assert.match(hubs,/Comptage express/);
assert.match(hubs,/Faire un inventaire/);
assert.match(hubs,/data-inventory-mode="COUNT"/);
assert.match(hubs,/data-inventory-mode="NEW"/);
assert.match(appUi,/storeops_focus_inventory_session/);
assert.match(appUi,/\['COUNT','NEW'\]/);
assert.match(repl,/sessionStorage\.setItem\(INVENTORY_ENTRY_KEY,'SESSIONS'\)/);
assert.match(focus,/dataset\.inventorySessionId===focusId/);
assert.doesNotMatch(focus,/sessions\.forEach\(s=>setVisible\(s,s===editable\)\)/);

console.log('V2.27 inventory/counting separation contract: OK');

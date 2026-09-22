import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v227-inventory.db';

const {db}=await import('../db.mjs');
const {inventoryControlQuantity,createInventorySession,addInventoryLine,countInventoryLine,explainInventoryLine,inventorySession,finalizeInventorySession}=await import('../services/inventory.mjs');
const {buildInventoryExcel}=await import('../services/operations-excel.mjs');

assert.deepEqual(inventoryControlQuantity(500,'g'),{quantity:0.5,unit:'kg',dimension:'MASS'});
assert.deepEqual(inventoryControlQuantity(-3000,'g'),{quantity:-3,unit:'kg',dimension:'MASS'});
assert.deepEqual(inventoryControlQuantity(2500,'ml'),{quantity:2.5,unit:'L',dimension:'VOLUME'});
assert.deepEqual(inventoryControlQuantity(3,'pièce'),{quantity:3,unit:'pièce',dimension:'COUNT'});

const user=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
assert(user,'manager required');
const s=createInventorySession({storeId:'val-fleuri',user,type:'TARGETED',zone:'Test V2.27'});

const g1=addInventoryLine({sessionId:s.id,user,product:{ean:'INV-G-1',productNumber:'INV-G-1',name:'Produit stock grammes 1',category:'Test',stock:6000,inventoryUnit:'g'}});
let r=countInventoryLine({lineId:g1.id,user,quantity:5500});
let l=r.lines.find(x=>x.id===g1.id);
assert.equal(l.status,'COUNTED','500 g = 0.5 kg must stay below default recount threshold 2');
assert.equal(l.final_variance,-500);
assert.equal(l.variance_control_qty,-0.5);
assert.equal(l.variance_control_unit,'kg');
r=explainInventoryLine({lineId:g1.id,user,reasonCode:'COUNT_ERROR'});

const g2=addInventoryLine({sessionId:s.id,user,product:{ean:'INV-G-2',productNumber:'INV-G-2',name:'Produit stock grammes 2',category:'Test',stock:6000,inventoryUnit:'g'}});
r=countInventoryLine({lineId:g2.id,user,quantity:3000});
l=r.lines.find(x=>x.id===g2.id);
assert.equal(l.status,'RECOUNT','3000 g = 3 kg must exceed recount threshold 2');
assert.equal(l.variance_control_qty,-3);
r=countInventoryLine({lineId:g2.id,user,quantity:0,recount:true,reasonCode:'SHRINK'});
l=r.lines.find(x=>x.id===g2.id);
assert.equal(l.final_variance,-6000);
assert.equal(l.variance_control_qty,-6);
assert.equal(l.variance_control_unit,'kg');

const pc=addInventoryLine({sessionId:s.id,user,product:{ean:'INV-PC-1',productNumber:'INV-PC-1',name:'Produit pièce',category:'Test',stock:10,inventoryUnit:'pièce'}});
r=countInventoryLine({lineId:pc.id,user,quantity:9});
l=r.lines.find(x=>x.id===pc.id);
assert.equal(l.status,'COUNTED');
assert.equal(l.variance_control_qty,-1);
assert.equal(l.variance_control_unit,'pièce');
r=explainInventoryLine({lineId:pc.id,user,reasonCode:'COUNT_ERROR'});

const hydrated=inventorySession(s.id);
assert.equal(hydrated.metrics.varianceLines,3);
assert.equal(hydrated.metrics.varianceByUnit.g,6500);
assert.equal(hydrated.metrics.varianceByUnit['pièce'],1);
assert.equal(hydrated.metrics.controlVarianceByUnit.kg,6.5);
assert.equal(hydrated.metrics.controlVarianceByUnit['pièce'],1);
assert.equal(hydrated.metrics.absoluteVarianceQty,null,'mixed units must never be summed into one raw quantity');

const done=finalizeInventorySession({sessionId:s.id,user});
assert.equal(done.session.status,'READY_TO_POST');
assert.equal(done.highVarianceLines.length,1);
assert.equal(done.highVarianceLines[0].ean,'INV-G-2','6 kg control variance must exceed incident threshold 5');

const excel=buildInventoryExcel({sessionId:s.id,user});
assert.match(excel.file.content,/Unité stock/);
assert.match(excel.file.content,/Écart contrôle/);
assert.match(excel.file.content,/Unité contrôle/);
assert.match(excel.file.content,/Écarts absolus par unité de stock/);
assert.match(excel.file.content,/6.5 kg/);
assert.doesNotMatch(excel.file.content,/Écart absolu cumulé/);

console.log('V2.27 inventory unit-aware contract: OK');

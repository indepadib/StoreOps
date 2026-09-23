import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v230-inventory-units.db';

const {db}=await import('../db.mjs');
const {
 inventoryVariancePolicyForUnit,createInventorySession,addInventoryLine,
 countInventoryLine,explainInventoryLine,inventorySession,finalizeInventorySession
}=await import('../services/inventory.mjs');

const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get()||db.prepare(`SELECT * FROM users WHERE role='store_manager' ORDER BY id LIMIT 1`).get();
assert(manager,'store manager required');

assert.equal(inventoryVariancePolicyForUnit('pièce').recountThreshold,2);
assert.equal(inventoryVariancePolicyForUnit('pièce').incidentThreshold,5);
assert.equal(inventoryVariancePolicyForUnit('g').recountThreshold,2000);
assert.equal(inventoryVariancePolicyForUnit('g').incidentThreshold,5000);
assert.equal(inventoryVariancePolicyForUnit('kg').recountThreshold,2);
assert.equal(inventoryVariancePolicyForUnit('mL').recountThreshold,2000);
assert.equal(inventoryVariancePolicyForUnit('L').incidentThreshold,5);

// A 2 g difference must not behave like a 2-piece difference.
const grams=createInventorySession({storeId:'val-fleuri',user:manager,type:'TARGETED',zone:'Fruits & légumes'});
const g1=addInventoryLine({sessionId:grams.id,user:manager,product:{ean:'V230-G1',productNumber:'V230-G1',name:'Melon test',stock:10000,inventoryUnit:'g'}});
let gSession=countInventoryLine({lineId:g1.id,user:manager,quantity:9998});
let gLine=gSession.lines.find(x=>x.id===g1.id);
assert.equal(gLine.status,'COUNTED');
assert.equal(Number(gLine.requires_recount),0);
assert.equal(gLine.variancePolicy.recountThreshold,2000);
explainInventoryLine({lineId:g1.id,user:manager,reasonCode:'COUNT_ERROR',note:'2 g seulement'});

// 2 kg expressed as 2000 g must trigger recount; 6 kg final gap must be incident-grade.
const g2=addInventoryLine({sessionId:grams.id,user:manager,product:{ean:'V230-G2',productNumber:'V230-G2',name:'Pastèque test',stock:10000,inventoryUnit:'g'}});
gSession=countInventoryLine({lineId:g2.id,user:manager,quantity:8000});
gLine=gSession.lines.find(x=>x.id===g2.id);
assert.equal(gLine.status,'RECOUNT');
assert.equal(Number(gLine.requires_recount),1);
gSession=countInventoryLine({lineId:g2.id,user:manager,quantity:4000,recount:true});
gLine=gSession.lines.find(x=>x.id===g2.id);
assert.equal(gLine.final_variance,-6000);
explainInventoryLine({lineId:g2.id,user:manager,reasonCode:'SHRINK',note:'écart confirmé'});
const final=finalizeInventorySession({sessionId:grams.id,user:manager});
assert(final.highVarianceLines.some(x=>x.id===g2.id),'6000 g gap must exceed 5 kg incident threshold');

// Mixed-unit sessions must never add grams and pieces into one fake quantity.
const mixed=createInventorySession({storeId:'val-fleuri',user:manager,type:'TARGETED',zone:'Mixte'});
const p=addInventoryLine({sessionId:mixed.id,user:manager,product:{ean:'V230-P1',productNumber:'V230-P1',name:'Produit pièce',stock:10,inventoryUnit:'pièce'}});
const g=addInventoryLine({sessionId:mixed.id,user:manager,product:{ean:'V230-G3',productNumber:'V230-G3',name:'Produit gramme',stock:5000,inventoryUnit:'g'}});
countInventoryLine({lineId:p.id,user:manager,quantity:9});
countInventoryLine({lineId:g.id,user:manager,quantity:4000});
explainInventoryLine({lineId:p.id,user:manager,reasonCode:'COUNT_ERROR'});
explainInventoryLine({lineId:g.id,user:manager,reasonCode:'COUNT_ERROR'});
const mixedView=inventorySession(mixed.id);
assert.equal(mixedView.metrics.mixedVarianceUnits,true);
assert.equal(mixedView.metrics.absoluteVarianceQty,null);
assert.equal(mixedView.metrics.varianceByUnit['pièce'],1);
assert.equal(mixedView.metrics.varianceByUnit.g,1000);

const {buildInventoryExcel}=await import('../services/operations-excel.mjs');
const workbook=buildInventoryExcel({sessionId:mixed.id,user:manager});
assert.match(workbook.file.content,/Unité stock/);
assert.match(workbook.file.content,/Écart absolu cumulé \(g\)/);
assert.match(workbook.file.content,/Écart absolu cumulé \(pièce\)/);
assert.match(workbook.file.content,/Les g, kg, mL, L et pièces ne sont jamais additionnés/);

console.log('V2.30 unit-aware inventory thresholds: OK');

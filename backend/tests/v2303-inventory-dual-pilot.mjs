import assert from 'node:assert/strict';
process.env.STOREOPS_DB=`/tmp/storeops-v2303-inventory-${process.pid}.db`;

const {db}=await import('../db.mjs');
const inv=await import('../services/inventory.mjs');
const {buildInventoryExcel}=await import('../services/operations-excel.mjs');

const pilots=[
 {storeId:'val-fleuri',userId:'u-vf',product:{ean:'V2303-PIECE',productNumber:'V2303-P',name:'Produit pièce pilote',category:'Test',stock:10,inventoryUnit:'pièce'},first:8,recount:9,expectedVariance:-1},
 {storeId:'trefle',userId:'u-tr',product:{ean:'V2303-GRAM',productNumber:'V2303-G',name:'Produit gramme pilote',category:'F&L',stock:6000,inventoryUnit:'g'},first:3000,recount:4000,expectedVariance:-2000}
];

for(const p of pilots){
 const user=db.prepare(`SELECT * FROM users WHERE id=?`).get(p.userId);
 assert(user,`manager missing for ${p.storeId}`);
 const session=inv.createInventorySession({storeId:p.storeId,user,type:'TARGETED',zone:'Test V2303',comment:'dual pilot hardening'});
 const line=inv.addInventoryLine({sessionId:session.id,user,product:p.product});
 let view=inv.countInventoryLine({lineId:line.id,user,quantity:p.first});
 let current=view.lines.find(x=>x.id===line.id);
 assert.equal(current.status,'RECOUNT',`${p.storeId} first variance must request recount`);
 assert.equal(Number(current.requires_recount),1);
 view=inv.countInventoryLine({lineId:line.id,user,quantity:p.recount,recount:true});
 current=view.lines.find(x=>x.id===line.id);
 assert.equal(Number(current.final_variance),p.expectedVariance);
 assert.equal(current.status,'COUNTED');
 view=inv.explainInventoryLine({lineId:line.id,user,reasonCode:'COUNT_ERROR',note:'écart confirmé V2303'});
 current=view.lines.find(x=>x.id===line.id);
 assert.equal(current.reason_code,'COUNT_ERROR');
 const final=inv.finalizeInventorySession({sessionId:session.id,user});
 assert.equal(final.session.status,'READY_TO_POST');
 const wb=buildInventoryExcel({sessionId:session.id,user});
 assert(wb.file?.content,'Excel inventory content required');
 assert.match(wb.file.content,/Unité stock/);
 if(p.product.inventoryUnit==='g')assert.match(wb.file.content,/>g</);
 else assert.match(wb.file.content,/pièce/);
}

const vf=inv.inventorySummary('val-fleuri'),tr=inv.inventorySummary('trefle');
assert.equal(vf.readyToPost,1);
assert.equal(tr.readyToPost,1);
console.log('V2.30.3 dual-pilot inventory workflow: OK');

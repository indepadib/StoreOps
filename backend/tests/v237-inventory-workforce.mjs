import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
process.env.STOREOPS_DB=`/tmp/storeops-v237-${process.pid}.db`;

const {db}=await import('../db.mjs');
const {createInventorySession,addInventoryLine,countInventoryLine,inventorySession}=await import('../services/inventory.mjs');
const {aggregateCashierRows}=await import('../services/dynamics-staff-performance.mjs');

const manager=db.prepare("SELECT * FROM users WHERE role='store_manager' ORDER BY id LIMIT 1").get();
assert(manager,'store manager required');

const inv=createInventorySession({storeId:'val-fleuri',user:manager,type:'TARGETED',zone:'Fruits & légumes'});
const line=addInventoryLine({sessionId:inv.id,user:manager,product:{ean:'V237-G',productNumber:'V237-G',name:'Pastèque test',stock:10000,inventoryUnit:'g'}});
let updated=countInventoryLine({lineId:line.id,user:manager,quantity:9.5,countUnit:'kg'});
let row=updated.lines.find(x=>x.id===line.id);
assert.equal(row.count1_qty,9500);
assert.equal(row.count1_input_qty,9.5);
assert.equal(row.count1_input_unit,'kg');
assert.equal(row.variance1,-500);
assert.equal(row.status,'COUNTED');

const line2=addInventoryLine({sessionId:inv.id,user:manager,product:{ean:'V237-G2',productNumber:'V237-G2',name:'Melon test',stock:10000,inventoryUnit:'g'}});
updated=countInventoryLine({lineId:line2.id,user:manager,quantity:7,countUnit:'kg'});
row=updated.lines.find(x=>x.id===line2.id);
assert.equal(row.count1_qty,7000);
assert.equal(row.status,'RECOUNT');
assert.equal(row.count1_input_unit,'kg');
assert.throws(()=>countInventoryLine({lineId:line2.id,user:manager,quantity:2,countUnit:'pièce',recount:true}),e=>e?.code==='INVENTORY_COUNT_UNIT_INCOMPATIBLE');

const cashier=aggregateCashierRows([
 {StaffId:'S01',transactionId:'T1',netAmountInclTax:-60,custAccount:'C001',businessDate:'2026-09-27',transactionStatus:''},
 {StaffId:'S01',transactionId:'T1',netAmountInclTax:-40,custAccount:'C001',businessDate:'2026-09-27',transactionStatus:''},
 {StaffId:'S01',transactionId:'T2',netAmountInclTax:-50,custAccount:'',businessDate:'2026-09-27',transactionStatus:''},
 {StaffId:'S02',transactionId:'T3',netAmountInclTax:-80,custAccount:'C002',businessDate:'2026-09-27',transactionStatus:''},
 {StaffId:'',transactionId:'T4',netAmountInclTax:-20,custAccount:'',businessDate:'2026-09-27',transactionStatus:''},
 {StaffId:'S02',transactionId:'T5',netAmountInclTax:-999,custAccount:'C003',businessDate:'2026-09-27',transactionStatus:'VOIDED'}
],{});
assert.equal(cashier.items.length,2);
const s01=cashier.items.find(x=>x.staffId==='S01');
assert.equal(s01.sales,150);
assert.equal(s01.tickets,2);
assert.equal(s01.averageBasket,75);
assert.equal(s01.identifiedTickets,1);
assert.equal(s01.identifiedTicketRate,50);
assert.equal(s01.identifiedSales,100);
assert.equal(s01.identifiedSalesShare,66.67);
assert.equal(s01.nonLoyaltyTickets,1);
assert.equal(s01.recruitments,null);
assert.equal(cashier.unassigned.rows,1);
assert.equal(cashier.unassigned.sales,20);

const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const invUi=read('frontend/js/pages/inventory.js');
const managerTeam=read('frontend/js/pages/manager-team.js');
const workforceApi=read('backend/services/workforce-api.mjs');
const salesMapping=read('backend/services/d365-sales-mapping.mjs');
const diagnostics=read('backend/services/d365-mapping-diagnostics.mjs');
assert.doesNotMatch(invUi,/countUnitOptions/);
assert.match(invUi,/Unité récupérée depuis Dynamics/);
assert.match(invUi,/D365_COUNTING_JOURNAL/);
assert.match(managerTeam,/cashier-performance/);
assert.match(managerTeam,/Recrutement à connecter/);
assert.match(workforceApi,/cashier-performance/);
assert.match(salesMapping,/'customer','staff'/);
assert.match(diagnostics,/staff:\['staffid'/);
console.log('V2.37 inventory PDA + workforce analytics contract: OK');

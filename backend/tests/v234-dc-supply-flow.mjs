import assert from 'node:assert/strict';
process.env.STOREOPS_DB=`/tmp/storeops-v234-dc-flow-${process.pid}.db`;
const {db}=await import('../db.mjs');
const {createReplenishmentRequestFromContext,transitionReplenishmentRequest}=await import('../services/replenishment-requests.mjs');

const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
db.prepare(`INSERT OR IGNORE INTO users(id,name,role,store_id,active,permissions_profile) VALUES('u-supply-test','Appro Test','employee',NULL,1,'supply_chain')`).run();
const supply=db.prepare(`SELECT * FROM users WHERE id='u-supply-test'`).get();
const context={
 storeId:'val-fleuri',businessDate:'2026-09-28',ean:'6110000000001',
 item:{productNumber:'DC-TEST-001',name:'Article DC test',unit:'pièce'},
 merchandising:{assortment:{status:'ASSORTED'}},
 storeStock:{availableStock:0},supplyStock:{warehouseId:'LVE Lakhya',availableStock:0},
 sourcing:{supplyMode:'WAREHOUSE',primaryVendorAccount:'V-DC'},pricing:{},
 replenishment:{decision:'DC_BACKORDER',recommendedQty:12,actionQty:12,reason:'LVE à 0',metrics:{},salesVelocity:{dailySales7:6},appliedRules:[],policy:{},policySource:{},configuredPromoFactor:1,promotionFactorApplied:false}
};
const req=createReplenishmentRequestFromContext({storeId:'val-fleuri',context,user:manager});
assert.equal(req.status,'REQUESTED');
assert.equal(req.requested_qty,12);
assert.equal(req.source_warehouse_id,'LVE Lakhya');
assert.equal(req.recommendationSnapshot.decision,'DC_BACKORDER');

const approved=transitionReplenishmentRequest({id:req.id,user:supply,action:'APPROVE'});
assert.equal(approved.status,'APPROVED');
assert.equal(approved.approved_by,'u-supply-test');
const sent=transitionReplenishmentRequest({id:req.id,user:supply,action:'SEND',externalReference:'PO-LVE-TEST'});
assert.equal(sent.status,'SENT');
assert.equal(sent.external_reference,'PO-LVE-TEST');
console.log('V2.34 DC store → Supply workflow: OK');

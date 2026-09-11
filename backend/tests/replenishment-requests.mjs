import assert from 'node:assert/strict';
import {db,todayISO} from '../db.mjs';
import {createReplenishmentRequestFromContext,replenishmentRequest,transitionReplenishmentRequest,listReplenishmentRequests} from '../services/replenishment-requests.mjs';

db.prepare(`DELETE FROM replenishment_request_events`).run();
db.prepare(`DELETE FROM replenishment_requests`).run();
const director=db.prepare(`SELECT * FROM users WHERE role='ops_director' LIMIT 1`).get();
const manager=db.prepare(`SELECT * FROM users WHERE role='store_manager' AND store_id='val-fleuri' LIMIT 1`).get();
const store=db.prepare(`SELECT * FROM stores WHERE id='val-fleuri'`).get();
assert.ok(director&&manager&&store,'pilot seed must expose director, Val Fleuri manager and store');

const context={
 storeId:store.id,businessDate:todayISO(),ean:'6111069004350',
 item:{productNumber:'HS-000312',name:'APRES REPAS SULTAN',unit:'PC'},
 pricing:{basePrice:20.95,expectedUnitPrice:20.95,promoLabel:null},
 merchandising:{assortment:{status:'ASSORTED'},taxonomy:[{category_id:'EPICERIE',category_name:'Epicerie'}]},
 storeStock:{warehouseId:'FRP0001',availableStock:3,physicalStock:3,incomingStock:0},
 supplyStock:{warehouseId:'WH-CENTRAL',availableStock:120,physicalStock:120,mappingRequired:false},
 replenishment:{
  decision:'REPLENISH',recommendedQty:12,actionQty:12,reason:'Couverture sous cible',
  metrics:{dailyVelocity:4,targetDays:3,targetDemand:12,rawNeed:9},
  salesVelocity:{status:'READY',dailySales7:4.2,dailySales28:3.6},
  policy:{leadTimeDays:2,safetyDays:1,packSize:6,minOrderQty:0,promoFactor:1,dayOfWeekFactor:1},
  policySource:{leadTimeDays:{type:'STORE',label:'Val Fleuri'},packSize:{type:'ITEM',label:'Colisage article'}},
  appliedRules:[{id:'rule-store',name:'Val Fleuri',scopeType:'STORE'},{id:'rule-item',name:'Colisage article',scopeType:'ITEM'}],
  configuredPromoFactor:1.3,promotionFactorApplied:false
 }
};

let request=createReplenishmentRequestFromContext({storeId:store.id,context,user:manager});
assert.equal(request.status,'REQUESTED');
assert.equal(request.requested_qty,12);
assert.equal(request.source_warehouse_id,'WH-CENTRAL');
assert.equal(request.recommendationSnapshot.actionQty,12);
assert.equal(request.policySnapshot.policy.packSize,6);
assert.equal(request.events.length,1);

let duplicate=false;
try{createReplenishmentRequestFromContext({storeId:store.id,context,user:manager})}catch(e){duplicate=e.code==='REPLENISHMENT_REQUEST_EXISTS'}
assert.equal(duplicate,true,'an open item request must not be duplicated');

let managerApprovalBlocked=false;
try{transitionReplenishmentRequest({id:request.id,user:manager,action:'APPROVE'})}catch(e){managerApprovalBlocked=/Direction/.test(e.message)}
assert.equal(managerApprovalBlocked,true,'store manager must not approve own replenishment request');

request=transitionReplenishmentRequest({id:request.id,user:director,action:'APPROVE',note:'Besoin validé'});
assert.equal(request.status,'APPROVED');
assert.equal(request.approved_by,director.id);

let fakeSendBlocked=false;
try{transitionReplenishmentRequest({id:request.id,user:director,action:'SEND'})}catch(e){fakeSendBlocked=e.code==='REPLENISHMENT_EXTERNAL_REF_REQUIRED'}
assert.equal(fakeSendBlocked,true,'StoreOps must never claim ERP/Dynamics send without a real external reference');

request=transitionReplenishmentRequest({id:request.id,user:director,action:'SEND',externalReference:'TO-REAL-0001'});
assert.equal(request.status,'SENT');
assert.equal(request.external_reference,'TO-REAL-0001');

request=transitionReplenishmentRequest({id:request.id,user:manager,action:'RECEIVE',receivedQty:5});
assert.equal(request.status,'PARTIAL_RECEIVED');
assert.equal(request.received_qty,5);
assert.equal(request.remainingQty,7);

let overReceive=false;
try{transitionReplenishmentRequest({id:request.id,user:manager,action:'RECEIVE',receivedQty:8})}catch(e){overReceive=/reliquat/.test(e.message)}
assert.equal(overReceive,true,'received quantity cannot exceed request remainder');

request=transitionReplenishmentRequest({id:request.id,user:manager,action:'RECEIVE',receivedQty:7});
assert.equal(request.status,'RECEIVED');
assert.equal(request.received_qty,12);
assert.equal(request.remainingQty,0);
assert.ok(request.received_at);
assert.ok(request.events.length>=5);

let overrideBlocked=false;
try{createReplenishmentRequestFromContext({storeId:store.id,context,user:manager,quantity:18})}catch(e){overrideBlocked=e.code==='REPLENISHMENT_OVERRIDE_REASON_REQUIRED'}
assert.equal(overrideBlocked,true,'manual quantity override must require a reason');

const overridden=createReplenishmentRequestFromContext({storeId:store.id,context,user:manager,quantity:18,overrideReason:'TG événement week-end'});
assert.equal(overridden.requested_qty,18);
assert.equal(overridden.override_reason,'TG événement week-end');
const cancelled=transitionReplenishmentRequest({id:overridden.id,user:manager,action:'CANCEL',note:'Besoin annulé'});
assert.equal(cancelled.status,'CANCELLED');

const all=listReplenishmentRequests({storeId:store.id});
assert.equal(all.length,2);
assert.equal(replenishmentRequest(request.id).external_reference,'TO-REAL-0001');

console.log('StoreOps V1.80 replenishment request lifecycle contracts passed');

import assert from 'node:assert/strict';
import {buildMaintenanceIncident,maintenanceSummary} from '../../frontend/js/maintenance-model.js';

let p=buildMaintenanceIncident({equipmentType:'TPE',equipmentId:'TPE 04',issue:'Ne démarre plus',impact:'CHECKOUT'});
assert.equal(p.category,'TECHNICAL');
assert.equal(p.blockingLevel,'TRANSACTION');
assert.equal(p.criticality,'HIGH');
assert.equal(p.requiresEvidence,true);
assert.match(p.title,/TPE.*TPE 04.*Ne démarre plus/);
p=buildMaintenanceIncident({equipmentType:'ALARM',issue:'Défaut centrale',impact:'OPENING'});
assert.equal(p.blockingLevel,'STORE_OPENING');
assert.equal(p.criticality,'CRITICAL');
let missing=false;try{buildMaintenanceIncident({equipmentType:'POS',issue:'',impact:'DEGRADED'})}catch{missing=true}assert.equal(missing,true);
const s=maintenanceSummary([
 {category:'TECHNICAL',status:'OPEN',title:'TPE · TPE 04 · panne',criticality:'CRITICAL',blocking_level:'TRANSACTION',is_overdue:true},
 {category:'TECHNICAL',status:'OPEN',title:'TPE · TPE 03 · panne',criticality:'HIGH',blocking_level:'PROCESS',is_overdue:false},
 {category:'TECHNICAL',status:'RESOLVED',title:'Réseau · baie · panne',criticality:'HIGH',blocking_level:'PROCESS'},
 {category:'QUALITY',status:'OPEN',title:'Qualité',criticality:'CRITICAL',blocking_level:'PROCESS'}
]);
assert.equal(s.openCount,2);assert.equal(s.critical,1);assert.equal(s.blocking,2);assert.equal(s.overdue,1);assert.deepEqual(s.topEquipment,['TPE',2]);
console.log('StoreOps V1.30 maintenance model tests passed');

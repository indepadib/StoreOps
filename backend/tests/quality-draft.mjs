import assert from 'node:assert/strict';
import {validateQualityDraft,temperatureAssessment} from '../../frontend/js/quality-draft.js';

const fresh={temperature_required:1,temp_min:0,temp_max:4,packaging_required:1,appearance_required:1,expiry_required:1,lot_required:0};
let issues=validateQualityDraft({context:'Contrôle rayon',deliveredQty:10,acceptedQty:10,rejectedQty:0,temperature:3,packagingStatus:'OK',appearanceStatus:'OK',expiryDate:'2026-09-10',lotRef:''},fresh);
assert.deepEqual(issues,[]);
issues=validateQualityDraft({context:'Contrôle rayon',deliveredQty:10,acceptedQty:9,rejectedQty:0,temperature:null,packagingStatus:'NA',appearanceStatus:'NA',expiryDate:null,lotRef:''},fresh);
assert.ok(issues.some(x=>x.includes('Accepté + refusé')));
assert.ok(issues.some(x=>x.includes('Température')));
assert.ok(issues.some(x=>x.includes('Conditionnement')));
assert.ok(issues.some(x=>x.includes('Aspect')));
assert.ok(issues.some(x=>x.includes('DLC')));
let t=temperatureAssessment(3,fresh);assert.equal(t.ok,true);assert.equal(t.min,0);assert.equal(t.max,4);
t=temperatureAssessment(7,fresh);assert.equal(t.ok,false);
console.log('StoreOps V1.26 quality draft validation tests passed');

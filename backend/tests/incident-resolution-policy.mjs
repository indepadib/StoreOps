import assert from 'node:assert/strict';
import {autoResolutionDecision} from '../services/incident-resolution-policy.mjs';

assert.deepEqual(autoResolutionDecision({requiresEvidence:false,openActions:0,evidenceCount:0}),{canResolve:true,reason:null,openActions:0,evidenceCount:0});
assert.deepEqual(autoResolutionDecision({requiresEvidence:true,openActions:0,evidenceCount:0}),{canResolve:false,reason:'EVIDENCE_REQUIRED',openActions:0,evidenceCount:0});
assert.deepEqual(autoResolutionDecision({requiresEvidence:true,openActions:0,evidenceCount:1}),{canResolve:true,reason:null,openActions:0,evidenceCount:1});
assert.deepEqual(autoResolutionDecision({requiresEvidence:false,openActions:2,evidenceCount:4}),{canResolve:false,reason:'ACTIONS_OPEN',openActions:2,evidenceCount:4});
assert.deepEqual(autoResolutionDecision({requiresEvidence:true,openActions:1,evidenceCount:0}),{canResolve:false,reason:'ACTIONS_OPEN',openActions:1,evidenceCount:0});
console.log('StoreOps V1.29 evidence-safe incident resolution policy tests passed');

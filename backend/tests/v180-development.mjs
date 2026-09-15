import assert from 'node:assert/strict';
import '../services/pilot-profile.mjs';
import { db } from '../db.mjs';
import { createAccessAccount,accessProfiles } from '../services/access-management.mjs';
import { canAccessDevelopment } from '../services/permissions.mjs';
import { createDevelopmentProject,developmentProject,updateDevelopmentProject,setDevelopmentMilestone,setDevelopmentStage } from '../services/development.mjs';

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
assert(admin,'Admin StoreOps must exist');
assert(accessProfiles().some(x=>x.code==='DEVELOPMENT'&&x.scope==='NETWORK'),'Development access profile must be available');

const dev=createAccessAccount({actor:admin,name:'User Development Test',emailAddress:'development.test@oneretail.ma',profileCode:'DEVELOPMENT'});
assert.equal(dev.profileCode,'DEVELOPMENT');
assert.equal(dev.storeId,null);
const devRow=db.prepare(`SELECT * FROM users WHERE id=?`).get(dev.id);
assert.equal(devRow.permissions_profile,'development');
assert.equal(canAccessDevelopment(devRow),true);

const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
assert.equal(canAccessDevelopment(manager),false,'Store manager must not access Development');

const project=createDevelopmentProject({user:devRow,input:{name:'Franprix Test Development',city:'Casablanca',zone:'Racine',surfaceM2:420,monthlyRent:72000,capexBudget:1800000,targetOpeningDate:'2026-12-15',ownerUserId:devRow.id,sourceLead:'Agent immobilier'}});
assert.equal(project.stage,'SOURCING');
assert(project.milestones.length>=22);
assert(project.milestones.some(x=>x.code==='CONTRACT_SIGNED'));
assert(project.milestones.some(x=>x.code==='WORKS_STARTED'));
assert(project.milestones.some(x=>x.code==='IT_POS_READY'));

assert.throws(()=>setDevelopmentStage({user:devRow,id:project.id,stage:'QUALIFICATION'}),e=>e.code==='DEVELOPMENT_STAGE_GATE_BLOCKED');
let updated=setDevelopmentMilestone({user:devRow,id:project.id,code:'SITE_SOURCED',status:'DONE',note:'Local validé pour étude'});
updated=setDevelopmentMilestone({user:devRow,id:project.id,code:'FIRST_VISIT_DONE',status:'DONE'});
updated=setDevelopmentStage({user:devRow,id:project.id,stage:'QUALIFICATION'});
assert.equal(updated.stage,'QUALIFICATION');

for(const code of ['FEASIBILITY_APPROVED','CATCHMENT_VALIDATED','FINANCIAL_MODEL_APPROVED','GO_DECISION_APPROVED'])updated=setDevelopmentMilestone({user:devRow,id:project.id,code,status:'DONE'});
assert.throws(()=>setDevelopmentStage({user:devRow,id:project.id,stage:'NEGOTIATION'}),e=>e.code==='DEVELOPMENT_STAGE_GATE_BLOCKED');
updated=updateDevelopmentProject({user:devRow,id:project.id,input:{decision:'GO'}});
updated=setDevelopmentStage({user:devRow,id:project.id,stage:'NEGOTIATION'});
assert.equal(updated.stage,'NEGOTIATION');

updated=setDevelopmentMilestone({user:devRow,id:project.id,code:'DEAL_AGREED',status:'DONE'});
updated=setDevelopmentStage({user:devRow,id:project.id,stage:'CONTRACT',note:'Conditions validées, passage à la signature'});
assert.equal(updated.stage,'CONTRACT');
updated=setDevelopmentMilestone({user:devRow,id:project.id,code:'LEGAL_DUE_DILIGENCE_DONE',status:'DONE'});
updated=setDevelopmentMilestone({user:devRow,id:project.id,code:'CONTRACT_SIGNED',status:'DONE'});
assert.equal(updated.milestones.find(x=>x.code==='CONTRACT_SIGNED').status,'DONE');
updated=setDevelopmentStage({user:devRow,id:project.id,stage:'WORKS'});
updated=setDevelopmentMilestone({user:devRow,id:project.id,code:'WORKS_STARTED',status:'DONE'});
assert.equal(updated.stage,'WORKS');
assert(updated.history.some(x=>x.event_type==='STAGE_CHANGED'));
assert(developmentProject(project.id)?.history.length>=10);

console.log('V1.80 development restricted access + V1.83 gated pipeline regression OK');

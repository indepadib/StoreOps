import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-development-expansion-procedure.db';

const {db}=await import('../db.mjs');
const {createDevelopmentProject,updateDevelopmentProject,setDevelopmentMilestone,setDevelopmentStage,developmentProject}=await import('../services/development.mjs');
const {canAccessDevelopment}=await import('../services/permissions.mjs');

for(const t of ['development_history','development_milestones','development_projects'])db.prepare(`DELETE FROM ${t}`).run();
if(!db.prepare(`SELECT id FROM users WHERE id='u-admin'`).get())db.prepare(`INSERT INTO users(id,name,role,active) VALUES('u-admin','Admin StoreOps','ops_director',1)`).run();
const actor={id:'u-admin',role:'ops_director',permissions_profile:'platform_admin'};
assert.equal(canAccessDevelopment(actor),true);

let p=createDevelopmentProject({user:actor,input:{
 name:'Franprix Racine',city:'Casablanca',brand:'FRANPRIX',zone:'Racine',
 surfaceM2:430,monthlyRent:85000,targetOpeningDate:'2026-12-15',
 sourceLead:'Relais réseau',conflictOfInterest:false
}});
assert.equal(p.stage,'CRITERIA');
assert(p.milestones.some(x=>x.code==='COMMITTEE_OPINION_RECORDED'));
assert(p.milestones.some(x=>x.code==='BP_DG_APPROVED'));
assert(p.milestones.some(x=>x.code==='TECHNICAL_FEASIBILITY_APPROVED'));
assert(p.milestones.some(x=>x.code==='HANDOVER_PACK_COMPLETE'));

const complete=(...codes)=>{for(const code of codes)p=setDevelopmentMilestone({user:actor,id:p.id,code,status:'DONE'});};

assert.throws(()=>setDevelopmentStage({user:actor,id:p.id,stage:'SOURCING'}),e=>e.code==='DEVELOPMENT_STAGE_GATE_BLOCKED');
complete('CRITERIA_CONFIRMED','CANNIBALIZATION_RULE_CHECKED');
p=setDevelopmentStage({user:actor,id:p.id,stage:'SOURCING'});
complete('OPPORTUNITY_REGISTERED','SOURCE_AND_INTEREST_DECLARED','SITE_PACK_MINIMUM','TITLE_DEED_PRECHECK');
p=setDevelopmentStage({user:actor,id:p.id,stage:'QUALIFICATION'});
complete('DESK_SCREENING_DONE','WEIGHTED_SCORECARD_DONE','QUALIFICATION_VISIT_DONE','SITE_ANALYSIS_COMPLETE');
p=setDevelopmentStage({user:actor,id:p.id,stage:'NEGOTIATION'});
complete('RENTAL_TERMS_NEGOTIATED','NEGOTIATION_SHEET_COMPLETE','NO_PREMATURE_COMMITMENT');
p=setDevelopmentStage({user:actor,id:p.id,stage:'COMMITTEE'});
complete('COMMITTEE_PACK_COMPLETE','COMMITTEE_OPINION_RECORDED','COMMITTEE_RESERVATIONS_CLEARED');
p=setDevelopmentStage({user:actor,id:p.id,stage:'BUSINESS_PLAN'});
complete('BP_INPUTS_COMPLETE','OPERATIONS_OPINION_RECORDED','BP_CONTROL_APPROVED','BP_DAF_REVIEWED','BP_DG_APPROVED');
p=setDevelopmentStage({user:actor,id:p.id,stage:'LEGAL_TECHNICAL'});
complete('LEGAL_DUE_DILIGENCE_DONE','TECHNICAL_FEASIBILITY_APPROVED','BLOCKING_RESERVATIONS_CLEARED');
p=setDevelopmentStage({user:actor,id:p.id,stage:'FINAL_DECISION'});
complete('FINAL_FILE_COMPLETE','DG_COMMITMENT_AUTHORIZED','CONTRACT_SIGNED','QHSE_NOTIFIED');
p=updateDevelopmentProject({user:actor,id:p.id,input:{decision:'GO'}});
p=setDevelopmentStage({user:actor,id:p.id,stage:'CLOSING_HANDOVER'});
complete('KEYS_AND_CLOSING_COMPLETE','HANDOVER_PACK_COMPLETE','HANDOVER_DEADLINE_RESPECTED','ARCHIVE_COMPLETE');

p=developmentProject(p.id);
assert.equal(p.stage,'CLOSING_HANDOVER');
assert.equal(p.bp_status,'DG_APPROVED');
assert.equal(p.legal_status,'APPROVED');
assert.equal(p.technical_status,'APPROVED');
assert.equal(p.decision,'GO');
assert(p.history.some(x=>x.event_type==='STAGE_CHANGED'));
console.log('Development Expansion procedure gated workflow: OK');

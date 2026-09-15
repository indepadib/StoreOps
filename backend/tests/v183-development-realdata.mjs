import assert from 'node:assert/strict';
process.env.STOREOPS_DB='/tmp/storeops-v183-development-realdata.db';

const {db}=await import('../db.mjs');
const {createDevelopmentProject,updateDevelopmentProject,setDevelopmentMilestone,setDevelopmentStage,developmentProject}=await import('../services/development.mjs');
const {canAccessDevelopment}=await import('../services/permissions.mjs');
const {networkOperationalSettings,saveNetworkOperationalSettings,storeOperationalSettings,saveStoreOperationalSettings}=await import('../services/store-settings.mjs');

for(const t of ['development_history','development_milestones','development_projects','store_operational_settings','network_operational_settings_history','network_operational_settings'])db.prepare(`DELETE FROM ${t}`).run();
if(!db.prepare(`SELECT id FROM users WHERE id='u-admin'`).get())db.prepare(`INSERT INTO users(id,name,role,active) VALUES('u-admin','Admin StoreOps','ops_director',1)`).run();
const actor={id:'u-admin',role:'ops_director',permissions_profile:'platform_admin'};

assert.equal(canAccessDevelopment(actor),true);
assert.equal(canAccessDevelopment({id:'u-dev',role:'employee',permissions_profile:'development'}),true);
assert.equal(canAccessDevelopment({id:'u-store',role:'store_manager'}),false);

let p=createDevelopmentProject({user:actor,input:{name:'Franprix Racine',city:'Casablanca',zone:'Racine',surfaceM2:430,monthlyRent:85000,capexBudget:2400000,targetOpeningDate:'2026-12-15',nextAction:'Visite technique',nextActionDueDate:'2026-09-20',priority:'HIGH'}});
assert.equal(p.stage,'SOURCING');
assert.equal(p.decision,'PENDING');
assert.equal(p.stageReadiness.ready,false);
assert(p.milestones.length>=20);

assert.throws(()=>setDevelopmentStage({user:actor,id:p.id,stage:'QUALIFICATION'}),e=>e.code==='DEVELOPMENT_STAGE_GATE_BLOCKED');
setDevelopmentMilestone({user:actor,id:p.id,code:'SITE_SOURCED',status:'DONE'});
setDevelopmentMilestone({user:actor,id:p.id,code:'FIRST_VISIT_DONE',status:'DONE'});
p=setDevelopmentStage({user:actor,id:p.id,stage:'QUALIFICATION'});
assert.equal(p.stage,'QUALIFICATION');

for(const code of ['FEASIBILITY_APPROVED','CATCHMENT_VALIDATED','FINANCIAL_MODEL_APPROVED','GO_DECISION_APPROVED'])setDevelopmentMilestone({user:actor,id:p.id,code,status:'DONE'});
assert.throws(()=>setDevelopmentStage({user:actor,id:p.id,stage:'NEGOTIATION'}),e=>e.code==='DEVELOPMENT_STAGE_GATE_BLOCKED');
p=updateDevelopmentProject({user:actor,id:p.id,input:{decision:'GO',siteScore:88,economicScore:81,capexCommitted:1200000,capexActual:0,worksProgress:0}});
assert.equal(p.decision,'GO');
assert.equal(p.site_score,88);
p=setDevelopmentStage({user:actor,id:p.id,stage:'NEGOTIATION'});
assert.equal(p.stage,'NEGOTIATION');

p=updateDevelopmentProject({user:actor,id:p.id,input:{blocker:'Attente projet de bail',priority:'CRITICAL'}});
assert.equal(p.risk.code,'BLOCKED');
assert.equal(p.priority,'CRITICAL');
p=updateDevelopmentProject({user:actor,id:p.id,input:{blocker:'',worksProgress:45,capexActual:900000}});
assert.equal(p.works_progress,45);
assert.equal(p.capex_actual,900000);

let network=networkOperationalSettings();
assert.equal(network.suggestedSupplyWarehouseId,'LVE Lakhya');
assert.match(network.suggestedSupplyWarehouseName,/Lakhyayata/);
network=saveNetworkOperationalSettings({user:actor,defaultSupplyWarehouseId:'LVE Lakhya'});
assert.equal(network.defaultSupplyWarehouseId,'LVE Lakhya');

let store=storeOperationalSettings('val-fleuri');
assert.equal(store.storeWarehouseId,'FRP0001');
assert.equal(store.d365.storeNumber,'FRP0001');
assert.equal(store.d365.retailChannelId,'10001');
assert.equal(store.d365.operatingUnitNumber,'00000063');
assert.equal(store.d365.legalEntityId,'5001');
store=saveStoreOperationalSettings({storeId:'val-fleuri',user:actor,storeWarehouseId:'FRP0001',d365StoreNumber:'FRP0001',d365RetailChannelId:'10001',d365OperatingUnitNumber:'00000063',d365LegalEntityId:'5001'});
assert.equal(store.d365.source,'STOREOPS_CONFIG');
assert.equal(store.supplyWarehouseId,'LVE Lakhya');
assert.equal(store.supplyWarehouseSource,'NETWORK_DEFAULT');

assert.equal(developmentProject(p.id)?.name,'Franprix Racine');
console.log('V1.83 development + confirmed One Retail mapping contract: OK');

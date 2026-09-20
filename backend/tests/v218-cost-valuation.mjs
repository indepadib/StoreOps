import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB=`/tmp/storeops-v218-cost-${process.pid}.db`;
process.env.STOREOPS_MEDIA_DIR=`/tmp/storeops-v218-cost-media-${process.pid}`;
process.env.D365_MODE='live';
process.env.D365_BASE_URL='https://example.operations.dynamics.com';
process.env.D365_TENANT_ID='tenant';
process.env.D365_CLIENT_ID='client';
process.env.D365_CLIENT_SECRET='secret';
process.env.D365_DATA_AREA_ID='5001';

globalThis.fetch=async url=>{
 const u=String(url);
 if(u.includes('login.microsoftonline.com'))return new Response(JSON.stringify({access_token:'token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
 if(u.includes('/data/CustomCostEntity'))return new Response(JSON.stringify({value:[
  {dataAreaId:'5001',SKU:'HS-COST',Amount:120,StartDate:'2026-01-01T00:00:00Z',Currency:'MAD',CostQty:10,Rec:'1'}
 ]}),{status:200,headers:{'content-type':'application/json'}});
 throw new Error('Unexpected URL '+u)
};

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {
 saveD365CostMappingDraft,d365CostMappingSettings,evaluateD365CostSmokeRows,smokeD365CostMapping,
 activateD365CostMapping,disableD365CostMapping
}=await import('../services/d365-cost-mapping.mjs');
const {getProductCost,costIntegrationConfig}=await import('../services/dynamics-cost.mjs');
const {createLossRecord,lossSummary}=await import('../services/loss.mjs');

const actor=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE role='ops_director' ORDER BY id LIMIT 1`).get();
const manager=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get()||db.prepare(`SELECT * FROM users WHERE role='store_manager' ORDER BY id LIMIT 1`).get();
assert(actor,'admin required');assert(manager,'manager required');
db.prepare(`DELETE FROM d365_cost_mapping_settings`).run();

const mapping={entity:'CustomCostEntity',fields:{item:'SKU',cost:'Amount',validFrom:'StartDate',validTo:'',currency:'Currency',warehouse:'',site:'',unit:'',quantity:'CostQty',recordId:'Rec'}};
let saved=saveD365CostMappingDraft({actor,input:mapping});
assert.equal(saved.state,'DRAFT');
assert.throws(()=>activateD365CostMapping({actor}),e=>e.code==='D365_COST_MAPPING_NOT_VALIDATED');

const smoke=evaluateD365CostSmokeRows({rows:[{SKU:'HS-COST',Amount:120,StartDate:'2026-01-01T00:00:00Z',Currency:'MAD',CostQty:10}],mapping,productNumber:'HS-COST'});
assert.equal(smoke.status,'PASSED');
assert.equal(smoke.matchingRows,1);

saved=await smokeD365CostMapping({actor,productNumber:'HS-COST'});
assert.equal(saved.state,'VALIDATED');
assert.equal(saved.smoke.status,'PASSED');
saved=activateD365CostMapping({actor});
assert.equal(saved.state,'LIVE');
assert.equal(costIntegrationConfig('val-fleuri').ready,true);

const cost=await getProductCost('val-fleuri','HS-COST',{businessDate:'2026-09-20'});
assert.equal(cost.status,'READY');
assert.equal(cost.unitCost,12);
assert.equal(cost.currency,'MAD');
assert.match(cost.source,/CustomCostEntity/);

const loss=createLossRecord({
 storeId:'val-fleuri',businessDate:'2026-09-20',user:manager,
 product:{ean:'6110000000218',productNumber:'HS-COST',name:'Article coût test',category:'Test',price:20,unitCost:cost.unitCost,costSource:cost.source,costState:cost.status},
 reasonCode:'BREAKAGE',quantity:3,unit:'pièce',note:'V2.18 test'
});
assert.equal(loss.unit_retail_value,20);
assert.equal(loss.total_retail_value,60);
assert.equal(loss.unit_cost_value,12);
assert.equal(loss.total_cost_value,36);
assert.equal(loss.cost_state,'READY');

const summary=lossSummary('val-fleuri','2026-09-20');
assert.equal(summary.costValue,36);
assert.equal(summary.costValuedRecords,1);
assert.equal(summary.costUnvaluedRecords,0);
assert.equal(summary.costCoverage,100);

saved=disableD365CostMapping({actor});
assert.equal(saved.state,'DISABLED');
assert.equal(d365CostMappingSettings().state,'DISABLED');

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const lossesUi=readFileSync(path.join(root,'frontend/js/pages/losses.js'),'utf8');
const todayUi=readFileSync(path.join(root,'frontend/js/pages/today.js'),'utf8');
const adminUi=readFileSync(path.join(root,'frontend/js/admin-cost-mapping.js'),'utf8');
assert.match(lossesUi,/Valeur au coût/);
assert.match(lossesUi,/Coût non disponible/);
assert.match(todayUi,/au coût/);
assert.match(adminUi,/Activer coût LIVE/);
assert.match(adminUi,/entity:saved\.entity\|\|''/,'cost entity must start empty until a real D365 mapping is supplied');
assert.match(adminUi,/cost:saved\.fields\?\.cost\|\|''/,'cost field must start empty until a real D365 mapping is supplied');

console.log('V2.18 cost valuation contract: OK');

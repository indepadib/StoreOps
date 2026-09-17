import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v187-stabilization.db';
process.env.STOREOPS_REAL_ONLY='true';
process.env.STOREOPS_STAFFING_SOURCE='storeops';
process.env.D365_MODE='live';
process.env.D365_PRODUCT_READ_MODE='live';
process.env.D365_PRICE_READ_MODE='live';
process.env.D365_PROMOTION_READ_MODE='simulated';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=p=>readFileSync(path.join(root,p),'utf8');
const {db}=await import('../db.mjs');
const workforce=await import('../services/workforce.mjs');
const {getStaffingSnapshot}=await import('../services/dynamics-staffing.mjs');
const staffing=await import('../services/staffing.mjs');
const {syncCommercialControls}=await import('../services/commercial.mjs');
const receiving=await import('../services/dynamics-receiving.mjs');
const {handleProcessStudioApi}=await import('../services/process-studio-api.mjs');

const admin=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get();
assert(admin,'platform admin seed required');
const storeId='val-fleuri';
const day='2026-09-17';

// Workforce -> published planning -> staffing source.
db.prepare(`DELETE FROM work_shifts WHERE store_id=? AND shift_date=?`).run(storeId,day);
const code=`TST-${Date.now()}`;
let employee=workforce.createEmployee({storeId,user:admin,employeeCode:code,firstName:'Sara',lastName:'Responsable',roleCode:'MANAGER',contractType:'CDI',contractStart:'2026-09-01',email:'sara.manager@example.test'});
assert.equal(employee.role_code,'MANAGER');
employee=workforce.updateEmployee({employeeId:employee.id,user:admin,firstName:'Sara',lastName:'Responsable Magasin',roleCode:'MANAGER',contractType:'CDI',email:'sara.manager@example.test',status:'ACTIVE'});
assert.match(employee.display_name,/Responsable Magasin/);
let shift=workforce.createShift({storeId,user:admin,employeeId:employee.id,shiftDate:day,startTime:'08:00',endTime:'16:00'});
assert.equal(shift.status,'DRAFT');
shift=workforce.setShiftStatus({shiftId:shift.id,user:admin,status:'PUBLISHED'});
assert.equal(shift.status,'PUBLISHED');
const staffSnapshot=await getStaffingSnapshot(storeId,day);
assert.equal(staffSnapshot.source,'STOREOPS_SHIFTS');
assert(staffSnapshot.lines.some(x=>x.employeeId===employee.id&&x.role==='MANAGER'));
const staffDay=staffing.syncStaffingDay({storeId,businessDate:day,snapshot:staffSnapshot});
assert(staffDay.lines.some(x=>x.employee_id===employee.id));

// Real-only commercial must never accept the historical demo payload.
assert.throws(()=>syncCommercialControls({storeId,businessDate:day,changes:[{sourceKey:'PROMO-NUT750-X',source:'SIMULATED_D365',actionType:'PROMO_START',ean:'3017620422003',productName:'Nutella démo'}]}),e=>e.code==='COMMERCIAL_REAL_SOURCE_REQUIRED');

// Real-only receipts must not surface old StoreOps/demo rows as D365 purchase orders.
receiving.ensureReceivingStorage();
const legacyId=`legacy-${Date.now()}`;
db.prepare(`INSERT INTO receipts(id,store_id,po_number,vendor,eta,status,source) VALUES(?,?,?,?,?,'EXPECTED','STOREOPS')`).run(legacyId,storeId,`LEGACY-${Date.now()}`,'Démo fournisseur',day);
assert.equal(receiving.listReceiptsForStore(storeId,{realOnly:true}).some(x=>x.id===legacyId),false);

// Template library is materialized as inactive/editable templates, never assigned automatically.
const getReq={method:'GET'};
const tplResponse=await handleProcessStudioApi({req:getReq,url:new URL('http://local/api/admin/process-templates?all=1'),user:admin});
assert.equal(tplResponse.status,200);
assert(tplResponse.data.starterCount>=8);
const starter=tplResponse.data.items.find(x=>x.code==='LIB_RECEIVING_STANDARD');
assert(starter,'starter receiving template must exist');
assert.equal(starter.active,false,'starter templates must stay inactive until an admin publishes them');
assert.equal(db.prepare(`SELECT COUNT(*) n FROM process_assignments WHERE template_id=?`).get(starter.id).n,0,'starter templates must not auto-assign stores');

// Static contracts for the actual regressions reported by the user.
const apiClient=source('frontend/js/api.js');
assert.match(apiClient,/isPlainJsonBody/,'central API client must serialize object JSON bodies');
assert.match(apiClient,/JSON\.stringify\(next\.body\)/,'object body serialization missing');
const workforceApi=source('backend/services/workforce-api.mjs');
assert.match(workforceApi,/handleOpeningOperationsApi/,'opening operation routes must stay wired');
assert.match(workforceApi,/handleReceivingReadApi/,'real PO feed must stay wired');
assert.match(workforceApi,/updateEmployee/,'employee editing route must stay wired');
const staffingPage=source('frontend/js/pages/staffing.js');
assert.match(staffingPage,/Aucun planning publié aujourd’hui/,'staffing empty state missing');
assert.match(staffingPage,/managerTeam/,'staffing must link back to team planning');
const journey=source('frontend/js/journey-resume.js');
assert.match(journey,/manager-inbox-batch\?force=1/,'guided journey must recompute after mutations');
assert.match(journey,/storeops_guided_journey_active/,'guided journey context must persist across pages');
const receiptsPage=source('frontend/js/pages/receipts.js');
assert.match(receiptsPage,/receipts-feed/,'receipts page must use the D365-backed feed');
assert.match(receiptsPage,/Aucun PO réel disponible/,'receipts page must distinguish real data absence');

console.log('V1.87 stabilization P0 contract: OK');

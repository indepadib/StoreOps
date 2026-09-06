process.env.STOREOPS_DB=process.env.STOREOPS_DB||'/tmp/storeops-pilot-sources.db';
process.env.D365_MODE='live';
process.env.STOREOPS_STAFFING_SOURCE='storeops';
process.env.STOREOPS_CASH_OPENING_SOURCE='storeops';
const {getStaffingSnapshot}=await import('../services/dynamics-staffing.mjs');
const {getCashOpeningSnapshot}=await import('../services/dynamics-cash-opening.mjs');
function ok(v,m){if(!v)throw new Error(m)}
const date='2026-09-05';
const staff=await getStaffingSnapshot('val-fleuri',date);
ok(staff.source==='STOREOPS_PILOT','staffing must stay StoreOps-managed in non-real-only live D365 tests');
ok(staff.lines.some(x=>x.employeeName==='Ayoub Nachiti'&&x.roleCode==='MANAGER'),'pilot manager slot missing');
const cash=await getCashOpeningSnapshot('val-fleuri',date);
ok(cash.source==='STOREOPS_REAL_MASTER','Val Fleuri cash opening must identify confirmed real StoreOps master data');
ok(cash.lines.length===2,'Val Fleuri must expose two tills');
ok(cash.lines.every(x=>Number(x.expectedFloat)===1000),'each Val Fleuri till must expect 1000 DH');
console.log('StoreOps pilot source decoupling tests passed');

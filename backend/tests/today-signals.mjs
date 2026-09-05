import assert from 'node:assert/strict';
import {summarizeReceipts,summarizeQualityToday} from '../../frontend/js/today-signals.js';

const receipts=[
 {status:'EXPECTED',eta:'2026-09-04',lines:[{quality_control_id:null},{quality_control_id:'qc1'}]},
 {status:'EXPECTED',eta:'2026-09-05',lines:[{quality_control_id:null},{quality_control_id:null}]},
 {status:'POSTED',eta:'2026-09-05',lines:[{quality_control_id:null}]},
 {status:'EXPECTED',eta:'2026-09-07',lines:[{quality_control_id:null}]}
];
let r=summarizeReceipts(receipts,'2026-09-05');
assert.equal(r.activeReceipts,3);
assert.equal(r.pendingLines,4);
assert.equal(r.controlledLines,1);
assert.equal(r.overdue,1);
assert.equal(r.dueToday,1);
const quality=[
 {created_at:'2026-09-05 08:00:00',decision:'ACCEPT',rejected_qty:0,temperature_status:'OK'},
 {created_at:'2026-09-05 09:00:00',decision:'PARTIAL',rejected_qty:2,temperature_status:'NOK'},
 {created_at:'2026-09-04 09:00:00',decision:'REJECT',rejected_qty:8,temperature_status:'NOK'}
];
const q=summarizeQualityToday(quality,'2026-09-05');
assert.equal(q.controls,2);
assert.equal(q.rejected,2);
assert.equal(q.nonConform,1);
assert.equal(q.temperatureNok,1);
console.log('StoreOps V1.28 Today receiving/quality signals tests passed');

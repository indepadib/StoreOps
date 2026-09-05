import assert from 'node:assert/strict';
import {cashClosingNeedsAttention,closingStarted,storeBlocked,networkRisk} from '../../frontend/js/network-risk.js';

const base={day:{opening_status:'OPENED',closing_status:'NOT_STARTED'},opening:{blockers:0},closing:{done:0},staffing:{blocking:0,gaps:{managers:0}},coldChain:{blocking:0,mismatch:0},cashOpening:{blocking:0,mismatch:0},commercial:{blocking:0},dlc:{expired:0,critical:0},inventory:{pendingRecounts:0},handover:{blocking:0},sla:{escalated:0,overdue:0},loss:{blocking:0},criticalIncidents:0,qualityRejected:0,cash:{blocking:1,recounts:2,pending:3}};
assert.equal(closingStarted(base),false,'closing must not be considered started in normal daytime state');
assert.equal(cashClosingNeedsAttention(base),false,'cash closing issues must not alarm before closing starts');
const daytimeRisk=networkRisk(base);
const closing={...base,day:{...base.day,closing_status:'IN_PROGRESS'}};
assert.equal(closingStarted(closing),true);
assert.equal(cashClosingNeedsAttention(closing),true,'cash pending/recount must alarm once closing starts');
assert.equal(networkRisk(closing)-daytimeRisk,260,'closing attention must add the configured risk weight once');
const quality={...base,qualityRejected:4,cash:{blocking:0,recounts:0,pending:0}};
assert.equal(networkRisk(quality)-networkRisk({...quality,qualityRejected:0}),140,'quality rejects must increase store risk');
const qualityCap={...quality,qualityRejected:100};
assert.equal(networkRisk(qualityCap)-networkRisk({...qualityCap,qualityRejected:0}),500,'quality risk contribution must be capped');
assert.equal(storeBlocked({...base,day:{...base.day,opening_status:'NOT_STARTED'},commercial:{blocking:2}}),true,'commercial blockers must block opening');
assert.equal(storeBlocked({...base,day:{...base.day,opening_status:'NOT_STARTED'},handover:{blocking:1}}),true,'blocking handover must block opening');
assert.equal(storeBlocked({...base,day:{...base.day,opening_status:'OPENED'},staffing:{blocking:9,gaps:{managers:1}}}),false,'opening blockers must not relabel an already-open store as blocked opening');
console.log('StoreOps V1.27 network risk tests passed');

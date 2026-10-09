import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB=process.env.STOREOPS_DB||`/tmp/storeops-v235-${process.pid}.db`;
const {minuteOfDay,salesComparisonCutoff}=await import('../services/dynamics-sales.mjs');

assert.equal(minuteOfDay('09:15'),555);
assert.equal(minuteOfDay('18:30:45'),1110);
assert.equal(minuteOfDay('2026-09-28T21:07:00'),1267);
assert.equal(minuteOfDay(930),15); // D365 timeOfDay integer = seconds since midnight
assert.equal(minuteOfDay('930'),570); // textual HHMM remains supported
assert.equal(minuteOfDay(30600),510); // 08:30 in Dynamics Commerce TransTime
assert.equal(minuteOfDay(183045),1110);
assert.equal(minuteOfDay('invalid'),null);

let scope=salesComparisonCutoff('2026-09-28',{now:new Date('2026-09-28T10:42:00Z'),timeZone:'UTC'});
assert.equal(scope.mode,'SAME_TIME');
assert.equal(scope.cutoffMinute,642);
assert.equal(scope.cutoffLabel,'10:42');

scope=salesComparisonCutoff('2026-09-27',{now:new Date('2026-09-28T10:42:00Z'),timeZone:'UTC'});
assert.equal(scope.mode,'FULL_DAY');
assert.equal(scope.cutoffMinute,null);

const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const sales=read('backend/services/dynamics-sales.mjs');
const pulse=read('backend/services/business-pulse.mjs');
const today=read('frontend/js/pages/manager-home.js');
const performance=read('frontend/js/pages/manager-performance.js');

assert.match(sales,/applyCutoff/);
assert.match(sales,/TIME_FIELD_UNMAPPED/);
assert.match(sales,/TIME_PARSE_INCOMPLETE/);
assert.match(pulse,/comparisonScope/);
assert.match(pulse,/comparisonUsable/);
assert.match(pulse,/TIME_CUTOFF_UNAVAILABLE/);
assert.match(today,/vs D-7 à/);
assert.match(today,/Comparatif même heure indisponible/);
assert.match(performance,/D-7 à/);
assert.match(performance,/période strictement équivalente/);

console.log('V2.35 same-time Business Pulse contract: OK');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const decision=readFileSync(new URL('../../frontend/analytics/decision.js',import.meta.url),'utf8');
const sales=readFileSync(new URL('../services/dynamics-sales.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../services/analytics-api.mjs',import.meta.url),'utf8');

assert.match(decision,/selectedCount>1\?5:7/,'multi-store scopes must proactively use 5-day slices and single-store scopes 7-day slices');
assert.match(decision,/Math\.ceil\(maxDays\/sliceDays\)/,'cold analytical reads must split before the gateway timeout');
assert.doesNotMatch(decision,/maxDays<=15/,'a cold 15-day request must not be attempted as one monolithic call');
assert.match(decision,/decision:v27/,'browser analytical cache version must match the new full-range strategy');
assert.match(sales,/RETAIL_ANALYTICS_RANGE_CHUNK_DAYS\)\|\|10/,'backend should internally bound cold D365 reads');
assert.match(sales,/RETAIL_ANALYTICS_RANGE_CONCURRENCY\)\|\|2/,'backend should avoid over-throttling D365');
assert.match(sales,/sales-range-v28/,'store-range results must use the current persistent cache namespace');
assert.match(api,/decision-v27/,'full decision result must have a persistent exact-range cache');

console.log('Retail Intelligence performance/cache contract passed.');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const decision=readFileSync(new URL('../../frontend/analytics/decision.js',import.meta.url),'utf8');
const sales=readFileSync(new URL('../services/dynamics-sales.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../services/analytics-api.mjs',import.meta.url),'utf8');

assert.match(decision,/if\(maxDays<=15\)/,'short periods may use one direct analytical request');
assert.match(decision,/Math\.ceil\(maxDays\/15\)/,'long periods must go directly to 15-day slices instead of wasting a 30s full-period timeout');
assert.doesNotMatch(decision,/one full-period request first/i,'long-period strategy must not deliberately try a doomed monolithic request first');
assert.match(decision,/decision:v20/,'browser analytical cache version must match the new full-range strategy');
assert.match(sales,/RETAIL_ANALYTICS_RANGE_CHUNK_DAYS\)\|\|10/,'backend should internally bound cold D365 reads');
assert.match(sales,/RETAIL_ANALYTICS_RANGE_CONCURRENCY\)\|\|2/,'backend should avoid over-throttling D365');
assert.match(sales,/sales-range-v20/,'store-range results must use persistent cache v20');
assert.match(api,/decision-v21/,'full decision result must have a persistent exact-range cache');

console.log('Retail Intelligence performance/cache contract passed.');

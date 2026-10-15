import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const decision=readFileSync(new URL('../../frontend/analytics/decision.js',import.meta.url),'utf8');
const sales=readFileSync(new URL('../services/dynamics-sales.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../services/analytics-api.mjs',import.meta.url),'utf8');

assert.match(decision,/one full-period request first/i);
assert.match(decision,/Math\.ceil\(maxDays\/15\)/,'fallback must use materially larger slices than the legacy 7-day fan-out');
assert.match(decision,/decision:v14/,'browser analytical cache version must match the new full-range strategy');
assert.match(sales,/RETAIL_ANALYTICS_RANGE_CHUNK_DAYS\)\|\|10/,'backend should internally bound cold D365 reads');
assert.match(sales,/RETAIL_ANALYTICS_RANGE_CONCURRENCY\)\|\|2/,'backend should avoid over-throttling D365');
assert.match(sales,/sales-range-v13/,'store-range results must use persistent cache v10');
assert.match(api,/decision-v14/,'full decision result must have a persistent exact-range cache');

console.log('Retail Intelligence performance/cache contract passed.');

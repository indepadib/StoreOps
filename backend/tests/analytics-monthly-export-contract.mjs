import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const service=readFileSync(new URL('../services/analytics-monthly-export.mjs',import.meta.url),'utf8');
const api=readFileSync(new URL('../services/analytics-api.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../frontend/analytics/monthly-sales-export.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../frontend/analytics/index.html',import.meta.url),'utf8');
const bootstrap=readFileSync(new URL('../../frontend/analytics/bootstrap.js',import.meta.url),'utf8');

assert.match(api,/\/api\/analytics\/monthly-export/,'Analytics API must expose the monthly export endpoint');
assert.match(service,/days>31/,'monthly export must bound basket analysis to a real monthly-sized window');
assert.match(service,/previousYearPeriod/,'N-1 must be calculated explicitly');
assert.match(service,/department_code/,'department hierarchy must be exported');
assert.match(service,/family_code/,'family hierarchy must be exported');
assert.match(service,/subfamily_code/,'subfamily hierarchy must be exported');
assert.match(service,/subsubfamily_code/,'sub-subfamily hierarchy must be exported');
assert.match(service,/ub_code/,'UB hierarchy must be exported');
assert.match(service,/ca_weight_pct/,'sales contribution must be exported');
assert.match(service,/basket_penetration_pct/,'basket penetration must be exported');
assert.match(service,/average_basket_with_product/,'basket value with product must be exported');
assert.match(service,/active_sales_days/,'sales frequency must be exported');
assert.match(service,/top_associated_product/,'basket association must be exported');
assert.match(service,/rank_ca_n1/,'N-1 rank must be exported');
assert.match(service,/scopeType:'NETWORK'/,'network consolidation must be generated');
assert.match(service,/scopeType:'STORE'/,'store detail must be generated');
assert.match(html,/id="fullExportBtn"/,'complete export button must be visible in Analytics');
assert.match(bootstrap,/monthly-sales-export\.js/,'complete export module must load in Analytics');
assert.match(ui,/navigator\.share/,'iOS native share should be supported');
assert.match(ui,/StoreOps-Analytics-ventes-completes-N-N1/,'filename must clearly describe the full N/N-1 export');

console.log('Analytics complete monthly N/N-1 export contract passed.');

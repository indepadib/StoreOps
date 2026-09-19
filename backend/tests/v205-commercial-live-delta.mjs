import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB='/tmp/storeops-v205-commercial-live-delta.db';
await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {syncCommercialControls,listCommercialControls}=await import('../services/commercial.mjs');

for(const t of ['commercial_controls','commercial_source_state'])db.prepare(`DELETE FROM ${t}`).run();
const storeId='val-fleuri',day='2026-09-18';

const oldActive={sourceKey:`D365-PROMO-5001-000001-1-${day}`,actionType:'VERIFY',ean:'ITEM:SKU1',productNumber:'SKU1',productName:'Article 1',expectedPrice:10,promoLabel:'Promo ancienne · Prix promo 10.00 DH',signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,storeId,source:'D365_RETAIL_PRICING',validFrom:'2026-09-01T00:00:00Z',validTo:'2026-09-30T00:00:00Z'};
let r=syncCommercialControls({storeId,businessDate:day,changes:[oldActive]});
assert.equal(r.actionableCount,0,'an old active promotion must baseline without creating daily noise');
assert.equal(listCommercialControls(storeId,day).length,0);

r=syncCommercialControls({storeId,businessDate:day,changes:[oldActive]});
assert.equal(r.actionableCount,0,'unchanged active promotion must stay silent');

const changed={...oldActive,expectedPrice:9,promoLabel:'Promo ancienne · Prix promo 9.00 DH'};
r=syncCommercialControls({storeId,businessDate:day,changes:[changed]});
let rows=listCommercialControls(storeId,day);
assert.equal(rows.length,1,'a changed active promotion must become actionable');
assert.equal(rows[0].action_type,'PROMO_START');
assert.match(rows[0].promo_label,/Promotion modifiée dans Dynamics/);
assert.equal(rows[0].expected_price,9);

db.prepare(`DELETE FROM commercial_controls`).run();
const recent={...oldActive,sourceKey:`D365-PROMO-5001-000002-1-${day}`,ean:'ITEM:SKU2',productNumber:'SKU2',productName:'Article 2',validFrom:'2026-09-18T00:00:00Z',promoLabel:'Promo du jour · Prix promo 12.00 DH',expectedPrice:12};
r=syncCommercialControls({storeId,businessDate:day,changes:[recent]});
rows=listCommercialControls(storeId,day);
assert.equal(rows.length,1,'a newly seen promotion effective today must surface immediately');
assert.equal(rows[0].action_type,'PROMO_START');

db.prepare(`DELETE FROM commercial_controls`).run();
const priorDay='2026-09-10',historicalPromo={...oldActive,sourceKey:`D365-PROMO-5001-000003-1-${priorDay}`,actionType:'PROMO_START',ean:'ITEM:SKUH',productNumber:'SKUH',productName:'Article historique',validFrom:'2026-09-10T00:00:00Z',expectedPrice:10,promoLabel:'Promo historique · Prix promo 10.00 DH'};
syncCommercialControls({storeId,businessDate:priorDay,changes:[historicalPromo]});
db.prepare(`DELETE FROM commercial_source_state WHERE store_id=? AND stable_key LIKE ?`).run(storeId,'D365-PROMO-5001-000003-1%');
const historicalChanged={...historicalPromo,sourceKey:`D365-PROMO-5001-000003-1-${day}`,actionType:'VERIFY',validFrom:'2026-09-01T00:00:00Z',expectedPrice:8.5,promoLabel:'Promo historique · Prix promo 8.50 DH'};
r=syncCommercialControls({storeId,businessDate:day,changes:[historicalChanged]});
rows=listCommercialControls(storeId,day);
assert.equal(rows.length,1,'a changed old-validity promo must be detected from StoreOps history even before source-state bootstrap');
assert.match(rows[0].promo_label,/Promotion modifiée dans Dynamics/);
assert.equal(rows[0].expected_price,8.5);

db.prepare(`DELETE FROM commercial_controls`).run();
const price={sourceKey:`D365-PRICE-AGREEMENT-123-${day}`,stableKey:'D365-PRICE-AGREEMENT:123',fingerprint:'123|SKU3|15.9',actionType:'PRICE_CHANGE',ean:'ITEM:SKU3',productNumber:'SKU3',productName:'SKU3',oldPrice:null,expectedPrice:15.9,promoLabel:'Nouveau prix 15.90 DH · accord tarifaire Franprix',signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,storeId,source:'D365_RETAIL_PRICING',effectiveFrom:day};
r=syncCommercialControls({storeId,businessDate:day,changes:[price]});
rows=listCommercialControls(storeId,day);
assert.equal(rows.length,1,'dated price changes must enter the commercial queue');
assert.equal(rows[0].action_type,'PRICE_CHANGE');
assert.equal(rows[0].expected_price,15.9);
const kept=syncCommercialControls({storeId,businessDate:day,changes:[],preserveExisting:true});
assert.equal(kept.preserveExisting,true);
assert.equal(listCommercialControls(storeId,day).length,1,'partial source failures must not erase pending commercial actions');

const dynamicsPrice=readFileSync(new URL('../services/dynamics-price.mjs',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const commercialPage=readFileSync(new URL('../../frontend/js/pages/commercial.js',import.meta.url),'utf8');
const managerHome=readFileSync(new URL('../../frontend/js/pages/manager-home.js',import.meta.url),'utf8');
const today=readFileSync(new URL('../../frontend/js/pages/today.js',import.meta.url),'utf8');
const refresh=readFileSync(new URL('../../frontend/js/commercial-live-refresh.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const auth=readFileSync(new URL('../../frontend/js/auth-entry.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');
const enhancements=readFileSync(new URL('../../frontend/js/enhancements-entry.js',import.meta.url),'utf8');
const classic=readFileSync(new URL('../../frontend/js/boot-classic.js',import.meta.url),'utf8');

assert.match(dynamicsPrice,/getCommercialPriceChanges/,'price delta reader missing');
assert.match(dynamicsPrice,/PriceApplicableFromDate/,'trade agreement effective-date detection missing');
assert.match(dynamicsPrice,/SalesPriceDate/,'base price change detection missing');
assert.match(server,/Promise\.allSettled\(jobs\.map/,'price and promotion sources must degrade independently');
assert.match(server,/getCommercialPriceChanges/,'server must merge price changes into commercial sync');
assert.match(server,/preserveExisting=sources\.some\(x=>x\.status==='ERROR'\)/,'partial source failures must preserve the current commercial snapshot');
assert.match(commercialPage,/data\.sync\?\.deferred&&!autoSyncAttempted/,'commercial page should background-sync even with an existing snapshot');
assert.doesNotMatch(commercialPage,/!rows\.length&&data\.sync\?\.deferred/,'non-empty snapshots must not suppress live refresh');
assert.match(managerHome,/scheduleCommercialLiveRefresh/,'manager Today must refresh live commercial data after first paint');
assert.match(today,/scheduleCommercialLiveRefresh/,'director Today must refresh live commercial data after first paint');
assert.match(refresh,/minIntervalMs=300000/,'background sync must be throttled');
assert.match(refresh,/storeops:commercial-updated/,'background sync should publish an update event');
assert.match(refresh,/status=Number\(error\?\.status\)\|\|0;remember\(id\)/,'failed background refreshes must back off instead of retrying on every render');
assert.match(app,/invoke\('\.\/pages\/manager-home\.js','renderManagerHome'\)/,'manager Today must remain lazy');
const runtimeBuild=auth.match(/const BUILD='(\\d+)'/)?.[1];
const runtimeLabel=auth.match(/const BUILD_LABEL='([^']+)'/)?.[1];
assert(runtimeBuild&&runtimeLabel,'active release markers must exist');
assert.match(app,new RegExp(`commercial\\.js\\?v=${runtimeBuild}`),'commercial lazy asset must share active release generation');
assert.match(enhancements,new RegExp(`const BUILD='${runtimeBuild}'`),'deferred modules must share active release cache generation');
assert.match(classic,new RegExp(`var BUILD='${runtimeLabel.replaceAll('.','\\.')}'`),'classic boot release must match active release label');
assert.match(index,new RegExp(`auth-entry\\.js\\?v=${runtimeBuild}`),'entry asset must share active release generation');

console.log(`StoreOps commercial live delta contract passed · active release ${runtimeLabel}`);

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB='/tmp/storeops-v213-operational-reality.db';
process.env.D365_MODE='simulated';
await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {syncCommercialControls,listCommercialControls}=await import('../services/commercial.mjs');
const {offerStartedYesterday,offerEndedYesterday}=await import('../services/dynamics.mjs');

for(const t of ['commercial_controls','commercial_source_state'])db.prepare(`DELETE FROM ${t}`).run();
const storeId='val-fleuri',day='2026-09-19';

assert.equal(offerStartedYesterday({Status:'Enabled',ProcessingStatus:'Processed',ValidFrom:'2026-09-18T00:00:00Z'},day),true,'a promo started yesterday must be explicitly recognized');
assert.equal(offerStartedYesterday({Status:'Enabled',ProcessingStatus:'Processed',ValidFrom:'2026-09-17T00:00:00Z'},day),false);
assert.equal(offerEndedYesterday({ProcessingStatus:'Processed',ValidTo:'2026-09-18T00:00:00Z'},day),true);

const tradeAgreement={
 sourceKey:'D365-PRICE-AGREEMENT-7788-2026-09-18',
 stableKey:'D365-PRICE-AGREEMENT:7788',
 fingerprint:'AGREEMENT|7788|HS-009999|22.5|Franprix|2026-09-18',
 actionType:'VERIFY',
 deltaActionType:'PRICE_CHANGE',
 deltaOnFirstSeen:true,
 deltaSignageAction:'VERIFY',
 ean:'ITEM:HS-009999',
 productNumber:'HS-009999',
 productName:'HS-009999',
 expectedPrice:22.5,
 promoLabel:'Accord tarifaire Franprix · 22.50 DH · détecté en rattrapage (2026-09-18)',
 signageAction:'VERIFY',
 priority:'HIGH',
 blockingOpening:true,
 source:'D365_RETAIL_PRICING',
 effectiveFrom:'2026-09-18T00:00:00Z'
};
let sync=syncCommercialControls({storeId,businessDate:day,changes:[tradeAgreement]});
let rows=listCommercialControls(storeId,day);
assert.equal(sync.actionableCount,1,'a newly detected recent trade agreement must enter the queue');
assert.equal(rows.length,1);
assert.equal(rows[0].action_type,'PRICE_CHANGE','a trade agreement must never be mislabeled as a promo');
assert.match(rows[0].promo_label,/Nouvel accord tarifaire détecté/);
assert.equal(rows[0].expected_price,22.5);

const dynamics=readFileSync(new URL('../services/dynamics.mjs',import.meta.url),'utf8');
const pricing=readFileSync(new URL('../services/dynamics-price.mjs',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const receipts=readFileSync(new URL('../../frontend/js/pages/receipts.js',import.meta.url),'utf8');
const managerHome=readFileSync(new URL('../../frontend/js/pages/manager-home.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../../frontend/js/app.js',import.meta.url),'utf8');
const auth=readFileSync(new URL('../../frontend/js/auth-entry.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');
const classic=readFileSync(new URL('../../frontend/js/boot-classic.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../../frontend/netlify-build.sh',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../../netlify/functions/api.mts',import.meta.url),'utf8');

assert.match(dynamics,/offerStartedYesterday\(header,day\)/,'commercial promo reader must detect yesterday starts');
assert.match(dynamics,/Contrôle de rattrapage · promotion démarrée hier/,'yesterday promo must be visibly labelled');
assert.match(pricing,/effectiveD365PriceHistoryMapping\(\)/,'trade-agreement delta reader must reuse the validated mapping');
assert.match(pricing,/resolveStorePriceGroups\(storeId\)/,'trade-agreement delta reader must use channel price groups');
assert.match(pricing,/previousDays\(day,2\)/,'trade-agreement reader must catch recent agreements, not only exact-today rows');
assert.match(pricing,/deltaActionType:'PRICE_CHANGE'/,'trade-agreement rows must materialize as price changes');

assert.match(server,/syncExpectedReceiptsFromDynamics/,'PO sync service must be imported into the active router');
assert.match(server,/receipts'\);if\(p&&req\.method==='GET'\)\{\s*requireStore\(user,p\.storeId\);\s*return json\(req,res,200,listReceiptsForStore\(p\.storeId\)\)/,'GET receipts must stay cache-first and never block on Dynamics');
assert.match(server,/receipts\/readiness/,'receiving readiness route missing');
assert.match(server,/receipts\/sync/,'explicit PO refresh route missing');
assert.match(receipts,/Synchroniser D365/,'PO page must expose a visible explicit refresh');
assert.match(receipts,/PO Dynamics synchronisés/,'PO page must identify a proven successful D365 sync');
assert.match(receipts,/Connexion PO Dynamics à valider/,'PO page must distinguish an unproven connection');
assert.match(receipts,/PO Dynamics à vérifier/,'PO page must distinguish a degraded connection');
assert.doesNotMatch(receipts,/Connecteur PO Dynamics actif/,'PO page must not claim LIVE from a configuration flag alone');
assert.doesNotMatch(receipts,/Aucune réception prévue\./,'PO page must not silently hide connector failures');

assert.match(app,/if\(page==='today'\)return invoke\('\.\/pages\/manager-home\.js','renderManagerHome'\)/,'all operational profiles must use the guided Today cockpit');
assert.doesNotMatch(app,/isManager\(\)\?invoke\('\.\/pages\/manager-home\.js'/,'Today must no longer split Admin/Direction onto the legacy page');
assert.doesNotMatch(managerHome,/receipts\/sync/,'Today must never trigger a blocking PO sync in the background');

assert.match(auth,/const BUILD='21(?:3|4|5|6)0'/);
assert.match(auth,/const BUILD_LABEL='2\.(?:13|14|15|16)\.0'/);
assert.match(index,/v2\.(?:13|14|15|16)\.0/);
assert.match(classic,/BUILD='2\.(?:13|14|15|16)\.0'/);
assert.match(build,/21(?:3|4|5|6)0/);
assert.match(bridge,/version:envValue\('STOREOPS_VERSION'\)\|\|'2\.(?:13|14|15|16)\.0'/);

console.log('V2.13 operational reality contract passed');

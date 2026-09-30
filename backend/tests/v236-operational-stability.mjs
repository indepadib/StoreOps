import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-v236-${process.pid}.db`;
const {releasedProductDisplayName,normalizeReleasedProductSupplyMode,parseRetailFinancialDimension,releasedProductProfile}=await import('../services/released-product-sourcing.mjs');
const {promoExpectedPrice}=await import('../services/dynamics.mjs');

assert.deepEqual(releasedProductDisplayName({ProductName:'Lait frais 1L'}),{field:'ProductName',name:'Lait frais 1L',quality:'DISPLAY_NAME'});
assert.deepEqual(releasedProductDisplayName({ProductDescription:'YAOURT NATURE 4X',SearchName:'DANONE'}),{field:'ProductDescription',name:'YAOURT NATURE 4X',quality:'DISPLAY_NAME'});
assert.deepEqual(releasedProductDisplayName({ProductSearchName:'SET DE 3 BOITES ALIM',SearchName:'Tefal'}),{field:'ProductSearchName',name:'SET DE 3 BOITES ALIM',quality:'SEARCH_FALLBACK'});
assert.equal(normalizeReleasedProductSupplyMode('DC'),'WAREHOUSE');
assert.equal(normalizeReleasedProductSupplyMode('Auto'),'WAREHOUSE');
assert.equal(normalizeReleasedProductSupplyMode('Direct'),'DIRECT_SUPPLIER');
assert.equal(normalizeReleasedProductSupplyMode('LVE Lakhyayta'),'WAREHOUSE');
assert.equal(normalizeReleasedProductSupplyMode('Autre'),null);
assert.deepEqual(parseRetailFinancialDimension('|Retail|FPXMPX|||16|'),{raw:'|Retail|FPXMPX|||16|',retailScope:'FPXMPX',rayonCode:'16',rayonLabel:'Rayon 16'});
const exportedProfile=releasedProductProfile({ITEMNUMBER:'HS-001386',BATCHNUMBERGROUPCODE:'Direct',DEFAULTLEDGERDIMENSIONDISPLAYVALUE:'|Retail|FPXMPX|||16|',PRODUCTSEARCHNAME:'ACTIMEL',PRIMARYVENDORACCOUNTNUMBER:'FRS-047',INVENTORYUNITSYMBOL:'PC',SALESUNITSYMBOL:'PC'});assert.equal(exportedProfile.productName,'ACTIMEL');assert.equal(exportedProfile.supplyMode,'DIRECT_SUPPLIER');assert.equal(exportedProfile.rayonCode,'16');assert.equal(exportedProfile.retailScope,'FPXMPX');

assert.equal(promoExpectedPrice(100,{}, {OfferPrice:79}),79);
assert.equal(promoExpectedPrice(100,{DiscountPercentValue:20},{OfferDiscountMethod:'PercentOff'}),80);
assert.equal(promoExpectedPrice(100,{}, {OfferDiscountAmount:17.8}),82.2);
assert.equal(promoExpectedPrice(null,{}, {OfferDiscountAmount:17.8}),null);

const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const released=read('backend/services/released-product-sourcing.mjs');
const stock=read('backend/services/stock-signals.mjs');
const pulse=read('backend/services/business-pulse.mjs');
const sell=read('backend/services/sell-through.mjs');
const dynamics=read('backend/services/dynamics.mjs');
const commercial=read('backend/services/commercial.mjs');
const repl=read('frontend/js/manager-replenishment-v2.js');
const warehouse=read('frontend/js/warehouse-control.js');
const enhancements=read('frontend/js/enhancements-entry.js');
const mobile=read('frontend/mobile-v199.css');
const cool=read('frontend/js/pages/cool-save.js');
const glovo=read('backend/services/glovo-availability.mjs');

assert.match(released,/ProductNumber','ItemNumber/,'ReleasedProducts lookup must support ProductNumber and ItemNumber');
assert.match(released,/ProductSearchName/,'ReleasedProducts lookup must use ProductSearchName as operational fallback');
assert.match(released,/BatchNumberGroupCode/,'ReleasedProducts sourcing must use the actual DC Direct field from the export');
assert.match(released,/DEFAULTLEDGERDIMENSIONDISPLAYVALUE/,'ReleasedProducts profile must parse the retail financial dimension');
assert.match(released,/cachePut\(sku,\{status:supplyMode/,'batch product identities must be cached');
assert.match(stock,/releasedProductSourcingMany\(items\.map/,'all action rows including negative stock must be identity-enriched');
assert.match(stock,/releasedName=clean\(sourcing\.productName\)/,'stock signals must resolve ReleasedProducts names first');
assert.match(stock,/productNameSource:nameSource/,'stock signals must expose the authoritative identity source');
assert.match(pulse,/generic=.*article/,'Business Pulse must treat generic Article labels as unresolved');
assert.match(sell,/genericName/,'sell-through must reject generic article names');
assert.match(sell,/snapshotCache/,'sell-through must cache expensive snapshots');
assert.match(glovo,/availabilityCache/,'Glovo availability must be cached');
assert.match(cool,/suggestionsLoading/,'Cool & Save must render before slow suggestions finish');
assert.match(dynamics,/commercialBasePriceMap/,'promotion flow must read base price');
assert.match(dynamics,/oldPrice:ended\?/,'promotion actions must expose before/after prices');
assert.match(commercial,/historical=.*history\.get/,'price changes must retain prior known price');
assert.match(commercial,/recheck_days/,'verified promo controls must have a cooldown');
assert.match(commercial,/last_verified_at/,'commercial source state must remember the last compliant control');
assert.match(repl,/Approvisionnement non identifié/);
assert.doesNotMatch(repl,/Source à vérifier/);
assert.match(warehouse,/dataset\.mobileLabel='Entrepôt'/,'dynamic warehouse nav must have mobile text');
assert.match(enhancements,/ensureDynamicNavLabels/,'dynamic director nav entries must always get labels');
assert.match(mobile,/backdrop-filter:none/,'iOS bottom nav must be opaque/stable');
assert.match(mobile,/padding-bottom:calc\(124px/,'mobile content must clear the fixed nav');

console.log('V2.36 operational UX + identity + performance contract: OK');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v207-stock-promo-guided.db';
process.env.D365_MODE='simulated';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

await import('../services/pilot-profile.mjs');
const {db}=await import('../db.mjs');
const {syncCommercialControls,listCommercialControls,submitCommercialControl}=await import('../services/commercial.mjs');
const {getStockGuidedFlow,completeStockGuidedReview}=await import('../services/stock-guided.mjs');
const {getManagerInboxBatch}=await import('../services/manager-inbox-batch.mjs');

const user=db.prepare(`SELECT * FROM users WHERE id='u-admin'`).get()||db.prepare(`SELECT * FROM users WHERE active=1 ORDER BY CASE role WHEN 'ops_director' THEN 0 ELSE 1 END LIMIT 1`).get();
assert(user,'test user required');

const day='2099-02-07';
db.prepare(`DELETE FROM commercial_controls WHERE store_id='val-fleuri' AND business_date=?`).run(day);
syncCommercialControls({storeId:'val-fleuri',businessDate:day,changes:[{sourceKey:'TEST-PROMO-UNRESOLVED',actionType:'PROMO_START',ean:'ITEM:HS-TEST-1',productNumber:'HS-TEST-1',productName:'Promo 20% sans prix',category:'Test',oldPrice:20,expectedPrice:null,promoLabel:'Remise 20%',signageAction:'INSTALL',priority:'CRITICAL',blockingOpening:true,priceControlRequired:true,source:'TEST'}]});
let control=listCommercialControls('val-fleuri',day)[0];
assert.equal(control.price_control_required,1);
assert.equal(control.expected_price,null);
let result=submitCommercialControl({id:control.id,user,observedPrice:null,signageOk:true,executionOk:true,note:'test'});
assert(result.issues.some(x=>x.includes('Prix attendu indisponible')));
assert.equal(result.control.status,'MISMATCH');

db.prepare(`DELETE FROM commercial_controls WHERE store_id='val-fleuri' AND business_date=?`).run(day);
syncCommercialControls({storeId:'val-fleuri',businessDate:day,changes:[{sourceKey:'TEST-PROMO-RESOLVED',actionType:'PROMO_START',ean:'ITEM:HS-TEST-2',productNumber:'HS-TEST-2',productName:'Promo 20% résolue',category:'Test',oldPrice:20,expectedPrice:16,promoLabel:'Remise 20%',signageAction:'INSTALL',priority:'HIGH',blockingOpening:true,priceControlRequired:true,priceResolutionSource:'BASE_PRICE',source:'TEST'}]});
control=listCommercialControls('val-fleuri',day)[0];
result=submitCommercialControl({id:control.id,user,observedPrice:16,signageOk:true,executionOk:true,note:'ok'});
assert.deepEqual(result.issues,[]);
assert.equal(result.control.status,'VERIFIED');

const neg=await getStockGuidedFlow('val-fleuri','NEGATIVE',{businessDate:day,force:true});
assert.equal(neg.progress.total,1);
assert.equal(neg.current?.status,'PENDING');
assert.equal(neg.current?.signal_type,'NEGATIVE');
const negNext=await completeStockGuidedReview({storeId:'val-fleuri',type:'NEGATIVE',reviewId:neg.current.id,user,outcome:'INVENTORY_STARTED',businessDate:day});
assert.equal(negNext.complete,true);
assert.equal(negNext.inventorySessionIds.length,1);
const inv=db.prepare(`SELECT * FROM inventory_sessions WHERE id=?`).get(negNext.inventorySessionIds[0]);
assert.equal(inv.inventory_type,'TARGETED');
assert.match(inv.zone,/Stocks négatifs/);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM inventory_lines WHERE session_id=?`).get(inv.id).n,1);

const out=await getStockGuidedFlow('val-fleuri','OUT',{businessDate:day,force:true});
assert.equal(out.progress.total,2);
const outNext=await completeStockGuidedReview({storeId:'val-fleuri',type:'OUT',reviewId:out.current.id,user,outcome:'CONFIRMED_OOS',businessDate:day});
assert.equal(outNext.progress.done,1);
assert.equal(outNext.progress.pending,1);

const inbox=await getManagerInboxBatch('val-fleuri',day,{force:true});
const stockActions=inbox.items.filter(x=>x.category==='STOCK'&&x.stockFlow);
assert.equal(stockActions.filter(x=>x.stockFlow==='NEGATIVE').length,1);
assert.equal(stockActions.filter(x=>x.stockFlow==='OUT').length,1);
assert.equal(stockActions.find(x=>x.stockFlow==='NEGATIVE').count,1);
assert.equal(stockActions.find(x=>x.stockFlow==='OUT').count,2);
assert(!inbox.items.some(x=>String(x.id).startsWith('stock-sim-')),'Today must not explode stock signals into one card per SKU');

const dynamics=read('backend/services/dynamics.mjs');
assert.match(dynamics,/resolveCommercialNormalPrices/);
assert.match(dynamics,/promoExpectedPrice\(normalPrice,header,line\)/);
assert.doesNotMatch(dynamics,/promoExpectedPrice\(null,header,line\)/);
assert.match(dynamics,/priceControlRequired/);
assert.match(dynamics,/SalesPriceAgreements/);
assert.match(dynamics,/ReleasedProductsV2/);

const commercialUi=read('frontend/js/pages/commercial.js');
assert.match(commercialUi,/Contrôle prix bloqué/);
assert.match(commercialUi,/Prix attendu requis/);
const managerHome=read('frontend/js/pages/manager-home.js');
assert.match(managerHome,/data-stock-flow="NEGATIVE"/);
assert.match(managerHome,/data-stock-flow="OUT"/);
const directorToday=read('frontend/js/pages/today.js');
assert.match(directorToday,/manager-inbox-batch/);
assert.match(directorToday,/todayStockSignals/);
const guided=read('frontend/js/manager-stock-guided.js');
assert.match(guided,/p\\.position[\\s\\S]*p\\.total/);
assert.match(guided,/INVENTORY_STARTED/);
assert.match(guided,/CONFIRMED_OOS/);
const stockService=read('backend/services/stock-guided.mjs');
assert.match(stockService,/filter\(x=>x.type===kind\)/,'guided outage path must only consume canonical OUT signals');
assert.doesNotMatch(stockService,/OUTSIDE_ASSORTMENT.*signal_type/,'residual outside assortment must never enter the outage journey');

const writes=read('backend/services/dynamics.mjs');
assert.match(writes,/D365_INVENTORY_WRITE_NOT_MAPPED/);
assert.match(writes,/D365_LOSS_WRITE_NOT_MAPPED/);
assert.match(writes,/journal d’inventaire \/ ajustement/);
assert.match(writes,/journal de mouvement ou ajustement stock/);

console.log('V2.07 expected promo price + guided stock journeys contract OK');

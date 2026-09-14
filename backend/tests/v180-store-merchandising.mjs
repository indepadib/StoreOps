import assert from 'node:assert/strict';
import { db } from '../db.mjs';
import { saveStoreOperationalSettings,storeOperationalSettings } from '../services/store-settings.mjs';
import { supplyWarehouseForStore,warehouseForStore } from '../services/dynamics-stock.mjs';
import { syncStoreAssortmentSnapshot } from '../services/assortment.mjs';
import { replaceStoreAssortmentAssignments,replaceAssortmentProductAssignments,relationalAssortmentMembership } from '../services/assortment-relations.mjs';
import { assortmentIndex,assortmentMembership } from '../services/assortment-resolver.mjs';
import { normalizeAgreementHistory } from '../services/price-history.mjs';

const director={id:'u-ops',role:'ops_director'};

// Warehouse selection must persist and become the actual stock/replenishment mapping.
let settings=saveStoreOperationalSettings({storeId:'val-fleuri',user:director,storeWarehouseId:'VF-WH',supplyWarehouseId:'CENTRAL-WH',secondarySupplyWarehouseIds:['BACKUP-WH','CENTRAL-WH','VF-WH']});
assert.equal(settings.storeWarehouseId,'VF-WH');
assert.equal(settings.supplyWarehouseId,'CENTRAL-WH');
assert.deepEqual(settings.secondarySupplyWarehouseIds,['BACKUP-WH']);
assert.equal(storeOperationalSettings('val-fleuri').source,'STOREOPS_CONFIG');
assert.equal(warehouseForStore('val-fleuri'),'VF-WH');
assert.equal(supplyWarehouseForStore('val-fleuri'),'CENTRAL-WH');
assert.throws(()=>saveStoreOperationalSettings({storeId:'val-fleuri',user:director,storeWarehouseId:'SAME',supplyWarehouseId:'SAME'}),/doivent être distincts/);

// Legacy snapshot remains supported until the relational model is configured.
syncStoreAssortmentSnapshot({storeId:'val-fleuri',source:'LEGACY',assortmentKey:'legacy',products:['LEGACY-SKU'],complete:true});
let idx=assortmentIndex('val-fleuri',{maxAgeHours:9999});
assert.equal(idx.model,'SNAPSHOT');
assert.equal(assortmentMembership('val-fleuri','LEGACY-SKU',{index:idx}).status,'ASSORTED');

// New canonical model: store -> assortment(s), assortment -> product(s).
replaceStoreAssortmentAssignments({storeId:'val-fleuri',source:'D365',assignments:[{assortmentKey:'A-STORE',assortmentName:'Val Fleuri standard'},{assortmentKey:'A-SEASON',assortmentName:'Saisonnier'}],complete:true});
replaceAssortmentProductAssignments({source:'D365',assortmentKey:'A-STORE',assortmentName:'Val Fleuri standard',products:[{productNumber:'SKU-1',included:true},{productNumber:'SKU-X',included:true}],complete:true});
replaceAssortmentProductAssignments({source:'D365',assortmentKey:'A-SEASON',assortmentName:'Saisonnier',products:[{productNumber:'SKU-2',included:true},{productNumber:'SKU-X',included:false}],complete:true});
idx=assortmentIndex('val-fleuri',{maxAgeHours:9999});
assert.equal(idx.model,'RELATIONAL');
assert.equal(idx.status,'READY');
assert.equal(assortmentMembership('val-fleuri','SKU-1',{index:idx}).status,'ASSORTED');
assert.equal(assortmentMembership('val-fleuri','SKU-2',{index:idx}).status,'ASSORTED');
assert.equal(assortmentMembership('val-fleuri','SKU-X',{index:idx}).status,'NOT_ASSORTED'); // exclusion wins
assert.equal(assortmentMembership('val-fleuri','LEGACY-SKU',{index:idx}).status,'NOT_ASSORTED'); // relational source becomes authoritative
assert.equal(relationalAssortmentMembership('val-fleuri','SKU-1',{index:idx}).model,'RELATIONAL');

// A stale relational source must not silently fall back to an old legacy snapshot.
db.prepare(`UPDATE store_assortment_assignment_state SET synced_at='2020-01-01 00:00:00' WHERE store_id='val-fleuri' AND source='D365'`).run();
idx=assortmentIndex('val-fleuri',{maxAgeHours:1});
assert.equal(idx.model,'RELATIONAL');
assert.equal(idx.status,'STALE');
assert.equal(assortmentMembership('val-fleuri','SKU-1',{index:idx}).status,'UNKNOWN');

// Price history normalizer keeps dated trade agreements separate from observed POS prices.
const history=normalizeAgreementHistory({rows:[
 {RecordId:2,Price:17.9,PriceCurrencyCode:'MAD',PriceApplicableFromDate:'2026-09-01T00:00:00Z',PriceApplicableToDate:'2026-09-10T00:00:00Z',PriceCustomerGroupCode:'Franprix'},
 {RecordId:1,Price:19.9,PriceCurrencyCode:'MAD',PriceApplicableFromDate:'2026-09-11T00:00:00Z',PriceApplicableToDate:null,PriceCustomerGroupCode:'Franprix'}
]});
assert.equal(history.length,2);
assert.equal(history[0].price,19.9);
assert.equal(history[0].from,'2026-09-11');
assert.equal(history[1].to,'2026-09-10');

console.log('V1.80 store warehouses + relational assortment + price history contract OK');

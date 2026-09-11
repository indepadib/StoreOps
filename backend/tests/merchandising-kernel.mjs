import assert from 'node:assert/strict';
import {syncCategoryHierarchy,syncProductCategoryAssignments,syncStoreAssortmentSnapshot,assortmentMembership,productTaxonomy,classifyAvailability} from '../services/assortment.mjs';
import {normalizeConnector,chooseConnector,connectorReadiness} from '../services/connector-contract.mjs';
import {RETAIL_PROCESS_CATALOG,processDefinition,mandatoryProcessCodes} from '../services/retail-process-catalog.mjs';

syncCategoryHierarchy({source:'TEST',hierarchyKey:'PROCUREMENT',categories:[
 {categoryId:'10',categoryName:'Épicerie',level:1,path:'Épicerie'},
 {categoryId:'11',categoryName:'Petit déjeuner',parentCategoryId:'10',level:2,path:'Épicerie > Petit déjeuner'},
 {categoryId:'12',categoryName:'Céréales',parentCategoryId:'11',level:3,path:'Épicerie > Petit déjeuner > Céréales'}
]});
syncProductCategoryAssignments({source:'TEST',hierarchyKey:'PROCUREMENT',assignments:[{productNumber:'A',categoryId:'12'}]});
assert.equal(productTaxonomy('A',{source:'TEST'})[0].category_name,'Céréales');

syncStoreAssortmentSnapshot({storeId:'val-fleuri',source:'TEST',assortmentKey:'BASE',products:['A','B'],complete:true});
syncStoreAssortmentSnapshot({storeId:'val-fleuri',source:'TEST',assortmentKey:'EXCLUSIONS',products:[{productNumber:'B',included:false,reason:'DELISTED'}],complete:true});
assert.equal(assortmentMembership('val-fleuri','A',{source:'TEST'}).status,'ASSORTED');
assert.equal(assortmentMembership('val-fleuri','B',{source:'TEST'}).status,'NOT_ASSORTED');
assert.equal(assortmentMembership('val-fleuri','C',{source:'TEST'}).status,'NOT_ASSORTED');
assert.equal(assortmentMembership('trefle','A',{source:'TEST'}).status,'UNKNOWN');
assert.equal(classifyAvailability({storeId:'val-fleuri',productNumber:'A',availableQty:0,index:null}).state,'OUT_OF_STOCK');
assert.equal(classifyAvailability({storeId:'val-fleuri',productNumber:'B',availableQty:0,index:null}).state,'NOT_ASSORTED');
assert.equal(classifyAvailability({storeId:'val-fleuri',productNumber:'B',availableQty:4,index:null}).state,'RESIDUAL_STOCK_OUTSIDE_ASSORTMENT');
assert.equal(classifyAvailability({storeId:'val-fleuri',productNumber:'A',availableQty:-1,index:null}).state,'STOCK_ANOMALY');

const d365=normalizeConnector({key:'d365',family:'ERP',capabilities:{'inventory.stock.read':'LIVE','merchandising.assortment.read':'LIVE'}});
const pos=normalizeConnector({key:'pos',family:'POS',capabilities:{'sales.transactions.read':'LIVE'}});
assert.equal(chooseConnector([d365,pos],'inventory.stock.read').connector.key,'d365');
assert.equal(chooseConnector([d365,pos],'sales.transactions.read').connector.key,'pos');
assert.equal(connectorReadiness([d365,pos]).coverage['merchandising.assortment.read'].ready,true);

const codes=RETAIL_PROCESS_CATALOG.map(x=>x.code);assert.equal(new Set(codes).size,codes.length);
assert.equal(processDefinition('closing_loss').mandatory,true);
assert.equal(processDefinition('store_closing_validation').gate,'STORE_CLOSING');
assert.ok(mandatoryProcessCodes().includes('assortment_sync'));
assert.ok(RETAIL_PROCESS_CATALOG.length>=60);

console.log('StoreOps merchandising + connector + process catalog contract OK');

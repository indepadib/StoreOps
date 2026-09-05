import assert from 'node:assert/strict';
import {inventoryLinePresentation,DEFAULT_INVENTORY_COUNTING_POLICY} from '../../frontend/js/inventory-privacy.js';

const base={id:'l1',theoretical_qty:24,count1_qty:null,count1_by_name:null,variance1:null,count2_qty:null,final_qty:null,final_variance:null};
let x=inventoryLinePresentation({...base,status:'TO_COUNT'},DEFAULT_INVENTORY_COUNTING_POLICY);
assert.equal(x.blind,'FIRST');
assert.equal(x.theoretical,null);
assert.equal(x.count1,null);
assert.equal(x.variance,null);

x=inventoryLinePresentation({...base,status:'RECOUNT',count1_qty:20,count1_by_name:'Compteur A',variance1:-4},DEFAULT_INVENTORY_COUNTING_POLICY);
assert.equal(x.blind,'RECOUNT');
assert.equal(x.theoretical,null);
assert.equal(x.count1,null);
assert.equal(x.count1By,null);
assert.equal(x.variance,null);

x=inventoryLinePresentation({...base,status:'COUNTED',count1_qty:20,count1_by_name:'Compteur A',variance1:-4,count2_qty:18,final_qty:18,final_variance:-6},DEFAULT_INVENTORY_COUNTING_POLICY);
assert.equal(x.blind,null);
assert.equal(x.theoretical,24);
assert.equal(x.count1,20);
assert.equal(x.final,18);
assert.equal(x.variance,-6);

x=inventoryLinePresentation({...base,status:'TO_COUNT'},{blindFirstCount:false,blindRecount:false});
assert.equal(x.blind,null);
assert.equal(x.theoretical,24);
console.log('StoreOps V1.25 blind inventory presentation tests passed');

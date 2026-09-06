import assert from 'node:assert/strict';
import { priorityFromContext,sortManagerActions } from '../../frontend/js/manager-priority-rules.js';

assert.equal(priorityFromContext({category:'STOCK',type:'NEGATIVE',severity:'CRITICAL'}),'P0');
assert.equal(priorityFromContext({category:'STOCK',type:'OUT',severity:'HIGH',promo:true}),'P0');
assert.equal(priorityFromContext({category:'STOCK',type:'OUT',severity:'HIGH'}),'P1');
assert.equal(priorityFromContext({category:'COMMERCIAL',severity:'HIGH',mismatch:true}),'P0');
assert.equal(priorityFromContext({category:'RECEIPT',severity:'HIGH',overdue:true}),'P1');
assert.equal(priorityFromContext({category:'INVENTORY',severity:'NORMAL'}),'P2');

const rows=sortManagerActions([
  {priority:'P2',severity:'NORMAL',category:'INVENTORY',title:'Inventaire'},
  {priority:'P0',severity:'CRITICAL',category:'STOCK',title:'Stock négatif'},
  {priority:'P1',severity:'HIGH',category:'COMMERCIAL',title:'Promo'}
]);
assert.deepEqual(rows.map(x=>x.title),['Stock négatif','Promo','Inventaire']);
console.log('manager-priority-rules: OK');

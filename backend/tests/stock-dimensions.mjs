import assert from 'node:assert/strict';
import { aggregateDimensionRows } from '../services/dynamics-stock.mjs';
const fields={batch:'BatchId',location:'LocationId',status:'StatusId',onHand:'OnHandQuantity',availableOnHand:'AvailableOnHandQuantity'};
const rows=[
 {BatchId:'B1',LocationId:'RAYON',StatusId:'AVAILABLE',OnHandQuantity:3,AvailableOnHandQuantity:2,ReservedOnHandQuantity:1},
 {BatchId:'B1',LocationId:'RAYON',StatusId:'AVAILABLE',OnHandQuantity:4,AvailableOnHandQuantity:4,ReservedOnHandQuantity:0},
 {BatchId:'B2',LocationId:'RESERVE',StatusId:'AVAILABLE',OnHandQuantity:5,AvailableOnHandQuantity:5,ReservedOnHandQuantity:0}
];
const x=aggregateDimensionRows(rows,fields);
assert.equal(x.length,2);
const b1=x.find(r=>r.batch==='B1');assert.equal(b1.rowCount,2);assert.equal(b1.onHandQuantity,7);assert.equal(b1.availableOnHandQuantity,6);assert.equal(b1.reservedOnHandQuantity,1);
const b2=x.find(r=>r.batch==='B2');assert.equal(b2.availableOnHandQuantity,5);
assert.deepEqual(aggregateDimensionRows(rows,{...fields,batch:'',location:'',status:''}),[]);
console.log('StoreOps stock dimension aggregation contract OK');

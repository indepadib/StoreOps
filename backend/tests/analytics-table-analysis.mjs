import assert from 'node:assert/strict';
import {filterAndSortRows} from '../../frontend/analytics/table-analysis.js';
const columns=[{key:'label',value:r=>r.label},{key:'sales',numeric:true,value:r=>r.sales}];
const rows=[{label:'Crème 2',sales:10},{label:'Crème 12',sales:100},{label:'Café',sales:null},{label:'Crème 1',sales:0}];
assert.deepEqual(filterAndSortRows(rows,columns,{label:'creme',sales:'>= 9,5'},{key:'sales',desc:true}).map(r=>r.sales),[100,10]);
assert.equal(filterAndSortRows(rows,columns,{sales:'N/A'},{}).length,1);
assert.deepEqual(filterAndSortRows(rows,columns,{}, {key:'sales',desc:false}).map(r=>r.sales),[0,10,100,null]);
assert.deepEqual(filterAndSortRows(rows,columns,{}, {key:'label',desc:false}).map(r=>r.label),['Café','Crème 1','Crème 2','Crème 12']);

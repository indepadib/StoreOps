import assert from 'node:assert/strict';
const {receiptActions}=await import('../services/manager-inbox-batch.mjs');

const rows=[
 {id:'po-1',po_number:'PO-100',document_type:'PO',vendor:'Centrale',eta:'2026-09-25',status:'EXPECTED',lines:[
  {id:'l1',product_name:'A',quality_control_id:null},
  {id:'l2',product_name:'B',quality_control_id:null},
  {id:'l3',product_name:'C',quality_control_id:'qc-1'}
 ]},
 {id:'to-1',po_number:'TO-200',document_type:'TO',source_origin:'FRP0001',eta:'2026-09-24',status:'EXPECTED',lines:[
  {id:'t1',product_name:'D',quality_control_id:null},
  {id:'t2',product_name:'E',quality_control_id:null}
 ]},
 {id:'po-2',po_number:'PO-POSTED',document_type:'PO',vendor:'X',eta:'2026-09-25',status:'POSTED',lines:[
  {id:'x1',product_name:'X',quality_control_id:null}
 ]}
];

const actions=receiptActions(rows,'2026-09-25');
assert.equal(actions.length,2,'one action per open PO/TO document, never one per line');

const po=actions.find(x=>x.source==='PO');
assert(po);
assert.equal(po.id,'receipt-po-1');
assert.match(po.title,/Réceptionner PO · PO-100/);
assert.match(po.detail,/2 articles à contrôler/);
assert.equal(po.priority,'P1');

const to=actions.find(x=>x.source==='TO');
assert(to);
assert.equal(to.id,'receipt-to-1');
assert.match(to.title,/Réceptionner TO · TO-200/);
assert.match(to.detail,/2 articles à contrôler/);
assert.equal(to.priority,'P0');
assert.equal(to.meta,'En retard');

console.log('V2.31.1 receipt document action aggregation: OK');

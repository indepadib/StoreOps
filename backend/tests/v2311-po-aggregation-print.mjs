import assert from 'node:assert/strict';
import fs from 'node:fs';
import {aggregatePoRows,buildPoPrintHtml} from '../../frontend/js/receipt-aggregation.js';

const rows=[
 {id:'r1',po_number:'PO-100',vendor:'Fournisseur A',source_vendor_account:'V-A',eta:'2026-09-26',source_warehouse_id:'FRP0001',lines:[
  {product_number:'SKU-1',ean:'111',product_name:'Article 1',category:'Épicerie',ordered_qty:10,remaining_qty:6,purchase_unit:'kg',quality_control_id:null},
  {product_number:'SKU-2',ean:'222',product_name:'Article 2',category:'Frais',ordered_qty:2,remaining_qty:2,purchase_unit:'pièce',quality_control_id:'qc1'}
 ]},
 {id:'r2',po_number:'PO-101',vendor:'Fournisseur A',source_vendor_account:'V-A',eta:'2026-09-26',source_warehouse_id:'FRP0001',lines:[
  {product_number:'SKU-1',ean:'111',product_name:'Article 1',category:'Épicerie',ordered_qty:5,remaining_qty:2,purchase_unit:'kg',quality_control_id:null},
  {product_number:'SKU-1',ean:'111',product_name:'Article 1',category:'Épicerie',ordered_qty:1000,remaining_qty:500,purchase_unit:'g',quality_control_id:null}
 ]},
 {id:'r3',po_number:'PO-200',vendor:'Fournisseur B',source_vendor_account:'V-B',eta:'2026-09-27',source_warehouse_id:'FRP0001',lines:[
  {product_number:'SKU-3',ean:'333',product_name:'Article 3',category:'Boissons',ordered_qty:12,remaining_qty:12,purchase_unit:'pièce',quality_control_id:null}
 ]}
];

const groups=aggregatePoRows(rows);
assert.equal(groups.length,2);
const a=groups.find(x=>x.vendorAccount==='V-A');
assert(a);
assert.equal(a.documentCount,2);
assert.equal(a.lineCount,4);
assert.equal(a.controlledLines,1);
assert.equal(a.uniqueArticleCount,3,'SKU-1 kg and SKU-1 g must remain separate');
assert.deepEqual(a.poNumbers,['PO-100','PO-101']);

const skuKg=a.lines.find(x=>x.productNumber==='SKU-1'&&x.unit==='kg');
assert(skuKg);
assert.equal(skuKg.orderedQty,15);
assert.equal(skuKg.remainingQty,8);
assert.deepEqual(skuKg.poNumbers,['PO-100','PO-101']);

const skuG=a.lines.find(x=>x.productNumber==='SKU-1'&&x.unit==='g');
assert(skuG);
assert.equal(skuG.orderedQty,1000);
assert.equal(skuG.remainingQty,500);

const html=buildPoPrintHtml({groups:[a],storeName:'Val Fleuri',title:'Réception test',generatedAt:new Date('2026-09-25T10:00:00Z')});
assert.match(html,/Val Fleuri/);
assert.match(html,/PO-100/);
assert.match(html,/PO-101/);
assert.match(html,/Article 1/);
assert.match(html,/Reste à recevoir/);
assert.match(html,/window\.print\(\)/);
assert.match(html,/@page\{size:A4 landscape/);

const receiptsSource=fs.readFileSync(new URL('../../frontend/js/pages/receipts.js',import.meta.url),'utf8');
assert.match(receiptsSource,/poView='AGGREGATED'/);
assert.match(receiptsSource,/Imprimer tous les PO ouverts/);
assert.match(receiptsSource,/Imprimer le lot/);
assert.match(receiptsSource,/Imprimer ce PO/);
assert.match(receiptsSource,/aggregatePoRows/);

console.log('V2.31.1 PO aggregation + print contract: OK');

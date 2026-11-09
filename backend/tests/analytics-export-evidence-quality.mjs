import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createXlsxBlob} from '../../frontend/analytics/xlsx-workbook.js';
process.env.STOREOPS_DB=':memory:';
const {readMonthlySalesExport:run}=await import('../services/analytics-monthly-export.mjs');
const stores=[{id:'A',name:'A'},{id:'B',name:'B'}];
const period={startDate:'2026-10-01',endDate:'2026-10-01',compareStartDate:'2026-09-01',compareEndDate:'2026-09-01'};
let mode='complete',mixed=false;
const deps={
 readSales:async(id)=>({status:'READY',summary:{sales:id==='A'?10:20,tickets:1},products:[{key:'P',sales:id==='A'?10:20,units:id==='A'?1:1000,quantityByUnit:mixed?(id==='A'?{KG:1}:{G:1000}):{PC:1}}]}),
 readBaskets:async(id,p)=>{
  if(mode==='missing'&&id==='B'&&p.startDate==='2026-10-01')throw Object.assign(Error('not prepared'),{code:'BASKET_NOT_PREPARED'});
  const e={baskets:[{items:[{productNumber:'P',sales:id==='A'?10:20,units:1,unit:'PC'}]}],rejectedIdentity:0};
  if(id==='B'&&p.startDate==='2026-10-01'){
   if(mode==='tickets')e.baskets=[];
   if(mode==='sales')e.baskets[0].items[0].sales=19;
   if(mode==='invalid')e.baskets[0].items[0].sales=null;
   if(mode==='identity')e.rejectedIdentity=1;
  }
  return e;
 },
 readCatalog:async()=>[]
};
const network=r=>r.rows.find(x=>x.scope_type==='NETWORK');
let result=await run(stores,period,deps);
assert.equal(result.status,'READY');assert.equal(network(result).tickets_scope_n,2);
assert.equal(network(result).basket_penetration_pct,100);
assert.equal(network(result).average_basket_with_product,15);
assert.equal(result.summary.currentSales,30);

for(const [caseName,reason] of [['missing','BASKET_NOT_PREPARED'],['tickets','BASKET_TICKETS_MISMATCH'],['sales','BASKET_SALES_MISMATCH'],['identity','BASKET_IDENTITY_INCOMPLETE'],['invalid','BASKET_INVALID_SALES']]){
 mode=caseName;result=await run(stores,period,deps);const row=network(result);
 assert.equal(result.status,'PARTIAL',caseName);
 assert.equal(result.summary.currentSales,30,'available sales stay usable');
 for(const field of ['tickets_scope_n','tickets_with_product_n','basket_penetration_pct','average_basket_with_product','promotion_sales','top_association_tickets'])assert.equal(row[field],null,caseName+': '+field);
 assert.equal(row.basket_source_status_n,'UNAVAILABLE');
 assert.equal(row.basket_source_status_n1,'READY','comparison has independent coverage');
 assert.equal(result.rows.find(x=>x.store_id==='A').tickets_scope_n,1,'healthy store is still usable');
 assert.equal(result.rows.find(x=>x.store_id==='B').tickets_scope_n,null);
 assert.equal(result.diagnostics.basketErrors[0].current,reason);
}
mode='complete';mixed=true;result=await run(stores,period,deps);
assert.equal(network(result).quantity_n,null,'kg and g are never summed as a naked quantity');
assert.equal(network(result).quantity_unit_n,'');
assert.equal(result.rows.find(x=>x.store_id==='A').quantity_n,1);
assert.equal(result.rows.find(x=>x.store_id==='A').quantity_unit_n,'KG');
assert.equal(result.rows.find(x=>x.store_id==='B').quantity_n,1000);
assert.equal(result.rows.find(x=>x.store_id==='B').quantity_unit_n,'G');

const changed={...deps,readSales:async(id,p)=>({status:'READY',summary:{sales:10,tickets:1},products:[{key:'P',sales:10,units:p.startDate==='2026-10-01'?1000:1,quantityByUnit:p.startDate==='2026-10-01'?{G:1000}:{KG:1}}]}),readBaskets:async()=>({baskets:[{items:[{productNumber:'P',sales:10,units:1,unit:'PC'}]}]})};
result=await run([stores[0]],period,changed);
assert.equal(network(result).quantity_unit,'','no shared unit is claimed across changed units');
assert.equal(network(result).quantity_unit_n,'G');assert.equal(network(result).quantity_unit_n1,'KG');
assert.equal(network(result).quantity_delta,null);assert.equal(network(result).ca_price_effect,null);
assert.equal(network(result).realized_price_evolution_pct,null,'no artificial price change from g/kg');
await assert.rejects(run([],period,deps),{code:'MONTHLY_EXPORT_STORES_REQUIRED'});
const mixedBaskets={...deps,readBaskets:async(id)=>({baskets:[{items:[{productNumber:'P',sales:id==='A'?10:20,units:id==='A'?1:1000,unit:id==='A'?'KG':'G'}]}]})};
result=await run(stores,period,mixedBaskets);
assert.equal(network(result).units_per_containing_ticket,null,'unknown mixed-unit quantities per basket must not become zero');

// Exercise the actual workbook preparation from compact API rows.
mode='missing';const partial=await run(stores,period,deps);
const ui=readFileSync(new URL('../../frontend/analytics/monthly-sales-export.js',import.meta.url),'utf8').replace(/^import[^;]+;\s*/,'');
const context={window:{},document:{getElementById:()=>null}};
vm.runInNewContext(ui+';globalThis.sheets=buildSheets',context);
const sheets=context.sheets({...partial,dataStatus:partial.status},partial.rows.map(r=>partial.columns.map(c=>r[c.key]??null)));
const summary=sheets.find(x=>x.name.startsWith('01'));
assert.equal(summary.rows.find(r=>r[0]==='Statut des données')[1],'PARTIAL');
const quality=sheets.find(x=>x.name==='07 Qualité données');
assert(quality.rows.some(r=>r.includes('Paniers non préparés')));
const details=sheets.find(x=>x.name.startsWith('05'));
assert(details.keys.includes('quantity_unit_n'));assert(details.keys.includes('quantity_unit_n1'));
assert((await (await createXlsxBlob(sheets)).arrayBuffer()).byteLength>0,'partial report can be serialized as an actual workbook');
const zero={...deps,readSales:async()=>({status:'READY',summary:{sales:0,tickets:0},products:[]}),readBaskets:async()=>({baskets:[]})};
result=await run(stores,period,zero);assert.equal(result.status,'READY');assert.equal(result.summary.currentSales,0);
console.log('PASS export multi-store basket coverage, sales/ticket reconciliation, independent comparison and homogeneous quantities');

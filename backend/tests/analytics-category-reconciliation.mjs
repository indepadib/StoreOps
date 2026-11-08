import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildReliableCategories,categorySummaryLines} from '../../frontend/analytics/category-reconciliation.js';

const decision={
 summary:{current:{sales:232245.88}},
 period:{startDate:'2026-10-01',endDate:'2026-10-31'},
 hierarchy:{rayon:[{key:'__UNCLASSIFIED__',label:'Non classé',sales:232245.88,previousSales:229875.72,articles:3}]},
 products:[
  {key:'HS-0001',sales:100000,previousSales:90000},
  {key:'HS-0002',sales:80000,previousSales:95000},
  {key:'HS-0003',sales:52245.88,previousSales:44875.72}
 ]
};
const unknown=buildReliableCategories(decision);
assert.equal(unknown.status,'UNAVAILABLE','A single Non classé group is a data-quality failure, not a valid category');
assert.equal(unknown.rows.length,0,'Never publish a fake category called Non classé');
assert.equal(unknown.unknownSales,232245.88);
assert.equal(unknown.coveragePct,0);
const none=categorySummaryLines(unknown,x=>x+' DH',x=>String(x));
assert(none.some(x=>/classification|répartition|rayon/i.test(x)));
assert(none.some(x=>/232245.88/.test(x)),'Total CA remains visible without fabricating classification');
const catalog=new Map([
 ['HS-0001',{productNumber:'HS-0001',hierarchyStatus:'RESOLVED',hierarchy:{rayon:{id:'001005',label:'Épicerie',labelStatus:'RESOLVED'}}}],
 ['HS-0002',{productNumber:'HS-0002',hierarchyStatus:'PARTIAL',hierarchy:{rayon:{id:'001006',label:'Boissons',labelStatus:'RESOLVED'}}}],
 ['HS-0003',{productNumber:'HS-0003',hierarchyStatus:'MISSING',hierarchy:{}}]
]);
const recovered=buildReliableCategories(decision,catalog);
assert.equal(recovered.source,'PRODUCT_CATALOG_HIERARCHY','The already-enriched product catalogue must recover categories');
assert.equal(recovered.status,'PARTIAL');
assert.equal(recovered.categoryCount,2);
assert.equal(recovered.classified,180000);
assert.equal(recovered.unknownSales,52245.88);
assert.equal(recovered.rows[0].label,'Épicerie');
assert.equal(recovered.rows[1].label,'Boissons');
assert.equal(recovered.rows[0].sharePct,43.06);
assert.equal(recovered.rows[1].change,-15.79,'Movement must use previous CA of the same known products');
const lines=categorySummaryLines(recovered,x=>x+' DH',x=>String(x));
assert(lines.some(x=>/Épicerie/.test(x)&&/du CA/.test(x)));
assert(lines.some(x=>/Articles non classés/.test(x)&&/52245.88/.test(x)));
assert(Math.abs(recovered.classified+recovered.unknownSales-recovered.total)<.01);
const fullyClassified=new Map(catalog);
fullyClassified.set('HS-0003',{productNumber:'HS-0003',hierarchyStatus:'RESOLVED',hierarchy:{rayon:{id:'001005',label:'Épicerie',labelStatus:'RESOLVED'}}});
const ready=buildReliableCategories(decision,fullyClassified);
assert.equal(ready.status,'READY');
assert.equal(ready.unknownSales,0);
assert.equal(ready.rows.length,2);
assert.equal(ready.rows[0].sales,152245.88);
const alreadyMapped={...decision,hierarchy:{rayon:[
 {key:'001005',label:'Épicerie',sales:150000,previousSales:145000,articles:2},
 {key:'__UNCLASSIFIED__',label:'Non classé',sales:82245.88,previousSales:84875.72,articles:1}
]}};
const retained=buildReliableCategories(alreadyMapped,new Map([['HS-0001',catalog.get('HS-0001')]]));
assert.equal(retained.source,'DECISION_LOCAL_HIERARCHY','Do not replace a better server breakdown with incomplete asynchronous enrichment');
assert.equal(retained.classified,150000);
const unreliable=new Map([['HS-0001',{hierarchy:{rayon:{id:'001005',label:'001005',labelStatus:'MISSING'}}}]]);
assert.equal(buildReliableCategories(decision,unreliable).status,'UNAVAILABLE','Do not expose category codes as readable names');
const divergent={...decision,products:[{key:'HS-0001',sales:1000,previousSales:600}]};
assert.equal(buildReliableCategories(divergent,catalog).status,'UNAVAILABLE','Catalog mapping from an unreconciled product base must never replace server revenue');
const html=readFileSync(new URL('../../frontend/analytics/decision-studio.js',import.meta.url),'utf8');
assert.match(html,/from '.\/category-reconciliation\.js'/);
assert.match(html,/categorySummaryLines\(categoryReport,money,number\)/);
assert.match(html,/Couverture du CA par rayon/);
assert.match(html,/classification\.status==='UNAVAILABLE'/);
for(const name of ['category-reconciliation.js','decision-studio.js']){
 const path=fileURLToPath(new URL('../../frontend/analytics/'+name,import.meta.url));
 const check=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
 assert.equal(check.status,0,name+': '+check.stderr)
}
console.log('PASS: fake unclassified category suppressed, catalog enriched labels recovered, unknown CA retained and exact sales reconciled.');

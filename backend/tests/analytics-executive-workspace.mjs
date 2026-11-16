import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../../frontend/analytics/'+name,import.meta.url),'utf8');
const html=read('index.html'),css=read('executive-workspace.css');
assert.match(html,/executive-workspace\.css/);
assert.match(html,/id="executiveOnePager"[^>]*aria-labelledby="briefTitle"/);
assert.equal([...html.matchAll(/id="briefTitle"/g)].length,1);
for(const id of ['briefPeriod','briefKpis','briefGrid','briefQuality','briefPng','briefPrint'])assert.match(html,new RegExp('id="'+id+'"'));
assert.match(css,/body\[data-analytics-section="overview"\] #riExperience/);
assert.match(css,/backdrop-filter/);
assert.match(css,/@media print/);
assert.match(css,/prefers-reduced-transparency/);
console.log('PASS executive layout, accessibility and export structure');

const {buildExecutiveBrief}=await import('../../frontend/analytics/executive-brief.js');
const period={periodStart:'2026-11-10',periodEnd:'2026-11-12',compareStart:'2026-11-07',compareEnd:'2026-11-09'};
const data={
 coverage:{storesRequested:2,currentStoresReady:2,comparisonStoresReady:2},quality:{status:'OK'},
 summary:{current:{sales:200,identifiedSalesShare:35,promotionSales:20},previous:{sales:250},drivers:{trafficEffect:-60,basketEffect:10,reconciliationGap:0}},
 stores:[{status:'READY',storeName:'A',sales:100,previousSales:150},{status:'READY',storeName:'B',sales:100,previousSales:100}],
};
const model=(today,override={})=>buildExecutiveBrief({data:{...data,...override},period,selectedStores:2,scopeLabel:'Réseau',today});
assert.deepEqual(model('2026-11-13').signals.map(card=>card.section),['sales','network','loyalty','promotions']);
assert.equal(model('2026-11-13').signals[1].rows.length,1);
assert.deepEqual(model('2026-11-12').signals.map(card=>card.section),['network','loyalty','promotions']);
assert.equal(model('2026-11-12').signals[0].rows.length,2);
assert.equal(model('2026-11-13',{quality:{status:'WARN',checks:{truncatedStores:1}}}).signals.length,0);

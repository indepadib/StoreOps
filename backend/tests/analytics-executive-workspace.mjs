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
assert.deepEqual(model('2026-11-13').signals.map(card=>card.section),['sales','loyalty','promotions','detention']);
assert.equal(model('2026-11-13').reading.loss.leader,'A');
assert.equal(model('2026-11-13').reading.stable,1);
assert.equal(model('2026-11-13').reading.loss.share,100);
assert.match(model('2026-11-13').reading.driver,/tickets/);
assert.equal(model('2026-11-12').reading,null);
assert.equal(model('2026-11-13',{stores:[{status:'READY',sales:100,previousSales:150}]}).reading,null);
assert.equal(model('2026-11-13',{stores:[{...data.stores[0],sales:600},data.stores[1]]}).reading,null);
assert.deepEqual(model('2026-11-12').signals.map(card=>card.section),['network','loyalty','promotions','detention']);
assert.equal(model('2026-11-12').signals[0].rows.length,2);
assert.equal(model('2026-11-13',{quality:{status:'WARN',checks:{truncatedStores:1}}}).signals.length,0);

assert.match(model('2026-11-13').pace.indicators[0].value,/^66[,.]67 DH$/);
const liveDaily={current:[{date:'2026-11-10',sales:80,tickets:8},{date:'2026-11-11',sales:100,tickets:10},{date:'2026-11-12',sales:999,tickets:99}],previous:[{date:'2026-11-07',sales:40,tickets:4},{date:'2026-11-08',sales:60,tickets:6},{date:'2026-11-09',sales:999,tickets:99}]};
const live=model('2026-11-12',{daily:liveDaily});
assert.equal(live.pace.indicators[0].value,'90 DH');
assert.match(live.pace.indicators[0].detail,/50 DH.*\+80 %.*\+40 DH/);
assert.equal(live.pace.indicators[1].value,'9');
assert.equal(model('2026-11-12',{daily:{...liveDaily,current:liveDaily.current.slice(0,1)}}).pace.indicators[0].value,'Indisponible');
assert.equal(model('2026-11-13',{quality:{status:'ERROR'}}).pace.indicators[0].detail,'Comparaison indisponible');

const hierRows=[{label:'Frais',sales:120,previousSales:150},{label:'PGC',sales:80,previousSales:100}];
const ranks=model('2026-11-13',{hierarchy:{department:hierRows,rayon:hierRows,family:hierRows},products:Array.from({length:8},(_,i)=>({key:'SKU'+i,label:'Article '+i,sales:25}))}).rankings;
assert.deepEqual(Object.keys(ranks),['department','rayon','family','product']);
assert.deepEqual(ranks.department.map(row=>row.label),['Frais','PGC']);
assert.equal(ranks.department[0].change,'-30 DH');
assert.equal(ranks.product.length,5);
assert.equal(model('2026-11-13',{hierarchy:{department:[{label:'Frais',sales:30}]}}).rankings.department.length,0);
assert.equal(model('2026-11-13').signals.find(card=>card.section==='detention').rows[0].value,'Indisponible');
const dates=read('analytics.js');
assert.match(dates,/periodStart: shiftDate\(initialDate, -7\)/);
assert.match(dates,/periodEnd: shiftDate\(initialDate, -1\)/);
assert.match(dates,/preset === '7d'\) \{ state.periodEnd = shiftDate\(today, -1\); state.periodStart = shiftDate\(today, -7\)/);
assert.match(html,/id="briefRanking"/);
assert.match(read('decision-studio.js'),/canvas\.width=1920;canvas\.height=1080;/);

const studio=read('decision-studio.js');
assert.match(studio,/data-brief-prepare-stock/);
assert.match(studio,/const task=loadStockBrief\(true\)/);

const catalog=new Map([['A',{nameStatus:'RESOLVED',productName:'Nom complet',hierarchy:{department:{id:'D',label:'Frais'},rayon:{id:'R',label:'Crèmerie'},family:{id:'F',label:'Yaourts'}}}],['B',{nameStatus:'SEARCH_ONLY',searchName:'SEARCH-B',hierarchy:{department:{id:'X',label:'PGC'}}}]]);
const enriched=buildExecutiveBrief({data:{...data,products:[{key:'A',label:'SEARCH-A',sales:140,previousSales:160},{key:'B',label:'SEARCH-B',sales:60,previousSales:90}]},period,selectedStores:2,scopeLabel:'Réseau',today:'2026-11-13',catalog});
assert.equal(enriched.rankings.product[0].label,'Nom complet');
assert.equal(enriched.rankings.product[1].label,'B');
assert.equal(enriched.rankings.product[1].missingName,true);
assert.equal(enriched.rankings.rayon[0].label,'Crèmerie');
assert.equal(enriched.rankings.family[0].label,'Yaourts');
assert.equal(enriched.rankingCoverage.rayon,70);
assert.equal(enriched.rankings.rayon[0].change,'—');

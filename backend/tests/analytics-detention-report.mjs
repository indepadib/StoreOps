import assert from 'node:assert/strict';
import {detentionReport,detentionHtml,detentionCsv} from '../../frontend/analytics/detention-report.js';
const stores=[{id:'a',name:'A'},{id:'b',name:'B'}],pgc={department:{label:'PGC'},rayon:{label:'Liquides'},family:{label:'Jus'},ub:{label:'1L'}},items=[{productNumber:'P1',productName:'<script>alert(1)</script>',warehouseAvailable:4,vendorName:'Extenc International Partner',hierarchy:pgc,unit:'PC'},{productNumber:'P2',warehouseAvailable:3,vendorName:'Local',hierarchy:pgc,unit:'PC'},{productNumber:'P3',warehouseAvailable:0,hierarchy:{department:{label:'APLS'}}}];
const rows=stores.flatMap((s,i)=>items.map((r,j)=>({...r,storeId:s.id,storeName:s.name,storeAvailable:j===2?-1:i===0?0:2}))),meta=stores.map(s=>({storeId:s.id,stockComplete:true,supplyComplete:true,referenceComplete:true,supplyWarehouseId:'W',stockReadAt:'stock',warehouseReadAt:'supply'})),histories=Object.fromEntries(stores.flatMap(s=>['store','supply'].map(k=>[s.id+'|'+k,{complete:true,checkedAt:'history',products:items.map(r=>({productNumber:r.productNumber,firstReceiptDate:'2026-01-01'}))}])));
const input={stores,rows,meta,histories,complete:true,generatedAt:'2026-10-30T12:00:00Z'},r=detentionReport(input);
assert.equal(r.sections.filter(s=>s.kind==='supply').length,1);assert.equal(r.sections.length,5);assert.equal(r.network.find(x=>x.kind==='store').base,6);assert.equal(r.network.find(x=>x.kind==='store').rate,2/6*100);assert.equal(r.network.find(x=>x.kind==='relative').rate,50);assert.equal(r.sections.find(s=>s.kind==='supply').summaries[0].rate,2/3*100);
assert.equal(r.sections.find(s=>s.kind==='store').summaries.find(s=>s.axis==='Origine'&&s.group==='IMPORT').base,1);assert.ok(r.sections[0].summaries.some(s=>s.axis==='Département × origine'));assert.equal(r.actions.length,2);assert.ok(r.actions.every(x=>x.gap==='WAREHOUSE_ONLY'));assert.equal(r.inventory.length,6);assert.equal(r.complete,true);
const csv=detentionCsv(r);assert.equal(csv.split('\r\n').length-1,new Set(r.inventory.map(v=>v.code)).size);assert.match(csv,/PC/);assert.match(csv,/1L/);assert.ok(detentionHtml(r).includes('\\u003cscript'));assert.match(detentionHtml(r),/id="department"/);assert.doesNotMatch(detentionHtml(r),/<script>alert/);
const partial=detentionReport({...input,histories:{...histories,'a|store':{complete:false,products:[]}}});assert.equal(partial.sections[0].summaries[0].rate,null);assert.equal(partial.complete,false);
const unknown=detentionReport({...input,rows:[...rows,{storeId:'a',productNumber:'UNCLASSIFIED',warehouseAvailable:2,storeAvailable:1}]});assert.equal(unknown.sections.find(s=>s.kind==='relative').summaries[0].rate,null);
const special=detentionReport({...input,rows:[{...rows[0],storeAvailable:2,warehouseAvailable:0},{...rows[0],productNumber:'UNKNOWN',storeAvailable:0,warehouseAvailable:null},{...rows[0],productNumber:'NEG',storeAvailable:-2,warehouseAvailable:3}]});assert.deepEqual(special.inventory.map(x=>x.gap),['STORE_ONLY','UNKNOWN','CHECK']);assert.equal(special.actions.length,1);
const many=detentionReport({...input,rows:Array.from({length:400},(_,i)=>({...rows[0],productNumber:'X'+i}))});assert.equal(many.inventory.length,400);assert.match(detentionHtml(many),/X399/);assert.equal(detentionCsv(many).split('\r\n').length,401);
// Exercise the standalone report controls and ensure CSV exports all filtered rows, not only its displayed page.
const {mountDetentionReport}=await import('../../frontend/analytics/detention-report-ui.js');
class Element{constructor(){this.children=[];this.value='';this.textContent='';this.classList={toggle(){}}}appendChild(x){this.children.push(x)}replaceChildren(){this.children=[]}scrollIntoView(){}click(){}}
const dom=Object.fromEntries(['reportData','store','department','origin','gap','search','storeComparison','positions','warehouseOnlyCount','storeOnlyCount','bothCount','coverage','departments','articles','rowCount','previous','next','warehouseOnlyCard','storeOnlyCard','bothCard','sort','reset','export','print'].map(id=>[id,new Element()]));
const sample=Array.from({length:250},(_,i)=>({...r.inventory[0],code:'C'+i,department:i<150?'PGC':'APLS',gap:i%2?'STORE_ONLY':'WAREHOUSE_ONLY'}));dom.reportData.textContent=JSON.stringify({inventory:sample});let exported;
globalThis.document={getElementById:id=>dom[id],createElement:()=>new Element()};Element.prototype.addEventListener=function(name,fn){this[name]=fn};globalThis.addEventListener=()=>{};globalThis.window={print(){}};const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldTimer=globalThis.setTimeout;URL.createObjectURL=b=>{exported=b;return'blob:test'};URL.revokeObjectURL=()=>{};globalThis.setTimeout=()=>{};
mountDetentionReport();assert.equal(dom.positions.textContent,'250');assert.equal(dom.articles.children[1].children.length,100);dom.department.value='PGC';dom.department.change();assert.equal(dom.positions.textContent,'150');dom.export.onclick();assert.equal((await exported.text()).split('\r\n').length,151);dom.warehouseOnlyCard.onclick();assert.match(dom.rowCount.textContent,/75 références/);dom.storeOnlyCard.onclick();assert.match(dom.rowCount.textContent,/75 références/);dom.reset.onclick();assert.equal(dom.positions.textContent,'250');URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;globalThis.setTimeout=oldTimer;
console.log('PASS detention global summary, department filtering, reciprocal availability gaps, unique article-store CSV, full filtered export beyond pagination, unknowns and safe standalone HTML');

const {groupDetentionReferences,detentionGap}=await import('../../frontend/analytics/detention-report-ui.js');assert.equal(groupDetentionReferences(r.inventory).length,3);assert.equal(groupDetentionReferences(r.inventory)[0].variants.length,2);assert.equal(detentionGap({stock:0,warehouse:2,expected:false}),'OUTSIDE');assert.equal(detentionGap({stock:-1,warehouse:2,expected:true}),'CHECK');
// Two stores with a shared SKU count as one reference in the UI and export; store filters retain the right quantities.
dom.reportData.textContent=JSON.stringify({inventory:r.inventory});for(const el of Object.values(dom)){el.value='';el.children=[]}mountDetentionReport();assert.equal(dom.positions.textContent,'3');assert.equal(dom.warehouseOnlyCount.textContent,'2');assert.equal(dom.storeComparison.children[1].children.length,2);dom.store.value='B';dom.store.change();assert.equal(dom.positions.textContent,'3');assert.equal(dom.warehouseOnlyCount.textContent,'0');

// The Excel action must deliver a real multi-sheet OOXML package, not a renamed CSV.
const {detentionXlsx,detentionSheets,detentionSummaryRows}=await import('../../frontend/analytics/detention-workbook.js');
const sheets=detentionSheets(r),summary=sheets[0].rows;
assert.equal(sheets.length,6);assert.equal(sheets[0].name,'Synthèse');
assert.equal(summary.filter(x=>x[0]==='Entrepôt'&&x[2]==='Global').length,1);
assert.equal(summary.filter(x=>x[0]==='Magasin'&&x[3]==='APLS').length,2);
assert.equal(summary.filter(x=>x[0]==='Magasin'&&x[3]==='PGC').length,2);
assert.equal(sheets.find(s=>s.name==='Détail magasins').rows.length,7);
const relativeDetail=sheets.find(s=>s.name==='Détail relatif PGC').rows.slice(1);
assert.equal(relativeDetail.length,4);assert.ok(relativeDetail.every(x=>x[2]==='PGC'&&x[13]>0));
for(const scope of ['A','B']){const detail=relativeDetail.filter(x=>x[1]===scope),m=summary.find(x=>x[0]==='Relative PGC'&&x[1]===scope&&x[2]==='Global');assert.equal(m[4],detail.length);assert.equal(m[5],detail.reduce((n,x)=>n+x[12],0));assert.equal(m[8].value,m[5]/m[4]);}
assert.equal(typeof detentionSheets(partial)[0].rows.find(x=>x[0]==='Magasin'&&x[1]==='A'&&x[2]==='Global')[8],'string');
const bytes=await detentionXlsx(r),dv=new DataView(bytes.buffer),files=new Map();let offset=0;
while(dv.getUint32(offset,true)===0x04034b50){const size=dv.getUint32(offset+18,true),n=dv.getUint16(offset+26,true),extra=dv.getUint16(offset+28,true),start=offset+30+n+extra;files.set(new TextDecoder().decode(bytes.slice(offset+30,offset+30+n)),new TextDecoder().decode(dv.getUint16(offset+8,true)===8?(await import('node:zlib')).inflateRawSync(bytes.slice(start,start+size)):bytes.slice(start,start+size)));offset=start+size;}
assert.equal(dv.getUint32(offset,true),0x02014b50);assert.equal(files.size,11);
assert.match(files.get('xl/workbook.xml'),/Détail relatif PGC/);assert.match(files.get('xl/worksheets/sheet1.xml'),/<f>F2\/E2<\/f>/);assert.match(files.get('xl/worksheets/sheet1.xml'),/autoFilter/);assert.match(files.get('xl/worksheets/sheet3.xml'),/state="frozen"/);
assert.doesNotMatch(files.get('xl/worksheets/sheet4.xml'),/<script>/);assert.match(files.get('xl/worksheets/sheet4.xml'),/&lt;script&gt;/);
const html=detentionHtml(r);assert.match(html,/id="businessSummary"/);assert.match(html,/id="businessArticles"/);assert.match(html,/Global et focus PGC \/ APLS/);
assert.equal(detentionSummaryRows(r).find(x=>x.vision==='Relative PGC'&&x.scope==='B'&&x.axis==='Global').rate,1);
console.log('PASS complete XLSX package: six sheets, shared warehouse once, PGC/APLS store rates, relative denominator and 1/0 detail, missing rates, formula caches and XML escaping');

const {mountDetentionBusiness}=await import('../../frontend/analytics/detention-business-ui.js');
const businessDom=Object.fromEntries(['reportData','businessScope','businessDepartment','businessVision','businessSearch','businessSummary','businessDepartments','businessArticles','businessCount','businessPrevious','businessNext'].map(id=>[id,new Element()]));
businessDom.reportData.textContent=JSON.stringify({business:{summaries:detentionSummaryRows(r),details:(await import('../../frontend/analytics/detention-workbook.js')).detentionBusinessRows(r)}});
mountDetentionBusiness({querySelector:s=>businessDom[s.slice(1)]});
assert.ok(businessDom.businessSummary.children[1].children.length>5);
businessDom.businessScope.value='B';businessDom.businessVision.value='Relative PGC';businessDom.businessScope.change();
assert.equal(businessDom.businessArticles.children[1].children.length,2);
assert.ok(businessDom.businessArticles.children[1].children.every(tr=>tr.children[2].textContent==='PGC'&&tr.children[12].textContent===1));
businessDom.businessDepartment.value='APLS';businessDom.businessDepartment.change();assert.equal(businessDom.businessArticles.children[1].children.length,0);
console.log('PASS visible business synthesis and detailed scope, vision and department filters');

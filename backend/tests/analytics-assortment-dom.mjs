import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
const {parseHTML}=await import(process.env.STOREOPS_TEST_DOM_MODULE||'linkedom');


const {window,document}=parseHTML('<html><head></head><body><main id="detentionViews"></main></body></html>');
Object.defineProperties(window.HTMLSelectElement.prototype,{value:{configurable:true,get(){return [...this.querySelectorAll('option')].find(o=>o.hasAttribute('selected'))?.value||this.querySelector('option')?.value||''},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value)}},selectedOptions:{configurable:true,get(){return [...this.querySelectorAll('option')].filter(o=>o.value===this.value)}}});
globalThis.window=window;globalThis.document=document;globalThis.CustomEvent=window.CustomEvent;globalThis.Option=function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option};
let lastBlob;
URL.createObjectURL=blob=>{lastBlob=blob;return'blob:qa'};URL.revokeObjectURL=()=>{};
const sourceProducts=[{productNumber:'A',sales:120,quantityByUnit:{PC:12}},{productNumber:'B',sales:80,quantityByUnit:{PC:8}},...Array.from({length:200},(_,n)=>({productNumber:'SKU'+n,sales:1,quantityByUnit:{KG:1}}))];
const state={stores:[{id:'val-fleuri',name:'Val Fleuri'},{id:'trefle',name:'Trèfle'}],periodStart:'2026-11-01',periodEnd:'2026-11-02',tenant:'franprix'};
let refreshed=false,historyEvents=0;document.addEventListener('retail-intelligence:detention-history-ready',()=>historyEvents++);
window.RETAIL_INTELLIGENCE={getState:()=>state,money:n=>String(n)+' MAD',api:async url=>{const u=new URL(url,'https://qa.invalid');if(u.pathname.endsWith('/history'))return{complete:true,products:[{productNumber:'B'},...(refreshed?[{productNumber:'A'}]:[])]};if(u.pathname.endsWith('/history/prepare')){assert.equal(u.searchParams.get('force'),'1');refreshed=true;return{nextCursor:null,snapshot:'test',scanned:2}}if(u.pathname.endsWith('/sales'))return{status:'READY',storeId:u.searchParams.get('storeId'),startDate:u.searchParams.get('start'),endDate:u.searchParams.get('end'),days:2,products:u.searchParams.get('storeId')==='val-fleuri'?sourceProducts:[]};if(u.pathname.endsWith('/catalog'))return{items:[{productNumber:'A',productName:'Jus orange test',vendorName:'Extenc',hierarchy:{department:{label:'PGC'}}}]};throw Error('Unknown fixture route')}};
await import('../../frontend/analytics/assortment-opportunities.js');
const el=q=>document.querySelector(q);
await el('[data-load]').onclick();
assert.match(el('[data-count]').textContent,/201 \/ 201/);assert.equal(el('[data-grid] tbody').children.length,100);
el('[data-next]').onclick();assert.match(el('[data-page]').textContent,/2 \/ 3/);
await el('[data-csv]').onclick();assert.equal((await lastBlob.text()).split('\r\n').length,202,'full filtered CSV exceeds displayed page');
const sourceFilter=el('input[aria-label="Filtrer CA source"]');sourceFilter.value='>100';sourceFilter.oninput();await new Promise(r=>setTimeout(r,180));
assert.match(el('[data-count]').textContent,/1 \/ 201/);assert.equal(el('[data-grid] tbody').children.length,1);
await el('[data-csv]').onclick();assert.equal((await lastBlob.text()).split('\r\n').length,2);
el('[data-export-columns]').value='all';await el('[data-csv]').onclick();assert.match((await lastBlob.text()).split('\r\n')[0],/Sous-sous-famille/);
el('[data-export-rows]').value='all';await el('[data-csv]').onclick();assert.equal((await lastBlob.text()).split('\r\n').length,202,'unfiltered export is an explicit separate choice');el('[data-export-rows]').value='filtered';
await el('[data-catalog]').onclick();assert.match(el('[data-grid] tbody').textContent,/Jus orange test/);
el('[data-group]').value='department';el('[data-group]').onchange();
await el('[data-xlsx]').onclick();
const files=new Map(),bytes=Buffer.from(await lastBlob.arrayBuffer());let position=0;
while(position+30<bytes.length&&bytes.readUInt32LE(position)===0x04034b50){const method=bytes.readUInt16LE(position+8),size=bytes.readUInt32LE(position+18),names=bytes.readUInt16LE(position+26),extra=bytes.readUInt16LE(position+28),name=bytes.subarray(position+30,position+30+names).toString(),start=position+30+names+extra,raw=bytes.subarray(start,start+size);files.set(name,(method===8?inflateRawSync(raw):raw).toString());position=start+size}
assert.match(files.get('xl/workbook.xml'),/Synthèse regroupée/);assert.match(files.get('xl/worksheets/sheet1.xml'),/Jus orange test/);
el('[data-target-sales]').checked=true;el('[data-target-sales]').onchange();await el('[data-load]').onclick();el('[data-reset]').onclick();el('[data-mode]').value='RECEIVED_NO_SALES';el('[data-mode]').onchange();assert.equal(el('[data-grid] tbody').children.length,1);assert.match(el('[data-grid] tbody').textContent,/B/);
await el('[data-history]').onclick();assert.equal(historyEvents,1);el('[data-mode]').value='NO_RECEIPT';el('[data-mode]').onchange();assert.match(el('[data-count]').textContent,/200 \/ 200/,'a newly received article leaves the gap list after explicit refresh');
console.log('PASS real DOM mount, default VF/Trèfle comparison, 100-row pagination, numeric full-universe filter, 201-row CSV, labels, grouped XLSX and target-no-sales reading');

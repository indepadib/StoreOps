import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {rawbtLink} from '../../frontend/js/rawbt-print.js';
import {escposTestBytes} from '../../frontend/js/escpos-label.js';

const source=readFileSync(new URL('../../frontend/js/dlc-markdown.js',import.meta.url),'utf8').replace(/^import.*;\r?\n/gm,'').replace('export async function','async function');
for(const director of [false,true]){
 const host={innerHTML:''},link={hidden:true};let clickTest;
 const button={addEventListener:(event,fn)=>{clickTest=fn}};
 const context=vm.createContext({app:{stores:[]},isDirector:()=>director,isQualityAudit:()=>false,isAndroid:()=>true,rawbtLink,escposTestBytes,toast:()=>{},esc:String,document:{getElementById:id=>id==='dlcMarkdownContent'?host:id==='mdRawbtTest'?button:id==='mdRawbtTestLink'?link:null,querySelectorAll:()=>[]}});
 vm.runInContext(source+"\nworkspace={recommendations:[],alerts:[],printers:[],posProfiles:[],operations:[],jobs:[]};draw();",context);
 assert.equal((host.innerHTML.match(/id="mdRawbtTest"/g)||[]).length,1);
 assert.ok(host.innerHTML.includes('Aucune validation caisse nécessaire pour ce test'));
 assert.equal(host.innerHTML.includes('id="mdSavePrinter"'),director,'store profile cannot configure printers');
 assert.equal(host.innerHTML.includes('Paramétrage Direction'),director,'direction controls stay restricted');
 if(director)assert.ok(host.innerHTML.indexOf('id="mdRawbtTest"')<host.innerHTML.indexOf('Paramétrage Direction'));
 clickTest();
 assert.equal(link.hidden,false);
 assert.deepEqual([...Buffer.from(link.href.split(',')[1],'base64').subarray(0,2)],[27,64]);
 assert.ok(!Buffer.from(link.href.split(',')[1],'base64').includes(Buffer.from('^XA')));
 vm.runInContext("app.storeId='val-fleuri';app.user={role:'store_manager',store_id:'val-fleuri'};",context);
 const card=vm.runInContext("recommendationCard({id:'test',status:'ACTION_REQUIRED',markdownCode:'MD20',quantityToReview:1,productName:'Test',productNumber:'HS-005943'})",context);
 assert.match(card,/<option value="MD50">/);
 assert.ok(!/<select data-md-code="test"[^>]*disabled/.test(card),'store manager can choose MD50');
}
console.log('RawBT test visible in store/director views; administration remains restricted: OK');

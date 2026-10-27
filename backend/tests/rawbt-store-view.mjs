import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../frontend/js/dlc-markdown.js',import.meta.url),'utf8').replace(/^import.*;\r?\n/gm,'').replace('export async function','async function');
for(const director of [false,true]){
 const host={innerHTML:''};
 const context=vm.createContext({app:{stores:[]},isDirector:()=>director,isQualityAudit:()=>false,esc:String,document:{getElementById:id=>id==='dlcMarkdownContent'?host:null,querySelectorAll:()=>[]}});
 vm.runInContext(source+"\nworkspace={recommendations:[],alerts:[],printers:[],posProfiles:[],operations:[],jobs:[]};draw();",context);
 assert.equal((host.innerHTML.match(/id="mdRawbtTest"/g)||[]).length,1);
 assert.ok(host.innerHTML.includes('Aucune validation caisse nécessaire pour ce test'));
 assert.equal(host.innerHTML.includes('id="mdSavePrinter"'),director,'store profile cannot configure printers');
 assert.equal(host.innerHTML.includes('Paramétrage Direction'),director,'direction controls stay restricted');
 if(director)assert.ok(host.innerHTML.indexOf('id="mdRawbtTest"')<host.innerHTML.indexOf('Paramétrage Direction'));
}
console.log('RawBT test visible in store/director views; administration remains restricted: OK');

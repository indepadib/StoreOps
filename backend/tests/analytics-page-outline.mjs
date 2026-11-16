import {pageOutline,jumpToPagePanel} from '../../frontend/analytics/page-outline.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const get=name=>readFileSync(new URL('../../frontend/analytics/'+name,import.meta.url),'utf8');
const html=get('index.html');
assert.deepEqual(Object.keys(pageOutline).sort(),[...html.matchAll(/data-section="(\w+)"/g)].map(([,id])=>id).sort());
for(const targets of Object.values(pageOutline)){
 assert.ok(targets.length>=2);
 for(const [,id] of targets){
  if(id==='detentionViews')assert.match(get('detention-views.js'),/host.id='detentionViews'/);
  else assert.ok(html.includes('id="'+id+'"'),id);
 }
}
const calls=[];
let visible=false;
const panel={
 tabIndex:-1,closest:()=>null,getClientRects:()=>visible?[{}]:[],
 hasAttribute:()=>false,setAttribute:(key,value)=>calls.push([key,value]),
 focus:options=>calls.push(['focus',options]),
 scrollIntoView:options=>calls.push(['scroll',options])
};
assert.equal(jumpToPagePanel(panel,{showAll:()=>{visible=true},reduceMotion:true}),true);
assert.deepEqual(calls,[['tabindex','-1'],['focus',{preventScroll:true}],['scroll',{behavior:'instant',block:'start'}]]);
assert.equal(jumpToPagePanel({...panel,closest:()=>({hidden:true})},{showAll:()=>assert.fail('Disabled panel must stay hidden')}),false);
assert.equal(jumpToPagePanel(null),false);
console.log('PASS page outline anchors for 13 sections and keyboard focus across detail modes');

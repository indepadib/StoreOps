import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const file=name=>readFileSync(path.join(root,name),'utf8');
const index=file('frontend/index.html');
const app=file('frontend/js/app.js');
const moduleSource=file('frontend/js/pages/buying-group.js');
const css=file('frontend/buying-group.css');
const stripped=moduleSource.replace(/^import\s+.+?;\s*$/gm,'').replace(/export\s+function\s+/g,'function ');
const runtime=new Function('api','app','currentStore','isDirector','document',
  stripped+'; return {simulateValues,renderBuyingGroup};'
);

test('StoreOps registers the Buying Group page, style, and navigation',()=>{
  assert.match(index,/id="buyingGroupNav"/);
  assert.match(index,/id="buyingGroupPage"/);
  assert.match(index,/buying-group\.css/);
  assert.match(app,/buyingGroupNav'\)\.hidden=!isDirector\(\)/);
  assert.match(app,/page==='buyingGroup'&&!isDirector\(\)/);
  assert.match(app,/pages\/buying-group\.js','renderBuyingGroup/);
  assert.ok(css.includes('.bg-app'));
});

test('Buy Group module parses as JavaScript',()=>{
  assert.doesNotThrow(()=>new Function(stripped));
});

test('A normal employee never sees a rendered buying cockpit',()=>{
  const node={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  const instance=runtime(()=>{throw Error('Unexpected call')},{user:{role:'employee'},storeId:'val-fleuri'},
    ()=>({name:'Val-Fleuri'}),()=>false,{querySelector:()=>node});
  instance.renderBuyingGroup();
  assert.match(node.innerHTML,/Accès réservé/);
  assert.doesNotMatch(node.innerHTML,/Un Groupe/);
});

test('The pilot does not call any API on initial rendering',()=>{
  let calls=0;
  const node={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  const instance=runtime(()=>{calls++;throw Error('Unexpected call')},
    {user:{role:'ops_director',name:'Direction'},storeId:'val-fleuri',authMode:'local'},
    ()=>({name:'Val-Fleuri'}),()=>true,{querySelector:()=>node});
  instance.renderBuyingGroup();
  assert.equal(calls,0);
  assert.match(node.innerHTML,/Une force d’achat/);
});

test('The illustrative Lesieur simulation is correct and non-persistent',()=>{
  const instance=runtime(()=>null,{user:{}},()=>null,()=>true,{querySelector:()=>null});
  const outcome=instance.simulateValues();
  assert.equal(outcome.current,354000);
  assert.equal(outcome.target,325500);
  assert.equal(outcome.saving,28500);
  assert.equal(outcome.qty,15500);
  assert.doesNotMatch(moduleSource,/method:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
});

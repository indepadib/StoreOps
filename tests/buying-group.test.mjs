import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=name=>readFileSync(path.join(root,name),'utf8');
const main=file('frontend/index.html');
const app=file('frontend/js/app.js');
const auth=file('frontend/js/auth.js');
const redirect=file('frontend/_redirects');
const standalone=file('frontend/centrale-achat/index.html');
const standaloneEntry=file('frontend/centrale-achat/entry.js');
const standaloneShell=file('frontend/centrale-achat/index.html');
const netlifyConfig=file('netlify.toml');
const shortcuts=file('frontend/director-workspaces.css');
const moduleSource=file('frontend/js/pages/buying-group.js');
const css=file('frontend/buying-group.css');
const stripped=moduleSource.replace(/^import\s+.+?;\s*$/gm,'').replace(/export\s+function\s+/g,'function ');
const runtime=new Function('api','app','currentStore','isDirector','document',stripped+';return{simulateValues,renderBuyingGroup};');

test('Buying Group is a standalone route, not a StoreOps navigation page',()=>{
  assert.doesNotMatch(main,/id="buyingGroupNav"|id="buyingGroupPage"/);
  assert.doesNotMatch(app,/page==='buyingGroup'|buyingGroupNav/);
  assert.match(main,/id="directorWorkspaceLinks"/);
  assert.match(main,/href="\/analytics"/);
  assert.match(main,/href="\/centrale-achat"/);
  assert.match(app,/workspaces\.hidden=!isDirector\(\)/);
  assert.match(shortcuts,/#directorWorkspaceLinks\[hidden\]/);
  assert.ok(css.includes('.bg-app'));
});

test('Netlify resolves /centrale-achat and /centrale-achat/ to an independent shell',()=>{
  assert.match(redirect,/\/centrale-achat\s+\/centrale-achat\/index\.html\s+200/);
  assert.match(redirect,/\/centrale-achat\/\s+\/centrale-achat\/index\.html\s+200/);
  assert.match(standalone,/id="buyingGroupContent"/);
  assert.match(standalone,/\/centrale-achat\/entry\.js/);
  assert.doesNotMatch(standalone,/\/js\/auth-entry\.js/);
});

test('Standalone entry uses StoreOps auth, checks role and refuses demo',()=>{
  assert.match(standaloneEntry,/await health\(\)/);
  assert.match(standaloneEntry,/ensureLocalSession\(\)/);
  assert.match(standaloneEntry,/await ensureAccessToken\(\)/);
  assert.match(standaloneEntry,/await api\('\/api\/session'/);
  assert.match(standaloneEntry,/if\(!isDirector\(\)\)/);
  assert.match(standaloneEntry,/app\.showcase\|\|app\.authMode==='demo'/);
  assert.match(standaloneEntry,/returnPath='\/centrale-achat'/);
  assert.equal((auth.match(/\^\\\/\(\?:analytics\|centrale-achat\)/g)||[]).length,2);
});

test('Buying Group module parses as JavaScript',()=>{
  assert.doesNotThrow(()=>new Function(stripped));
});

test('A normal employee cannot render the buying cockpit',()=>{
  const node={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  const instance=runtime(()=>{throw Error('Unexpected call')},{user:{role:'employee'},storeId:'val-fleuri'},
    ()=>({name:'Val-Fleuri'}),()=>false,{querySelector:()=>node});
  instance.renderBuyingGroup();
  assert.match(node.innerHTML,/Accès réservé/);
  assert.doesNotMatch(node.innerHTML,/Un Groupe/);
});

test('Director pilot render does not call Dynamics automatically',()=>{
  let calls=0;
  const node={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  const instance=runtime(()=>{calls++;throw Error('Unexpected call')},
    {user:{role:'ops_director',name:'Direction'},storeId:'val-fleuri',authMode:'local'},
    ()=>({name:'Val-Fleuri'}),()=>true,{querySelector:selector=>selector==='#buyingGroupContent'?node:null});
  instance.renderBuyingGroup();
  assert.equal(calls,0);
  assert.match(node.innerHTML,/Une force d’achat/);
});

test('Illustrative Lesieur savings remain correct and non-persistent',()=>{
  const instance=runtime(()=>null,{user:{}},()=>null,()=>true,{querySelector:()=>null});
  const result=instance.simulateValues();
  assert.equal(result.current,354000);
  assert.equal(result.target,325500);
  assert.equal(result.saving,28500);
  assert.equal(result.qty,15500);
  assert.doesNotMatch(moduleSource,/method:\s*['"](?:POST|PUT|PATCH|DELETE)/i);
});

test('Canonical ES modules share one StoreOps auth state instance (regression for 401)',()=>{
  const imports=standaloneEntry.match(/^import .+$/gm)||[];
  assert.equal(imports.length,4);
  for(const statement of imports)assert.doesNotMatch(statement,/\?v=\d+/);
  assert.match(standaloneEntry,/from '\/js\/api\.js'/);
  assert.match(standaloneEntry,/from '\/js\/state\.js'/);
  assert.match(standaloneEntry,/from '\/js\/auth\.js'/);
  assert.match(standaloneEntry,/from '\/js\/pages\/buying-group\.js'/);
  assert.match(standaloneShell,/\/centrale-achat\/entry\.js\?v=3/);
  assert.match(netlifyConfig,/for = "\/centrale-achat\/\*"/);
});

test('Direct login and expired session are handled without bypassing authorization',()=>{
  assert.match(standaloneEntry,/startLocalLogin\(email,password\)/);
  assert.match(standaloneEntry,/buyingLocalLogin/);
  assert.match(standaloneEntry,/startLogin\(\)/);
  assert.match(standaloneEntry,/error\?\.status===401/);
  assert.match(standaloneEntry,/sessionStorage\.removeItem\('storeops_access_token'\)/);
  assert.match(standaloneEntry,/if\(!isDirector\(\)\)/);
  assert.doesNotMatch(standaloneEntry,/localStorage\.setItem\('storeops_local_authorization'/);
  assert.doesNotMatch(standaloneEntry,/method:\s*['"](?:POST|PUT|DELETE|PATCH)/i);
});

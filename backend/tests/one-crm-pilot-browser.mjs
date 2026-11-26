// Test actual generated StoreOps shell with synthetic HTTP responses, never a real account.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {chromium} from 'playwright';
const root=process.env.CRM_FRONTEND;
assert.ok(root);
const html=await readFile(join(root,'crm/index.html'),'utf8');
assert.ok(html.includes('if(await openCrmPilot())'));
const assets=new Set(['/crm/storeops-entry.mjs','/crm/pilot-session.mjs','/js/api.js','/js/state.js','/js/auth.js']);
let mode='entra',role='ops_director',profile=null,sessionStatus=200,sessionReads=0;
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body)};
 if(path==='/crm/'||path==='/crm/index.html')return send(200,'text/html; charset=utf-8',html);
 if(path==='/analytics-runtime-config.js')return send(200,'text/javascript','window.STOREOPS_CONFIG={mode:"api",apiBase:location.origin,entra:{}};');
 if(path==='/api/health')return send(200,'application/json',JSON.stringify({authMode:mode}));
 if(path==='/api/session'){sessionReads++;if(!['Bearer synthetic-only','Basic synthetic-only'].includes(req.headers.authorization))return send(401,'application/json','{}');return send(sessionStatus,'application/json',JSON.stringify({authMode:mode,user:{id:'synthetic-user',role,permissions_profile:profile}}))}
 if(assets.has(path))return send(200,'text/javascript',await readFile(join(root,path.slice(1)),'utf8'));
 return send(404,'text/plain','Not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});const origin='http://127.0.0.1:'+server.address().port;
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url())});
 await page.goto(origin+'/crm/');await page.locator('#crmPilotLogin').waitFor({state:'visible'});assert.equal(await page.locator('main').isVisible(),false);assert.equal(await page.locator('#dashTotal').textContent(),"");assert.equal(sessionReads,0);
 await page.evaluate(()=>{sessionStorage.setItem('storeops_access_token','synthetic-only');sessionStorage.setItem('storeops_access_expires',String(Date.now()+3600000))});await page.reload();await page.locator('main').waitFor({state:'visible'});assert.equal(await page.locator('#dashTotal').textContent(),'480');assert.equal(await page.locator('#crmPilotGate').isVisible(),false);assert.equal(await page.locator('#crmPilotLogout').isVisible(),true);
 role='store_manager';await page.reload();await page.waitForFunction(()=>document.getElementById('crmPilotTitle').textContent==='Accès réservé');assert.equal(await page.locator('main').isVisible(),false);
 role='employee';profile='platform_admin';await page.reload();await page.locator('main').waitFor({state:'visible'});assert.equal(await page.locator('#dashTotal').textContent(),'480');
 sessionStatus=401;await page.reload();await page.locator('#crmPilotLogin').waitFor({state:'visible'});assert.equal(await page.locator('main').isVisible(),false);
 mode='demo';sessionStatus=200;await page.reload();await page.waitForFunction(()=>document.getElementById('crmPilotTitle').textContent==='Session indisponible');assert.equal(await page.locator('main').isVisible(),false);
 mode='local';role='ops_director';profile=null;await page.evaluate(()=>sessionStorage.setItem('storeops_local_authorization','Basic synthetic-only'));await page.reload();await page.locator('main').waitFor({state:'visible'});assert.equal(await page.locator('#dashTotal').textContent(),'480');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Authenticated StoreOps CRM pilot shell passed (synthetic sessions only)');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}

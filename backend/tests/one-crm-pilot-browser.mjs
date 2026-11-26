// Test actual generated StoreOps shell with synthetic HTTP responses, never a real account.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {chromium} from 'playwright';
const root=process.env.CRM_FRONTEND;
assert.ok(root);
const html=await readFile(join(root,'crm/index.html'),'utf8');
assert.ok(html.includes('if(await openCrmPilot())'));assert.ok(!html.includes('dashTotal'));assert.ok(!html.includes('DEMO-'));assert.ok(!html.includes('Mode démonstration'));assert.equal((html.match(/<button data-view=/g)||[]).length,18);
const assets=new Set(['/crm/storeops-entry.mjs','/crm/pilot-session.mjs','/js/api.js','/js/state.js','/js/auth.js']);
let principal='synthetic-user',mode='entra',role='ops_director',profile=null,sessionStatus=200,sessionReads=0,liveReads=0,ticketReads=0,loyaltyReads=0,liveResponse='READY';
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body)};
 if(path==='/crm/'||path==='/crm/index.html')return send(200,'text/html; charset=utf-8',html);
 if(path==='/analytics-runtime-config.js')return send(200,'text/javascript','window.STOREOPS_CONFIG={mode:"api",apiBase:location.origin,entra:{}};');
 if(path==='/api/health')return send(200,'application/json',JSON.stringify({authMode:mode}));
 if(path==='/api/session'){sessionReads++;if(!['Bearer synthetic-only','Basic synthetic-only'].includes(req.headers.authorization))return send(401,'application/json','{}');return send(sessionStatus,'application/json',JSON.stringify({authMode:mode,user:{id:principal,role,permissions_profile:profile}}))}
 if(path==='/api/crm/observed-sales'){
  liveReads++;if(!['Bearer synthetic-only','Basic synthetic-only'].includes(req.headers.authorization)||mode==='demo'||sessionStatus!==200||(role!=='ops_director'&&profile!=='platform_admin'))return send(403,'application/json','{}');
  const q=new URL(req.url,'http://localhost').searchParams;
  if(!q.has('storeId'))return send(200,'application/json',JSON.stringify({status:'READY',stores:[{id:'demo-a',name:'Magasin de test'}]}));
  return send(200,'application/json',JSON.stringify(['READY','MALFORMED'].includes(liveResponse)?{status:'READY',storeId:q.get('storeId'),date:q.get('date'),source:'D365/RetailTransactionSalesTransBIEntities',basis:'POSITIVE_SALES_TTC_OBSERVED_EXCLUDES_RETURNS',financialReconciliation:'NOT_VERIFIED',currency:'MAD',identifiedCustomers:15,tickets:25,identifiedTickets:20,positiveSales:liveResponse==='MALFORMED'?'1200':1200,identifiedPositiveSales:950,averagePositiveBasket:48,checkedAt:'2026-11-26T10:00:00Z',activationEnabled:false}:{status:liveResponse}));
 }
 if(path==='/api/crm/observed-tickets'||path==='/api/crm/observed-loyalty'){
  if(!['Bearer synthetic-only','Basic synthetic-only'].includes(req.headers.authorization)||mode==='demo'||sessionStatus!==200||(role!=='ops_director'&&profile!=='platform_admin'))return send(403,'application/json','{}');
  const q=new URL(req.url,'http://localhost').searchParams,storeId=q.get('storeId'),date=q.get('date'),checkedAt='2026-11-26T10:00:00Z';
  if(path.endsWith('observed-loyalty')){loyaltyReads++;return send(200,'application/json',JSON.stringify({status:'READY',storeId,date,checkedAt,currency:'MAD',accountCreations:3,cardEnrollments:9,accountStatus:'PARTIAL',cardStatus:'READY',walletEarn:123.45,walletEarnStatus:'READY',attribution:'EARLIEST_LOYALTY_CARD_OPERATING_UNIT',activationEnabled:false}))}
  ticketReads++;const page=Number(q.get('page')),rows=Array.from({length:page===1?20:5},(_,i)=>({ordinal:(page-1)*20+i+1,positiveTtc:48,items:[{productNumber:'SKU-TEST',productName:'Article test',unit:'KG',quantity:.5,positiveTtc:48,observedDiscount:1.5}]}));
  return send(200,'application/json',JSON.stringify({status:'READY',storeId,date,checkedAt,currency:'MAD',source:'D365/RetailTransactionSalesTransBIEntities',basis:'POSITIVE_SALES_TTC_OBSERVED_EXCLUDES_RETURNS',financialReconciliation:'NOT_VERIFIED',activationEnabled:false,page,pageSize:20,totalTickets:25,rows}));
 }
 if(path==='/api/crm/observed-customers'||path==='/api/crm/observed-associations'){
  if(!['Bearer synthetic-only','Basic synthetic-only'].includes(req.headers.authorization))return send(403,'application/json','{}');
  const q=new URL(req.url,'http://localhost').searchParams,storeId=q.get('storeId'),date=q.get('date'),page=Number(q.get('page')),base={status:'READY',storeId,date,checkedAt:'2026-11-26T10:00:00Z',currency:'MAD',source:'D365/RetailTransactionSalesTransBIEntities',basis:'POSITIVE_SALES_TTC_OBSERVED_EXCLUDES_RETURNS',activationEnabled:false};
  return send(200,'application/json',JSON.stringify(path.endsWith('observed-customers')?{...base,identityBasis:'EXTRACTION_LOCAL_ORDINAL',page,pageSize:20,totalCustomers:15,rows:Array.from({length:15},(_,i)=>({ordinal:i+1,tickets:1,positiveTtc:48,distinctProducts:2}))}:{...base,method:'IDENTIFIED_POSITIVE_BASKET_COOCCURRENCE',baskets:20,minimumDistinctCustomers:10,rows:[{productA:'SKU-A',productB:'SKU-B',together:10,supportPct:50,confidencePct:75,lift:1.2}]}));
 }
 if(path==='/api/crm/customer-directory'){
  if(!['Bearer synthetic-only','Basic synthetic-only'].includes(req.headers.authorization))return send(403,'application/json','{}');
  const p=Number(new URL(req.url,'http://localhost').searchParams.get('page')||1);
  return send(200,'application/json',JSON.stringify({status:'READY',source:'D365/CustTableCDREntities',scope:'LEGAL_ENTITY_RETAIL',checkedAt:'2026-11-26T10:00:00Z',totalAccounts:53,page:p,pageSize:50,identityBasis:'D365_LEGAL_ENTITY_ACCOUNT',historyStatus:'NOT_CONNECTED',activationEnabled:false,rows:Array.from({length:p===1?50:3},(_,i)=>({accountRef:'ACCOUNT-'+((p-1)*50+i+1),createdAt:'2020-01-01T00:00:00Z'}))}));
 }
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
 await page.goto(origin+'/crm/');await page.locator('#crmPilotLogin').waitFor({state:'visible'});assert.equal(await page.locator('main').isVisible(),false);assert.equal(await page.locator('#dashTotal').count(),0);assert.equal(sessionReads,0);
 await page.evaluate(()=>{sessionStorage.setItem('storeops_access_token','synthetic-only');sessionStorage.setItem('storeops_access_expires',String(Date.now()+3600000))});await page.reload();await page.locator('main').waitFor({state:'visible'});assert.equal(await page.locator('#dashTotal').count(),0);assert.equal(await page.locator('#crmPilotGate').isVisible(),false);assert.equal(await page.locator('#crmPilotLogout').isVisible(),true);await page.waitForFunction(()=>document.getElementById('crmLiveStore').options.length===1);assert.equal(liveReads,1);assert.equal(await page.locator('#crmLiveStore').inputValue(),'demo-a');await page.waitForFunction(()=>document.getElementById('crmMasterKpi').textContent==='53');await page.locator('nav [data-view="transactions"]').click();await page.locator('#crmLiveRead').click();await page.waitForFunction(()=>document.querySelectorAll('#crmLiveMetrics>div').length===6);assert.match(await page.locator('#crmLiveStatus').textContent(),/Retours exclus/);assert.equal(liveReads,2);await page.waitForFunction(()=>document.querySelectorAll('#crmTicketRows details').length===20);assert.equal(ticketReads,1);await page.locator('nav [data-view="transactions"]').click();await page.locator('#crmTicketRows summary').first().click();assert.match(await page.locator('#crmTicketRows tbody').first().textContent(),/SKU-TEST/);await page.locator('#crmTicketNext').click();await page.waitForFunction(()=>document.querySelectorAll('#crmTicketRows details').length===5);assert.equal(ticketReads,2);assert.match(await page.locator('#crmTicketPage').textContent(),/2 \/ 2/);await page.locator('nav [data-view="loyalty"]').click();await page.locator('#crmLoyaltyRead').click();await page.waitForFunction(()=>document.querySelectorAll('#crmLoyaltyMetrics>div').length===3);assert.equal(loyaltyReads,1);assert.equal(await page.locator('#crmLoyaltyMetrics strong').nth(0).textContent(),'3');assert.equal(await page.locator('#crmLoyaltyMetrics strong').nth(1).textContent(),'9');assert.match(await page.locator('#crmLoyaltyMetrics strong').nth(2).textContent(),/123/);await page.locator('nav [data-view="customers"]').click();await page.waitForFunction(()=>document.querySelectorAll('#crmDirectoryRows tr').length===50);assert.equal(await page.locator('#crmLiveObservation').isVisible(),false);await page.locator('#crmDirectoryNext').click();await page.waitForFunction(()=>document.querySelectorAll('#crmDirectoryRows tr').length===3);await page.locator('nav [data-view="basket"]').click();await page.locator('#crmAssociationsRead').click();await page.waitForFunction(()=>document.querySelectorAll('#crmAssociationsRows tr').length===1);for(const view of ['customers','segments','basket','churn','purchase','offers','sendtime','copilot','agent','campaigns','omnichannel','dispatch','experiments','journeys','data']){await page.locator('nav [data-view="'+view+'"]').click();assert.ok(await page.locator('[data-live-view="'+view+'"]').isVisible());assert.equal(await page.locator('[data-live-view="overview"]').isVisible(),false)}await page.locator('#topSearch').click();await page.locator('#crmModuleQuery').fill('transactions');await page.locator('#crmModuleResults button').click();assert.ok(await page.locator('#crmTickets').isVisible());await page.locator('nav [data-view="transactions"]').click();
 liveResponse='SUPPRESSED';await page.locator('#crmLiveRead').click();await page.waitForFunction(()=>document.getElementById('crmLiveStatus').textContent.includes('masqué'));assert.equal(await page.locator('#crmLiveMetrics>div').count(),0);
 liveResponse='MALFORMED';await page.locator('#crmLiveRead').click();await page.waitForFunction(()=>document.getElementById('crmLiveStatus').textContent.includes('indisponibles'));assert.equal(await page.locator('#crmLiveMetrics>div').count(),0);
 liveResponse='UNAVAILABLE';await page.locator('#crmLiveRead').click();await page.waitForFunction(()=>document.getElementById('crmLiveStatus').textContent.includes('indisponibles'));assert.equal(await page.locator('#crmLiveMetrics>div').count(),0);liveResponse='READY';
 await page.locator('#crmLiveRead').click();await page.waitForFunction(()=>document.querySelectorAll('#crmLiveMetrics>div').length===6);
 principal='synthetic-other';await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForFunction(()=>document.getElementById('crmPilotTitle').textContent==='Session modifiée');assert.equal(await page.locator('main').isVisible(),false);assert.equal(await page.locator('#crmLiveMetrics>div').count(),0);assert.equal(await page.locator('#crmLiveStore option').count(),0);assert.equal(await page.locator('#crmTicketRows details').count(),0);assert.equal(await page.locator('#crmLoyaltyMetrics>div').count(),0);assert.equal(await page.locator('#crmDirectoryRows tr').count(),0);principal='synthetic-user';
 role='store_manager';await page.reload();await page.waitForFunction(()=>document.getElementById('crmPilotTitle').textContent==='Accès réservé');assert.equal(await page.locator('main').isVisible(),false);
 role='employee';profile='platform_admin';await page.reload();await page.locator('main').waitFor({state:'visible'});assert.equal(await page.locator('#dashTotal').count(),0);
 sessionStatus=401;await page.reload();await page.locator('#crmPilotLogin').waitFor({state:'visible'});assert.equal(await page.locator('main').isVisible(),false);
 mode='demo';sessionStatus=200;await page.reload();await page.waitForFunction(()=>document.getElementById('crmPilotTitle').textContent==='Session indisponible');assert.equal(await page.locator('main').isVisible(),false);
 mode='local';role='ops_director';profile=null;await page.evaluate(()=>sessionStorage.setItem('storeops_local_authorization','Basic synthetic-only'));await page.reload();await page.locator('main').waitFor({state:'visible'});assert.equal(await page.locator('#dashTotal').count(),0);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Authenticated StoreOps CRM pilot shell passed (synthetic sessions only)');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}

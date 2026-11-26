// Run from a disposable Playwright directory; CRM_HTML points to the checked-out prototype.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const html=await readFile(process.env.CRM_HTML,'utf8');
const server=createServer((req,res)=>{if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});res.end(html)}else{res.writeHead(404);res.end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const origin='http://127.0.0.1:'+server.address().port,page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url())});
 await page.goto(origin);await page.locator('#dashTotal').waitFor({state:'visible'});assert.equal(await page.locator('#dashTotal').textContent(),'480');
 await page.locator('nav [data-view="customers"]').click();await page.locator('#rows button').first().click();assert.equal(await page.locator('#profile').evaluate(e=>e.open),true);
 assert.match(await page.locator('#profileRfm').textContent(),/Récence/);assert.match(await page.locator('#profileRisk').textContent(),/RFM/);
 await page.locator('[data-profile-tab="history"]').click();assert.ok(await page.locator('#profileTimeline .timelineitem').count()>0);
 await page.locator('[data-profile-tab="affinity"]').click();assert.ok(await page.locator('#profileCategories .affinity-row').count()>0);
 await page.locator('[data-profile-tab="consent"]').click();assert.equal(await page.locator('#profileConsentRows .timelineitem').count(),3);
 await page.locator('#close').click();
 await page.locator('nav [data-view="segments"]').click();await page.locator('#advancedMode').click();await page.locator('#advancedReset').click();
 await page.locator('.rule-field').first().selectOption('risk');await page.locator('.rule-row [aria-label="Valeur de condition"]').first().selectOption('high');await page.locator('#applyAdvanced').click();
 const high=Number(await page.locator('#matched').textContent());assert.ok(high>0&&high<480);
 await page.locator('#ruleGroups .quickrow button').first().click();await page.locator('.rule-field').nth(1).selectOption('preferredCategories');await page.locator('.rule-row [aria-label="Valeur de condition"]').nth(1).selectOption('Épicerie');await page.locator('#applyAdvanced').click();
 const selected=Number(await page.locator('#matched').textContent());assert.ok(selected>0&&selected<=high);
 await page.locator('#segmentName').fill('P0 smoke');await page.locator('#saveSegment').click();assert.equal(await page.locator('#savedSegments button').filter({hasText:'P0 smoke'}).count(),1);
 await page.reload();await page.locator('nav [data-view="segments"]').click();await page.locator('#savedSegments button').filter({hasText:'P0 smoke'}).click();assert.equal(Number(await page.locator('#matched').textContent()),selected);
 await page.locator('nav [data-view="campaigns"]').click();assert.match(await page.locator('#campaignAudienceLabel').textContent(),new RegExp('^'+selected+' clients'));assert.match(await page.locator('#eligibilityHint').textContent(),new RegExp('/ '+selected+' éligibles'));
 await page.locator('nav [data-view="data"]').click();await page.locator('#consentLedger').selectOption('incomplete');await page.locator('nav [data-view="campaigns"]').click();assert.match(await page.locator('#eligibilityHint').textContent(),/^0 \/ /);
 await page.locator('nav [data-view="data"]').click();await page.locator('#qualityScenario').selectOption('refund');assert.match(await page.locator('#qualitySummary').textContent(),/bloquée/);
 await page.locator('#identityScenario').selectOption('conflict');assert.match(await page.locator('#identitySummary').textContent(),/quarantaine/);
 await page.setViewportSize({width:390,height:844});await page.locator('nav [data-view="customers"]').click();await page.locator('#rows button').first().click();await page.locator('[data-profile-tab="affinity"]').click();assert.ok(await page.locator('#profileCategories').isVisible());
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('CRM P0 browser smoke passed on desktop and mobile');
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}

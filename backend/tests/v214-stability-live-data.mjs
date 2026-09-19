import assert from 'node:assert/strict';
import { readFileSync,rmSync,existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v214-stability.db';
process.env.STOREOPS_MEDIA_DIR='/tmp/storeops-v214-media';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

const managerHome=read('frontend/js/pages/manager-home.js');
const server=read('backend/server.mjs');
const receiving=read('backend/services/dynamics-receiving.mjs');
const salesMapping=read('backend/services/d365-sales-mapping.mjs');
const pricing=read('backend/services/dynamics-price.mjs');
const bridge=read('netlify/functions/api.mts');
const incidentsSource=read('backend/services/incidents.mjs');
const dlcSource=read('backend/services/dlc.mjs');
const processPage=read('frontend/js/pages/process.js');
const integrationApi=read('backend/services/integration-registry-api.mjs');
const adminMapping=read('frontend/js/admin-d365-mapping.js');

assert.doesNotMatch(managerHome,/receipts\/sync/,'Today must never auto-sync purchase orders');
const receiptsGet=server.match(/p=route\(path,'\/api\/stores\/:storeId\/receipts'\)[\s\S]*?p=route\(path,'\/api\/stores\/:storeId\/receipts\/readiness'/)?.[0]||'';
assert(receiptsGet,'Receipts GET route missing');
assert.doesNotMatch(receiptsGet,/syncExpectedReceiptsFromDynamics/,'Receipts GET must serve the persisted snapshot only');
assert.match(server,/receipts\/sync'\);if\(p&&req\.method==='POST'/,'Explicit PO sync endpoint must remain available');

assert.match(receiving,/RemainingPurchaseQuantity|remainingQtyField/,'Receiving must know a remaining quantity field');
assert.match(receiving,/remainingField} gt 0/,'Receiving must try to filter open PO lines in D365');
assert.match(receiving,/D365_RECEIVING_LINES_TRUNCATED/,'Receiving must reject incomplete/truncated snapshots');
assert.match(receiving,/storeOperationalSettings\(storeId\)/,'Receiving must use persisted store warehouse mapping');

assert.match(salesMapping,/missingInPayload:smoke\.missingInPayload\|\|\[\]/,'Sales smoke audit must use the evaluated smoke payload');
assert.doesNotMatch(salesMapping,/\{storeId,entity:mapping\.entity,rowCount:rows\.length,missingInPayload,marginCandidate/,'Sales smoke must not reference an undefined local');
assert.match(salesMapping,/channelOk=!channel\|\|channelMatches>0/,'Sales activation smoke must validate the target retail channel');
assert.match(integrationApi,/d365-sales-mapping\/autoconfigure/,'One-click sales autoconfiguration endpoint must be wired');
assert.match(integrationApi,/D365_SALES_AUTOCONFIG_SMOKE_FAILED/,'Automatic sales activation must fail closed');
assert.match(adminMapping,/Détecter & activer les ventes/,'Admin Studio must expose one-click sales activation');

assert.match(pricing,/T00:00:00Z and .*T00:00:00Z/,'Trade-agreement scan must support DateTimeOffset day ranges');
assert.match(pricing,/priceGroupAllowed/,'Trade-agreement filtering must be performed safely in StoreOps');
assert.match(pricing,/\^\(all\|tous\)\$/i,'All-customer agreements must be accepted');
assert.doesNotMatch(pricing,/filterParts=\[companyFilter,groupField/,'D365 query must not exclude blank/all-customer agreements server-side');

assert.match(bridge,/STATEFUL_GET_PATTERNS/,'Netlify bridge must distinguish GETs that mutate StoreOps state');
assert.match(bridge,/\/tasks\$\//,'Task-day reads must be stateful/persisted');
assert.match(bridge,/needsWriteSync\(request\)\?await serveWrite/,'Stateful GETs must use durable write-sync');
assert.match(processPage,/Le parcours a été actualisé/,'Frontend must recover from a stale task id');
for(const handler of ['handleAccessManagementApi','handleDevelopmentApi','handleIntegrationRegistryApi','handlePriceHistoryApi','handleProcessStudioApi','handleReplenishmentPolicyApi','handleReplenishmentRequestApi','handleStoreSettingsApi','handleTenantProfileApi'])assert.match(server,new RegExp(handler),`Server must dispatch ${handler}`);

assert.match(incidentsSource,/content_blob/,'Incident evidence must be persisted in SQLite');
assert.match(dlcSource,/content_blob/,'DLC evidence must be persisted in SQLite');

const { db }=await import('../db.mjs');
const { createIncident,addEvidence,mediaById }=await import('../services/incidents.mjs');
const user=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
assert(user,'Val Fleuri manager fixture missing');
const incident=createIncident({storeId:'val-fleuri',user,title:'Preuve durable V2.14',requiresEvidence:true});
const payload='data:image/png;base64,'+Buffer.from('durable-evidence-v214').toString('base64');
const updated=addEvidence({incidentId:incident.id,user,dataUrl:payload,fileName:'preuve.png',caption:'CI durable'});
const evidence=updated.evidence[0];
assert(evidence?.id,'Evidence must be created');
const row=db.prepare(`SELECT content_blob,storage_key FROM incident_evidence WHERE id=?`).get(evidence.id);
assert(row?.content_blob&&Buffer.from(row.content_blob).length>0,'Evidence bytes must be inside SQLite');
rmSync(process.env.STOREOPS_MEDIA_DIR,{recursive:true,force:true});
const media=mediaById(evidence.id);
assert(media?.bytes&&Buffer.from(media.bytes).toString()==='durable-evidence-v214','Evidence must still be readable after ephemeral filesystem loss');

console.log('V2.14 stability/live-data regression contract OK');

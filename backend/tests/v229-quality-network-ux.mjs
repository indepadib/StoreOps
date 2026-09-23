import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

process.env.STOREOPS_DB='/tmp/storeops-v229-quality-network.db';
process.env.D365_MODE='simulated';
process.env.D365_PRODUCT_READ_MODE='simulated';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');

const index=read('frontend/index.html');
const app=read('frontend/js/app.js');
const coldUi=read('frontend/js/pages/cold-chain.js');
const dlcUi=read('frontend/js/pages/dlc.js');
const qualityUi=read('frontend/js/pages/quality.js');
const accessUi=read('frontend/js/admin-studio-access.js');
const lossApi=read('backend/services/loss-api.mjs');
const server=read('backend/server.mjs');
const dynamics=read('backend/services/dynamics.mjs');
const access=read('backend/services/access-management.mjs');

assert.match(index,/id="qualityAuditNav"[^>]*>[\s\S]*data-page="quality"[\s\S]*data-page="dlc"[\s\S]*data-page="coldChain"[\s\S]*data-page="opening"[\s\S]*data-page="receipts"/);
assert.match(app,/\['quality','dlc','coldChain','opening','receipts'\]/);
assert.match(app,/document\.querySelectorAll\('#qualityAuditNav button\[data-page\]'\)\.forEach/);
assert.match(coldUi,/canManageQuality/);
assert.match(lossApi,/requireQualityManage/);
assert.match(lossApi,/checkColdChainLine/);
assert.match(lossApi,/recheckColdChainLine/);

assert.match(dynamics,/export async function getProductByReference/);
assert.match(server,/\/api\/products\/lookup/);
assert.match(dlcUi,/HS-00000/);
assert.match(dlcUi,/min-height:56px/);
assert.match(dlcUi,/\/api\/products\/lookup\?q=/);
assert.match(qualityUi,/\/api\/products\/lookup\?q=/);
assert.match(qualityUi,/code interne/);

assert.match(accessUi,/Création autonome · 3 informations suffisent/);
assert.match(accessUi,/Nom \+ email Microsoft \+ profil/);
assert.match(access,/Chaîne du froid/);
assert.match(access,/suivi Ouverture/);

const {db}=await import('../db.mjs');
const {createAccessAccount}=await import('../services/access-management.mjs');
const {canAccessStore,canManageQuality,canManageDlc,canManageStore}=await import('../services/permissions.mjs');
const {getProductByReference}=await import('../services/dynamics.mjs');

const admin=db.prepare(`SELECT * FROM users WHERE id='u-ops'`).get();
assert(admin,'test director required');
const quality=createAccessAccount({actor:admin,name:'Qualité V229',emailAddress:'quality.v229@example.invalid',profileCode:'QUALITY_AUDIT',identityProvider:'ENTRA'});
const row=db.prepare(`SELECT * FROM users WHERE id=?`).get(quality.id);
for(const storeId of ['val-fleuri','trefle']){
 assert.equal(canAccessStore(row,storeId),true);
 assert.equal(canManageQuality(row,storeId),true);
 assert.equal(canManageDlc(row,storeId),true);
 assert.equal(canManageStore(row,storeId),false);
}
const p=await getProductByReference('NUT750');
assert(p);
assert.equal(p.productNumber,'NUT750');

console.log('V2.29 Quality network UX contract: OK');

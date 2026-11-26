import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../scripts/one-crm-reconcile-private.mjs',import.meta.url));
const scope={tenantId:'demo',storeId:'demo-a',date:'2026-11-20'};
const manifest={...scope,currency:'MAD',amountBasis:'signed-ttc-after-discounts',closed:true,coverageComplete:true,truncated:false,sourceRef:'private-source-marker',lineage:'demo-pos',identityVerified:true,statusMappingVerified:true,signMappingVerified:true};
const row=(lineId,signedTtcMad)=>({...scope,company:'demo-company',registerId:'private-register-marker',transactionId:'private-ticket-marker',lineId,signedTtcMad,customerToken:'private-customer-marker',status:'posted',productId:'private-product-marker',category:'demo'});
const control={...scope,currency:'MAD',amountBasis:manifest.amountBasis,closed:true,sourceRef:'private-finance-marker',lineage:'demo-finance',independenceVerified:true,tickets:1,positiveMinor:8000,refundMinor:0,netMinor:8000,positiveLineMinor:10000,refundLineMinor:2000,postedLines:2};
const input={...scope,manifest,rows:[row('1','100.00'),row('2','-20.00')],control};
const env={...process.env,ONE_CRM_PILOT_STORE_IDS:'demo-a',ONE_CRM_PILOT_TENANT_ID:'demo'};
function run(data,patch={}){const r=spawnSync(process.execPath,[cli],{input:typeof data==='string'?data:JSON.stringify(data),encoding:'utf8',env:{...env,...patch}});assert.equal(r.stderr,'');assert.ok(!r.stdout.includes('private-'));assert.ok(!r.stdout.includes('demo-a'));return {exit:r.status,data:JSON.parse(r.stdout)}}
const ok=run(input);assert.equal(ok.exit,0);assert.equal(ok.data.status,'VERIFIED');assert.equal(ok.data.metrics.netMinor,8000);assert.equal(ok.data.lineMetrics.refundLineMinor,2000);assert.equal(ok.data.activationEnabled,false);assert.equal(ok.data.metrics.identifiedTickets,undefined);
for(const [data,patch] of [[input,{ONE_CRM_PILOT_STORE_IDS:''}],[input,{ONE_CRM_PILOT_TENANT_ID:'other'}],[{...input,storeId:'other'},{}],[{...input,control:{...control,netMinor:1}},{}],[{...input,manifest:{...manifest,closed:false}},{}],[{...input,rows:[{...input.rows[0],signedTtcMad:'invalid'}]},{}],['not-json',{}],['',{}]]){const r=run(data,patch);assert.equal(r.exit,2);assert.equal(r.data.status,'BLOCKED');assert.equal(r.data.metrics,undefined);assert.equal(r.data.activationEnabled,false)}
console.log('Private offline reconciliation CLI passed (synthetic input only)');

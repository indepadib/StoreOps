import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

process.env.GLOVO_CHAIN_ID='chain-test';
process.env.GLOVO_VENDOR_IDS_JSON=JSON.stringify({'val-fleuri':'vendor-vf'});
process.env.GLOVO_CATALOG_BEARER_TOKEN='token-test';
process.env.GLOVO_PUSH_ENABLED='0';

const {glovoIntegrationConfig,glovoCatalogPayload,verifyGlovoConnection}=await import('../services/glovo-availability.mjs');

const cfg=glovoIntegrationConfig('val-fleuri');
assert.equal(cfg.chainId,'chain-test');
assert.equal(cfg.vendorId,'vendor-vf');
assert.equal(cfg.authMode,'STATIC_BEARER');
assert.equal(cfg.credentialsReady,true);
assert.equal(cfg.pushEnabled,false);
assert.equal(cfg.ready,false,'push must stay locked until the explicit feature flag is enabled');

const payload=glovoCatalogPayload({items:[
 {sku:'HS-001191',active:true,barcode:'611...',quantity:42,name:'Produit A'},
 {sku:'HS-001192',active:false,availableOnHandQuantity:0}
]});
assert.deepEqual(payload,{products:[{sku:'HS-001191',active:true},{sku:'HS-001192',active:false}]});
assert.equal(JSON.stringify(payload).includes('quantity'),false);
assert.equal(JSON.stringify(payload).includes('barcode'),false);
assert.equal(JSON.stringify(payload).includes('name'),false);

let captured=null;
const fakeFetch=async(url,init)=>{
 captured={url:String(url),init};
 return{ok:true,status:200,json:async()=>({products:[{sku:'HS-001191'}]})};
};
const verified=await verifyGlovoConnection('val-fleuri',{fetchImpl:fakeFetch});
assert.equal(verified.status,'READY');
assert.equal(verified.catalogReachable,true);
assert.match(captured.url,/\/v2\/chains\/chain-test\/vendors\/vendor-vf\/catalog\?page=1&page_size=1$/);
assert.equal(captured.init.method,'GET');
assert.equal(captured.init.headers.authorization,'Bearer token-test');

process.env.GLOVO_PUSH_ENABLED='1';
assert.equal(glovoIntegrationConfig('val-fleuri').ready,true);

const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const service=read('backend/services/glovo-availability.mjs');
const growth=read('backend/services/store-growth-api.mjs');
const netlify=read('netlify/functions/api.mts');
const env=read('.env.example');
const ui=read('frontend/js/pages/channel-availability.js');
const docs=read('docs/GLOVO-INTEGRATION.md');

assert.match(service,/grant_type:'client_credentials'/);
assert.match(service,/GLOVO_PUSH_ENABLED/);
assert.match(service,/GLOVO_API_BASE_URL/);
assert.match(service,/GLOVO_STOCK_MAPPING_EMPTY/);
assert.match(service,/verifyGlovoConnection/);
assert.match(growth,/channels\/glovo\/verify/);
for(const key of ['GLOVO_READ_API_KEY','GLOVO_PARTNER_STORE_IDS','GLOVO_CLIENT_ID','GLOVO_CLIENT_SECRET','GLOVO_TOKEN_URL','GLOVO_PUSH_ENABLED'])assert.match(netlify,new RegExp(key));
for(const key of ['GLOVO_PUSH_ENABLED=0','GLOVO_API_BASE_URL=','GLOVO_TOKEN_AUTH_STYLE=basic'])assert.ok(env.includes(key),key);
assert.match(ui,/Tester la connexion/);
assert.match(ui,/Push verrouillé/);
assert.match(ui,/GLOVO_PUSH_ENABLED=1/);
assert.match(docs,/Procédure de branchement Sandbox/);
assert.match(docs,/Rollback immédiat/);
assert.match(docs,/1 035 SKU/);

console.log('StoreOps Glovo integration readiness contract: OK');

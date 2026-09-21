import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.STOREOPS_DB=`/tmp/storeops-v225-${process.pid}.db`;
process.env.STOREOPS_MEDIA_DIR=`/tmp/storeops-v225-media-${process.pid}`;
process.env.D365_MODE='simulated';
process.env.AUTH_MODE='demo';

// Central API must serialize object payloads, fixing Admin Access "JSON invalide".
globalThis.window={STOREOPS_CONFIG:{apiBase:'https://storeops.test',mode:'live'}};
globalThis.localStorage={getItem:()=> 'u-vf',setItem:()=>{},removeItem:()=>{}};
globalThis.sessionStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
let captured=null;
globalThis.fetch=async (url,options={})=>{
 captured={url:String(url),options};
 return new Response(JSON.stringify({ok:true}),{status:200,headers:{'content-type':'application/json'}});
};
const state=await import('../../frontend/js/state.js');
state.app.authMode='demo';
const {api}=await import('../../frontend/js/api.js');
await api('/api/admin/access/accounts/u-tr',{method:'PUT',body:{profileCode:'QUALITY_AUDIT',name:'Amine Chibani'}});
assert.equal(captured.options.body,JSON.stringify({profileCode:'QUALITY_AUDIT',name:'Amine Chibani'}));

// Production legacy Amine account must migrate from u-tr store-manager to network Quality.
const {db}=await import('../db.mjs');
db.prepare(`UPDATE users SET name='Amine Chibani',role='store_manager',store_id='trefle',permissions_profile=NULL WHERE id='u-tr'`).run();
const access=await import('../services/access-management.mjs');
const permissions=await import('../services/permissions.mjs');
const amine=db.prepare(`SELECT * FROM users WHERE id='u-tr'`).get();
assert.equal(amine.role,'employee');
assert.equal(amine.store_id,null);
assert.equal(amine.permissions_profile,'quality_audit');
assert.equal(permissions.canAccessStore(amine,'val-fleuri'),true);
assert.equal(permissions.canAccessStore(amine,'trefle'),true);
assert.equal(permissions.canManageQuality(amine,'val-fleuri'),true);
assert.equal(permissions.canManageDlc(amine,'trefle'),true);
assert.equal(permissions.canManageStore(amine,'val-fleuri'),false);
const qProfile=access.accessProfiles().find(x=>x.code==='QUALITY_AUDIT');
assert(qProfile);
assert.equal(qProfile.scope,'NETWORK');
assert.equal(qProfile.sensitive,false);

// Inventory unit must follow the D365 inventory unit.
const {createInventorySession,addInventoryLine}=await import('../services/inventory.mjs');
const user=db.prepare(`SELECT * FROM users WHERE id='u-vf'`).get();
const inv=createInventorySession({storeId:'val-fleuri',user,type:'TARGETED',zone:'Test V2.25'});
const line=addInventoryLine({sessionId:inv.id,user,product:{ean:'TEST-WEIGHT',productNumber:'WEIGHT-1',name:'Produit pondéré',category:'F&L',stock:6000,inventoryUnit:'g',unit:'kg'}});
assert.equal(line.unit,'g');
assert.equal(line.theoretical_qty,6000);

// Static UX/safety contracts.
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const appJs=read('frontend/js/app.js');
const index=read('frontend/index.html');
const staffing=read('frontend/js/pages/staffing.js');
const receipts=read('frontend/js/pages/receipts.js');
const inventory=read('frontend/js/pages/inventory.js');
const server=read('backend/server.mjs');
const openingApi=read('backend/services/opening-controls-api.mjs');

assert.match(appJs,/RELEASE_BUILD='2250'/);
assert.doesNotMatch(appJs,/v=2150/);
assert.match(index,/v2\.25\.0/);
assert.match(index,/data-page="receipts">Réceptions/);
assert.match(appJs,/\['quality','dlc','receipts'\]/);
assert.match(staffing,/if\(!d\)/);
assert.match(staffing,/syncStaffingBtn/);
assert.match(openingApi,/\/api\/cash-opening\/lines\/:lineId\/check/);
assert.match(openingApi,/\/api\/stores\/:storeId\/staffing/);
assert.match(receipts,/PO · Centrale \/ LVE Lakhyayta/);
assert.match(receipts,/TO · Direct fournisseur \/ inter-magasin/);
assert.match(receipts,/mapping D365 Transfer Orders doit être connecté/);
assert.match(inventory,/Compter maintenant/);
assert.match(inventory,/Inventaires en cours/);
assert.match(inventory,/Historique & export/);
assert.match(inventory,/Unité de comptage/);
assert.match(server,/D365_WRITE_DISABLED/);
assert.doesNotMatch(server,/const dyn=await postInventoryAdjustmentToDynamics/);
assert.doesNotMatch(server,/const dyn=await postReceiptToDynamics/);

console.log('V2.25 operations hardening contract: OK');

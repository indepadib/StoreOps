import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {calculateRebate,serveBuyingGroup} from '../backend/services/buying-group-api.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=p=>readFileSync(path.join(root,p),'utf8');
const sql=source('netlify/database/migrations/20261102110000_hs_buying_core.sql');
const api=source('netlify/functions/api.mts');
const management=source('frontend/js/pages/buying-group-management.js');
const cockpit=source('frontend/js/pages/buying-group.js');
const transport=source('frontend/js/api.js');

test('RFA rétroactive: 3% de 1,2 million donne 36 000 MAD',()=>{
  const x=calculateRebate('1200000',[{threshold:'0',rateBps:300}],'RETROACTIVE');
  assert.equal(x.spend,'1200000.00');assert.equal(x.rebate,'36000.00');assert.equal(x.ratePct,3);
});
test('RFA rétroactive: palier atteint appliqué à toute l’assiette',()=>{
  const x=calculateRebate('1200000',[{threshold:'0',rateBps:200},{threshold:'1000000',rateBps:350}],'RETROACTIVE');
  assert.equal(x.rebate,'42000.00');
});
test('RFA marginale: tranche progressive sans confusion avec rétroactive',()=>{
  const x=calculateRebate('1200000',[{threshold:'0',rateBps:200},{threshold:'500000',rateBps:300}],'MARGINAL');
  assert.equal(x.rebate,'31000.00');
});
test('RFA marginale: la tranche non atteinte ne génère aucune rémunération',()=>{
  const x=calculateRebate('10000',[{threshold:'20000',rateBps:300}],'MARGINAL');
  assert.equal(x.rebate,'0.00');
});
test('RFA: montant nul et absence de palier',()=>{
  assert.equal(calculateRebate('0',[], 'RETROACTIVE').rebate,'0.00');
  assert.equal(calculateRebate('900',[], 'MARGINAL').rebate,'0.00');
});
test('RFA: rejet des taux invalides, seuils décroissants et décimales excessives',()=>{
  assert.throws(()=>calculateRebate('100',[{threshold:'0',rateBps:10001}],'RETROACTIVE'));
  assert.throws(()=>calculateRebate('100',[{threshold:'200',rateBps:100},{threshold:'50',rateBps:200}],'RETROACTIVE'));
  assert.throws(()=>calculateRebate('0.001',[], 'RETROACTIVE'));
});
test('RFA: méthode inconnue rejetée',()=>{
  assert.throws(()=>calculateRebate('100',[],'UNKNOWN'));
});
test('API buying group refuse une route inconnue sans appeler la base',async()=>{
  const db={pool:{query(){throw Error('Unexpected DB query')},connect(){throw Error('Unexpected DB connect')}}};
  const response=await serveBuyingGroup(new Request('https://local.test/api/buying-group/unknown'),db,{id:'director'});
  assert.equal(response.status,404);
});
test('Schéma achats isolé de StoreOps: tables de contrats, fournisseurs, fichiers et audit',()=>{
  assert.match(sql,/CREATE SCHEMA IF NOT EXISTS hs_buying/);
  for(const table of ['suppliers','contracts','contract_documents','audit_events'])assert.ok(sql.includes('hs_buying.'+table));
  assert.match(sql,/file_bytes BYTEA NOT NULL/);
  assert.match(sql,/REVOKE ALL ON SCHEMA hs_buying FROM PUBLIC/);
  assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS stores \(/);
});
test('Backend applique le contrôle Direction/Admin avant toute requête métier',()=>{
  assert.match(api,/pathname\.startsWith\('\/api\/buying-group\/'\)/);
  assert.match(api,/if\(mode==='demo'\)/);
  assert.match(api,/authenticatedUser\(request,runtime\)/);
  assert.match(api,/user\.role==='ops_director'/);
  assert.match(api,/user\.permissions_profile==='platform_admin'/);
  assert.match(api,/serveBuyingGroup\(request,database,user\)/);
});
test('Le parcours permet la saisie contractuelle et les actions privées',()=>{
  for(const piece of ['supplier','contract','simulate','activate','files','download'])assert.ok(management.includes(piece),piece);
  assert.match(management,/apiPrivateFile/);
  assert.match(transport,/export async function apiPrivateFile/);
  assert.match(management,/5\*1024\*1024/);
});
test('La navigation met en avant les données réelles plutôt que des économies fictives',()=>{
  for(const label of ["Fournisseurs","Contrats","Marges arrière","Historique"])assert.ok(cockpit.includes(label));
  assert.match(cockpit,/buyingSnapshot\(\)/);
  assert.match(cockpit,/Recouvrement RFA/);
  assert.doesNotMatch(cockpit,/metric\('RFA encaissées'/);
  assert.match(cockpit,/renderBuyingManagement\(state\.tab,host/);
});

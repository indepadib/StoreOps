import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parsePurchaseCSV} from '../frontend/js/pages/buying-group-csv.js';
import {purchaseValidation,serveBuyingPurchases} from '../backend/services/buying-group-purchases.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(path.join(root,p),'utf8');
const migration=file('netlify/database/migrations/20261102130000_hs_buying_purchase_evidence.sql');
const router=file('backend/services/buying-group-api.mjs');
const cockpit=file('frontend/js/pages/buying-group.js');
const management=file('frontend/js/pages/buying-group-purchases.js');
const supplierId='11111111-1111-4111-8111-111111111111';
const contractId='22222222-2222-4222-8222-222222222222';
const batchId='33333333-3333-4333-8333-333333333333';

test('CSV: import standard with two lines and negative credit note',()=>{
  const data='reference;ligne;date;montant_ht;compte_fournisseur;description\nFAC-001;1;2026-10-01;1000.50;V101;Facture\nAV-001;0;2026-10-02;-50.25;V101;Avoir';
  const rows=parsePurchaseCSV(data);
  assert.equal(rows.length,2);
  assert.equal(rows[0].netAmount,'1000.50');
  assert.equal(rows[1].netAmount,'-50.25');
});
test('CSV: BOM, quoted separators, line-specific references and decimal comma',()=>{
  const csv='\uFEFFreference;ligne;date;montant_ht;description\n"FAC;001";01;2026-10-01;"1234,50";"Ligne avec ; séparateur"\n"FAC;001";02;2026-10-01;20;Second poste';
  const rows=parsePurchaseCSV(csv);
  assert.equal(rows[0].reference,'FAC;001');
  assert.equal(rows[0].netAmount,'1234.50');
  assert.equal(rows[0].description,'Ligne avec ; séparateur');
  assert.equal(rows.length,2);
});
test('CSV: refuses ambiguous dates, duplicate reference+line and missing columns',()=>{
  assert.throws(()=>parsePurchaseCSV('reference;date;montant_ht\nFAC-1;01/10/2026;20'),/Date/);
  assert.throws(()=>parsePurchaseCSV('reference;date;montant_ht\nFAC-1;2026-10-01;20\nFAC-1;2026-10-01;20'),/répétée/);
  assert.throws(()=>parsePurchaseCSV('reference;date\nFAC-1;2026-10-01'),/Colonnes/);
});
test('API: validates monetary inputs at cent precision, including credit notes',()=>{
  assert.equal(purchaseValidation.parseMoney('125.50'),'12550');
  assert.equal(purchaseValidation.parseMoney('-35.09'),'-3509');
  assert.equal(purchaseValidation.fmtCents(-3509n),'-35.09');
  assert.throws(()=>purchaseValidation.parseMoney('1.005'));
  assert.throws(()=>purchaseValidation.parseMoney('0'));
});
test('API: refuses duplicate reference with modified amount and rolls back entire import',async()=>{
  const queries=[];
  const client={query:async(sql,params)=>{
    queries.push(String(sql));
    if(String(sql).includes('FROM hs_buying.suppliers'))return{rows:[{id:supplierId,name:'Supplier',status:'ACTIVE',account_mappings:{FRANPRIX:'V101'}}]};
    if(String(sql).includes('FROM hs_buying.purchase_entries WHERE'))return{rows:[{
      external_reference:'FAC-001',line_key:'0',document_date:'2026-10-01',amount_cents:'20000',
      erp_vendor_account:'V101',data_area_id:'frp',source_kind:'D365_EXPORT'
    }]};
    return{rows:[]};
  },release(){}};
  const db={pool:{connect:async()=>client}};
  const request=new Request('https://test.local/api/buying-group/purchases/import',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({entityCode:'FRANPRIX',supplierId,sourceKind:'D365_EXPORT',dataAreaId:'frp',
      rows:[{reference:'FAC-001',date:'2026-10-01',netAmount:'100.00',vendorAccount:'V101'}]})
  });
  const response=await serveBuyingPurchases(request,db,{id:'director'});
  assert.equal(response.status,409);
  assert.equal(queries.includes('ROLLBACK'),true);
  assert.equal(queries.some(x=>x.includes('INSERT INTO hs_buying.purchase_entries')),false);
});
test('API: idempotent reimport skips an identical invoice without creating new entry',async()=>{
  const commands=[];
  const client={query:async(sql,params)=>{
    commands.push(String(sql));
    if(String(sql).includes('FROM hs_buying.suppliers'))return{rows:[{id:supplierId,name:'Supplier',status:'ACTIVE',account_mappings:{FRANPRIX:'V101'}}]};
    if(String(sql).includes('FROM hs_buying.purchase_entries WHERE'))return{rows:[{
      external_reference:'FAC-001',line_key:'0',document_date:'2026-10-01',amount_cents:'10000',
      erp_vendor_account:'V101',data_area_id:'frp',source_kind:'D365_EXPORT'
    }]};
    if(String(sql).includes('INSERT INTO hs_buying.purchase_batches'))return{rows:[{id:batchId,created_at:'2026-11-02T00:00:00Z'}]};
    return{rows:[]};
  },release(){}};
  const db={pool:{connect:async()=>client}};
  const request=new Request('https://test.local/api/buying-group/purchases/import',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({entityCode:'FRANPRIX',supplierId,sourceKind:'D365_EXPORT',dataAreaId:'frp',
      rows:[{reference:'FAC-001',date:'2026-10-01',netAmount:'100.00',vendorAccount:'V101'}]})
  });
  const response=await serveBuyingPurchases(request,db,{id:'director'});
  assert.equal(response.status,201);
  const result=await response.json();
  assert.equal(result.inserted,0);
  assert.equal(result.skipped,1);
  assert.equal(commands.some(x=>x.includes('INSERT INTO hs_buying.purchase_entries')),false);
  assert.equal(commands.includes('COMMIT'),true);
});
test('API: reconciles a declared group contract against imported net amounts only',async()=>{
  const db={pool:{query:async(sql)=>{
    if(String(sql).includes('FROM hs_buying.contracts WHERE id<>'))return{rows:[{count:1}]};
    if(String(sql).includes('FROM hs_buying.contracts WHERE id'))return{rows:[{
      id:contractId,title:'Accord Groupe test',supplier_id:supplierId,scope:'GROUP',
      entity_code:'GROUP',status:'ACTIVE',effective_from:'2026-01-01',effective_to:'2026-12-31',
      rebate_tiers:[{threshold:'0',rateBps:300}],rebate_mode:'RETROACTIVE',rebate_base:'NET_INVOICED'
    }]};
    if(String(sql).includes('FROM hs_buying.purchase_entries WHERE'))return{rows:[{
      line_count:3,amount_cents:'120000000',entities:['FRANPRIX','VENEZIA'],sources:['D365_EXPORT']
    }]};
    throw Error('Unexpected query: '+sql);
  }}};
  const response=await serveBuyingPurchases(new Request('https://test.local/api/buying-group/contracts/'+contractId+'/reconcile'),db,{id:'director'});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.importedNetMAD,'1200000.00');
  assert.equal(result.estimatedRfaMAD,'36000.00');
  assert.equal(result.overlapRisk,true);
  assert.equal(result.certified,false);
  assert.equal(result.booked,false);
});
test('Database: proper uniqueness, batch lineage and legal entity scope',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS hs_buying.purchase_batches/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS hs_buying.purchase_entries/);
  assert.match(migration,/UNIQUE\(entity_code,supplier_id,external_reference,line_key\)/);
  assert.match(migration,/source_kind VARCHAR\(20\)/);
  assert.match(migration,/REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC/);
  assert.match(router,/serveBuyingPurchases\(req,db,user\)/);
});
test('UI: contains import preview, duplicates notice, legal-company field and rebate warning',()=>{
  for(const token of ['dataAreaId','D365_EXPORT','MANUAL_CSV','state.preview','sourceKind','reconciliation','overlapRisk','non certifié'])assert.ok(management.includes(token),token);
  assert.match(cockpit,/id:'purchases'/);
  assert.match(cockpit,/id:'reconcile'/);
});

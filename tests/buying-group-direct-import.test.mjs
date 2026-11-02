import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {serveContractIntakes,contractIntakeValidation} from '../backend/services/buying-group-contract-intake.mjs';

const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(path.join(dir,p),'utf8');
const migration=file('netlify/database/migrations/20261102180000_hs_contract_direct_intake.sql');
const router=file('backend/services/buying-group-api.mjs');
const workflow=file('frontend/js/pages/buying-group-workflows.js');
const ui=file('frontend/js/pages/buying-group-intake.js');
const css=file('frontend/buying-group.css');
const apiTransport=file('frontend/js/api.js');
const staff={id:'director-test'};
const intakeId='11111111-1111-4111-8111-111111111111';
const vendorId='22222222-2222-4222-8222-222222222222';
const contractId='33333333-3333-4333-8333-333333333333';
const docId='44444444-4444-4444-8444-444444444444';
const pdf=Buffer.from('%PDF-1.7\nfake contract file for test\n');
const hash=createHash('sha256').update(pdf).digest('hex');

test('PDF and DOCX are supported from file signature, even when browser MIME is missing',()=>{
  assert.equal(contractIntakeValidation.detectMime('contrat.PDF',pdf),'application/pdf');
  assert.equal(contractIntakeValidation.detectMime('contrat.docx',Buffer.from('PK\u0003\u0004rest')),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.throws(()=>contractIntakeValidation.detectMime('contrat.pdf',Buffer.from('not PDF')),/vrai PDF/);
  assert.match(apiTransport,/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
});
test('Direct upload requires no supplier, contract ID or effective dates',async()=>{
  const statements=[],actions=[];
  const fake={query:async(sql,params)=>{
    statements.push(String(sql));
    if(String(sql).includes('INSERT INTO hs_buying.audit_events'))actions.push(params[1]);
    if(String(sql).includes('FROM hs_buying.contract_intakes WHERE created_by=$1 AND sha256'))return{rows:[]};
    if(String(sql).includes('count(*)::int'))return{rows:[{count:0}]};
    if(String(sql).includes('INSERT INTO hs_buying.contract_intakes'))return{rows:[{
      id:intakeId,file_name:'Contrat.pdf',status:'UPLOADED',created_at:'2026-11-02T15:00:00Z'
    }]};
    return{rows:[]};
  },release(){}};
  const req=new Request('https://storeops.test/api/buying-group/intakes',{method:'POST',
    headers:{'x-file-name':encodeURIComponent('Contrat.pdf')},body:pdf});
  const response=await serveContractIntakes(req,{pool:{connect:async()=>fake}},staff);
  assert.equal(response.status,201);
  assert.equal((await response.json()).item.id,intakeId);
  assert.ok(statements.includes('COMMIT'));
  assert.ok(actions.includes('CONTRACT_INTAKE_UPLOADED'));
  assert.ok(!statements.some(s=>s.includes('INSERT INTO hs_buying.contracts')));
});
test('Upload rejects files greater than 5MB and invalid signatures before DB access',async()=>{
  const db={pool:{connect(){throw Error('MUST NOT CONNECT')},query(){throw Error('MUST NOT QUERY')}}};
  const huge=await serveContractIntakes(new Request('https://storeops.test/api/buying-group/intakes',{
    method:'POST',headers:{'x-file-name':'contrat.pdf','content-length':'6000000'},body:'x'
  }),db,staff);
  assert.equal(huge.status,413);
  const bad=await serveContractIntakes(new Request('https://storeops.test/api/buying-group/intakes',{
    method:'POST',headers:{'x-file-name':'contrat.pdf'},body:'not a pdf'
  }),db,staff);
  assert.equal(bad.status,422);
});
test('Uploading a file twice is idempotent for the same user, without duplicate storage',async()=>{
  const statements=[];
  const fake={query:async sql=>{
    statements.push(String(sql));
    if(String(sql).includes('FROM hs_buying.contract_intakes WHERE created_by'))return{rows:[{
      id:intakeId,file_name:'Contrat.pdf',status:'UPLOADED',created_at:'2026-11-02'
    }]};
    return{rows:[]};
  },release(){}};
  const r=await serveContractIntakes(new Request('https://storeops.test/api/buying-group/intakes',{
    method:'POST',headers:{'x-file-name':'Contrat.pdf'},body:pdf
  }),{pool:{connect:async()=>fake}},staff);
  assert.equal(r.status,200);assert.equal((await r.json()).item.reused,true);
  assert.equal(statements.some(s=>s.includes('INSERT INTO hs_buying.contract_intakes')),false);
});
test('Contract registration refuses missing dates but does not block initial upload',()=>{
  const validate=contractIntakeValidation.validateRegistration;
  const base={supplierName:'Lesieur',title:'Accord Lesieur',scope:'GROUP',entityCode:'GROUP',confirmReview:true,
    effectiveFrom:'2026-01-01',effectiveTo:'2027-01-01',rebateTiers:[]};
  assert.throws(()=>validate({...base,effectiveFrom:''}),/Dates contractuelles/);
  assert.throws(()=>validate({...base,confirmReview:false}),/Confirme/);
  assert.equal(validate(base).supplierName,'Lesieur');
  assert.equal(validate({...base,scope:'LOCAL',entityCode:'FRANPRIX'}).entityCode,'FRANPRIX');
  assert.throws(()=>validate({...base,scope:'LOCAL'}),/cohérente/);
});
test('Final registration creates a supplier, draft, document and workflow in one transaction',async()=>{
  const sqls=[],actions=[];
  const db={pool:{connect:async()=>({
    query:async(sql,params)=>{
      sqls.push(String(sql));
      if(String(sql).includes('INSERT INTO hs_buying.audit_events'))actions.push(params[1]);
      if(String(sql).startsWith('SELECT * FROM hs_buying.contract_intakes'))return{rows:[{
        id:intakeId,status:'UPLOADED',file_name:'Contrat.pdf',content_type:'application/pdf',
        byte_size:pdf.length,sha256:hash,file_bytes:pdf,created_by:'director-test'
      }]};
      if(String(sql).includes('SELECT id,name FROM hs_buying.suppliers WHERE normalized_name'))return{rows:[]};
      if(String(sql).includes('INSERT INTO hs_buying.suppliers'))return{rows:[{id:vendorId,name:'Lesieur'}]};
      if(String(sql).includes('INSERT INTO hs_buying.contracts'))return{rows:[{id:contractId,title:'Accord Lesieur',status:'DRAFT'}]};
      if(String(sql).includes('INSERT INTO hs_buying.contract_documents'))return{rows:[{id:docId}]};
      return{rows:[]};
    },release(){}
  })}};
  const res=await serveContractIntakes(new Request('https://storeops.test/api/buying-group/intakes/'+intakeId+'/register',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      supplierName:'Lesieur',title:'Accord Lesieur',scope:'GROUP',entityCode:'GROUP',
      effectiveFrom:'2026-01-01',effectiveTo:'2027-01-01',rebateTiers:[],confirmReview:true
    })
  }),db,staff);
  assert.equal(res.status,201);
  const body=await res.json();
  assert.equal(body.item.contractId,contractId);
  for(const fragment of ['INSERT INTO hs_buying.suppliers','INSERT INTO hs_buying.contracts',
    'INSERT INTO hs_buying.contract_documents','INSERT INTO hs_buying.contract_workflows',
    "file_bytes=NULL",'COMMIT'])
    assert.ok(sqls.some(s=>s.includes(fragment)),fragment);
  assert.ok(actions.includes('CONTRACT_INTAKE_REGISTERED'));
  assert.ok(actions.includes('CONTRACT_CREATED_FROM_IMPORT'));
});
test('Import and registration use the existing server-side Director authorization',()=>{
  assert.match(router,/serveContractIntakes\(req,db,user\)/);
  assert.match(file('netlify/functions/api.mts'),/authenticatedUser\(request,runtime\)/);
  assert.match(file('netlify/functions/api.mts'),/user\.role==='ops_director'/);
});
test('SQL creates private inbox with immutable hash and no operational StoreOps table changes',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS hs_buying\.contract_intakes/);
  assert.match(migration,/file_bytes BYTEA/);
  assert.match(migration,/status IN \('UPLOADED','ANALYZED','REGISTERED'\)/);
  assert.match(migration,/REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC/);
  assert.doesNotMatch(migration,/CREATE TABLE IF NOT EXISTS stores/);
});
test('Upload is present before preexisting contract selection, with drop zone, registration and AI consent',()=>{
  assert.match(workflow,/id="hsiIntakeHost"/);
  assert.match(workflow,/renderContractIntake\(inbox/);
  assert.match(ui,/hsiUpload/);
  assert.match(ui,/data-hsi-select/);
  assert.match(ui,/confirmReview/);
  assert.match(ui,/hsiConsent/);
  assert.match(ui,/dataTransfer/);
  assert.match(ui,/state\.ai\?\.enabled/);
  assert.match(css,/#hsiIntakeHost \.hsi-drop/);
});

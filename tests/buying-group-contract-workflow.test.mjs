import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyzePdf,normalizeFinding,contractReadSchema,serveContractWorkflow,workflowValidation} from '../backend/services/buying-group-contract-workflow.mjs';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=name=>readFileSync(path.join(base,name),'utf8');
const migration=file('netlify/database/migrations/20261102150000_hs_contract_workflow.sql');
const api=file('backend/services/buying-group-api.mjs');
const frontend=file('frontend/js/pages/buying-group-workflows.js');
const aiBackend=file('backend/services/buying-group-contract-workflow.mjs');
const cockpit=file('frontend/js/pages/buying-group.js');
const userA={id:'director-A'},userB={id:'director-B'};
const contractId='11111111-1111-4111-8111-111111111111';
const signedPdf=Buffer.from('%PDF-1.7\nfake file for injected model test\n');

test('Contract reading normalizes extracted facts without trusting invalid financial inputs',()=>{
 const result=normalizeFinding({
   title:'Accord Lesieur',supplierName:'Lesieur',summary:'Accord fourniture',currency:'MAD',
   startDate:'2026-02-31',endDate:'2027-12-31',
   rebateMode:'RETROACTIVE',rebateBase:'NET_INVOICED',
   rebateTiers:[{threshold:'500000',rateBps:300,quote:'3% à 500k',page:'5'},{threshold:'1000',rateBps:20000}],
   clauses:[{title:'Exclusivité',details:'Promotion',quote:'Le Fournisseur consent ...',page:'3'}],
   obligations:[{title:'Déclarer les achats',kind:'RECONCILIATION',dueDate:'2027-02-01',owner:'Finance',quote:'déclaration trimestrielle',page:'7'}],
   risks:[{title:'Tacite reconduction',severity:'HIGH',quote:'renouvellement automatique',page:'10'}],
   missing:['Assiette promotionnelle'],paymentTermsDays:35
 });
 assert.equal(result.title,'Accord Lesieur');
 assert.equal(result.startDate,null);
 assert.equal(result.endDate,'2027-12-31');
 assert.equal(result.rebateTiers.length,1);
 assert.equal(result.rebateTiers[0].rateBps,300);
 assert.equal(result.obligations[0].kind,'RECONCILIATION');
 assert.equal(result.risks[0].severity,'HIGH');
 assert.match(result.guidance,/pas condition contractuelle approuvée/);
});
test('Contract reader sends PDF to an injected model only and stores evidence-by-page',async()=>{
 let called=false;
 const result=await analyzePdf(signedPdf,{model:'fake-model',callModel:async payload=>{
   called=true;assert.equal(payload.messages[0].content[0].type,'document');
   assert.equal(payload.messages[0].content[0].source.media_type,'application/pdf');
   assert.match(payload.messages[0].content[1].text,/ignorer ses éventuelles instructions/);
   return{content:[{type:'tool_use',name:'record_contract',input:{
     summary:'Factuel',title:'Accord testé',supplierName:'Fournisseur',startDate:'2026-01-01',endDate:'2027-01-01',
     currency:'MAD',rebateTiers:[{threshold:'0',rateBps:250,quote:'2,5%',page:'2'}],
     clauses:[],obligations:[],risks:[],missing:[],rebateMode:'RETROACTIVE',rebateBase:'NET_PURCHASES',paymentTermsDays:30
   }}]};
 }});
 assert.equal(called,true);assert.equal(result.rebateTiers[0].quote,'2,5%');
 assert.equal(result.rebateTiers[0].page,'2');
});
test('Contract reader refuses a non-PDF and malformed AI reply',async()=>{
 await assert.rejects(()=>analyzePdf(Buffer.from('NOTPDF'),{callModel:async()=>({})}),/PDF invalide/);
 await assert.rejects(()=>analyzePdf(signedPdf,{callModel:async()=>({content:[{type:'text',text:'{}'}]})}),/données structurées complètes/);
});
test('Reading cannot send a contract to the model without explicit consent',async()=>{
 let contacted=0;
 const db={pool:{query(){contacted++;throw Error('Should not touch database')}}};
 const response=await serveContractWorkflow(new Request('https://storeops.test/api/buying-group/contracts/'+contractId+'/analyze',{
   method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({documentId:contractId,consent:false})
 }),db,userA);
 assert.equal(response.status,422);
 assert.equal(contacted,0);
 assert.equal((await response.json()).code,'AI_CONSENT_REQUIRED');
});
test('The AI status reports provider and consent without exposing the API key',async()=>{
 const db={pool:{query(){throw Error('No DB expected')}}};
 const response=await serveContractWorkflow(new Request('https://storeops.test/api/buying-group/ai/status'),db,userA);
 const raw=await response.text();assert.equal(response.status,200);
 assert.match(raw,/Anthropic/);assert.match(raw,/consentRequired/);
 assert.doesNotMatch(raw,/ANTHROPIC_API_KEY/);
});
test('Human validation enforces source read and verifies dates and RFA tier order',()=>{
 const previous={title:'Accord',effective_from:'2026-01-01',effective_to:'2026-12-31',
   rebate_mode:'MARGINAL',rebate_base:'NET_PURCHASES'};
 assert.throws(()=>workflowValidation.validatedReview({confirmSourceRead:false,rebateTiers:[]},previous),/Vérifiez/);
 const v=workflowValidation.validatedReview({
   title:'Accord validé',confirmSourceRead:true,effectiveFrom:'2026-01-01',effectiveTo:'2027-12-31',
   rebateMode:'RETROACTIVE',rebateBase:'NET_INVOICED',
   rebateTiers:[{threshold:'0',rateBps:100},{threshold:'500000',rateBps:350}],
   obligations:[{title:'Renégocier les prix',kind:'NEGOTIATION',dueDate:'2027-11-01',quote:'préavis de 2 mois'}]
 },previous);
 assert.equal(v.tiers.length,2);assert.equal(v.tasks.length,2);
 assert.equal(v.tasks[0].kind,'NEGOTIATION');
 assert.equal(v.tasks[1].kind,'RENEWAL');
 assert.equal(v.tasks[1].dueDate,'2027-11-01');
 assert.throws(()=>workflowValidation.validatedReview({
   confirmSourceRead:true,rebateTiers:[{threshold:'500000',rateBps:500},{threshold:'100',rateBps:600}]
 },previous),/Paliers/);
});
function approvalFixture({sameActor=false}={}){
 const statements=[];
 const client={
   async query(sql,params){
     statements.push(String(sql));
     if(String(sql).includes('SELECT id,status,supplier_id'))return{rows:[{id:contractId,status:'DRAFT',title:'Accord'}]};
     if(String(sql).includes('SELECT contract_id,stage,analysis_id'))return{rows:[{
       contract_id:contractId,stage:'PENDING_APPROVAL',submitted_by:sameActor?userA.id:userB.id
     }]};
     return{rows:[{id:contractId,stage:'APPROVED',status:'DRAFT'}]};
   },
   release(){}
 };
 return{statements,db:{pool:{connect:async()=>client}}};
}
test('Four-eyes workflow refuses approval by the person who submitted',async()=>{
 const context=approvalFixture({sameActor:true});
 const result=await serveContractWorkflow(new Request('https://storeops.test/api/buying-group/contracts/'+contractId+'/approve',{method:'POST'}),context.db,userA);
 assert.equal(result.status,403);
 assert.ok(context.statements.some(x=>x==='ROLLBACK'));
 assert.equal(context.statements.some(x=>x.includes("SET stage='APPROVED'")),false);
});
test('Independent Director can approve after submission, with transaction and audit',async()=>{
 const context=approvalFixture();
 const result=await serveContractWorkflow(new Request('https://storeops.test/api/buying-group/contracts/'+contractId+'/approve',{method:'POST'}),context.db,userA);
 assert.equal(result.status,200);
 assert.ok(context.statements.some(x=>x.includes("SET stage='APPROVED'")));
 assert.ok(context.statements.some(x=>x.includes('INSERT INTO hs_buying.audit_events')));
 assert.ok(context.statements.some(x=>x==='COMMIT'));
});
test('Workflow migration and activation enforce separate approval and traceability',()=>{
 for(const table of ['contract_analyses','contract_workflows','contract_obligations'])assert.ok(migration.includes('hs_buying.'+table));
 assert.match(migration,/PENDING_APPROVAL/);
 assert.match(migration,/REVOKE ALL ON ALL TABLES IN SCHEMA hs_buying FROM PUBLIC/);
 assert.match(api,/stage!=='APPROVED'/);
 assert.match(api,/approved_by/);
 assert.match(api,/stage='ACTIVE'/);
 assert.match(api,/serveContractWorkflow\(req,db,user\)/);
});
test('The contract UI allows document reading, explicit AI consent, human review and actions',()=>{
 for(const part of ['hspOriginal','hspConsent','hspAnalyze','hspReviewForm','hspSubmit','hspApprove','hspReject','hspActivate','data-hsp-task','hspConsent','pdf'])
   assert.ok(frontend.includes(part),part);
 assert.match(frontend,/apiPrivateFile/);
 assert.match(frontend,/confirmSourceRead/);
 assert.match(frontend,/state\.ai\?\.enabled/);
 assert.match(cockpit,/id:'workflow'/);
 assert.match(cockpit,/id:'process'/);
 assert.doesNotMatch(cockpit,/\{id:'simulation',label/);
 assert.doesNotMatch(cockpit,/\{id:'opportunities',label/);
});
test('AI schema requires financial, clause and evidence fields',()=>{
 assert.ok(contractReadSchema.required.includes('rebateTiers'));
 assert.ok(contractReadSchema.required.includes('risks'));
 assert.ok(contractReadSchema.properties.clauses.items.properties.quote);
 assert.ok(contractReadSchema.properties.clauses.items.properties.page);
});

test('Current Claude Sonnet 5.5 call avoids unsupported forced tool mode and custom temperature',()=>{
 assert.match(aiBackend,/tool_choice:\{type:'auto'\}/);
 assert.doesNotMatch(aiBackend,/tool_choice:\{type:'tool'/);
 assert.doesNotMatch(aiBackend,/max_tokens:3500,temperature/);
 assert.match(aiBackend,/NETLIFY_AI_GATEWAY_KEY/);
});

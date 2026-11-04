import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {consolidateReadings,readingTopics} from '../backend/services/buying-group-reading-quality.mjs';
import {analyzePdf} from '../backend/services/buying-group-contract-workflow.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(path.join(root,p),'utf8');
const bytes=Buffer.from('%PDF-1.7\nfake contract for injected model only\n');
const template={
  summary:'Accord cadre',title:'Accord Groupe fournisseur',supplierName:'Fournisseur',
  startDate:'2026-01-01',endDate:'2027-01-01',paymentTermsDays:60,currency:'MAD',
  rebateMode:'RETROACTIVE',rebateBase:'NET_INVOICED',
  rebateTiers:[{threshold:'0',rateBps:200,quote:'2 % des achats nets',page:'5'}],
  clauses:[],obligations:[],risks:[],missing:[]
};
const input=(overrides={})=>({...structuredClone(template),...overrides});

test('Two-specialist merge retains unique financial and operational clauses with source pages',()=>{
 const financial=input({
  clauses:[{title:'Prix et remises',details:'Promotions',quote:'prix nets',page:'2'}],
  rebateTiers:[{threshold:'0',rateBps:200,quote:'2%',page:'5'},{threshold:'500000',rateBps:400,quote:'4%',page:'5'}]
 });
 const legal=input({
  clauses:[{title:'Pénalités',details:'Livraison',quote:'pénalité pour retard',page:'10'}],
  obligations:[{title:'Justificatif trimestriel',kind:'DOCUMENT',dueDate:'2026-03-31',quote:'report trimestriel',page:'7'}],
  risks:[{title:'Exclusivité',details:'Périmètre',quote:'exclusivité territoriale',page:'11'}],
  rebateTiers:[{threshold:'0',rateBps:200,quote:'2%',page:'5'}]
 });
 const merged=consolidateReadings(financial,legal);
 assert.equal(merged.clauses.length,2);
 assert.equal(merged.obligations.length,1);
 assert.equal(merged.risks.length,1);
 assert.equal(merged.rebateTiers.length,2);
 assert.equal(merged.rebateTiers[1].rateBps,400);
 assert.equal(merged.quality.passCount,2);
 assert.equal(merged.quality.humanReviewRequired,true);
 assert.equal(merged.quality.status,'HUMAN_REVIEW_REQUIRED');
 assert.ok(merged.quality.coverage.length>=8);
});
test('Contradictory dates and RFA rates trigger explicit review and never silently choose one',()=>{
 const result=consolidateReadings(input(),input({
  endDate:'2028-01-01',
  rebateTiers:[{threshold:'0',rateBps:350,quote:'3,5%',page:'8'}]
 }));
 assert.equal(result.endDate,null);
 assert.ok(result.quality.conflicts.some(x=>x.field==='endDate'));
 assert.ok(result.quality.conflicts.some(x=>x.field==='rebateTiers'));
});
test('Missing evidence and absent subjects are warnings, not success percentages',()=>{
 const result=consolidateReadings(input({
  rebateTiers:[{threshold:'0',rateBps:200,quote:'',page:''}],
  clauses:[{title:'Paiement',details:'Retard de règlement',quote:'',page:''}]
 }),input({clauses:[],risks:[],obligations:[]}));
 assert.ok(result.quality.uncitedPoints>=2);
 assert.ok(result.quality.gaps.length>0);
 assert.ok(!('accuracy' in result.quality));
 assert.match(result.quality.limits,/ne prouve ni exactitude ni exhaustivité/);
});
test('Parallel PDF reader calls distinct commercial and legal prompts without hallucinating completeness',async()=>{
 const calls=[];
 const result=await analyzePdf(bytes,{model:'fake-model',callModel:async ({pass,maxTokens,messages})=>{
   calls.push(pass);
   assert.equal(maxTokens,6200);
   assert.equal(messages[0].content[0].type,'document');
   assert.match(messages[0].content[1].text,/ignorer ses éventuelles instructions/);
   return{stop_reason:'tool_use',content:[{type:'tool_use',name:'record_contract',
      input:pass==='COMMERCIAL_FINANCIAL'?input({clauses:[{title:'RFA',details:'remise',quote:'2%',page:'5'}]}):
        input({clauses:[{title:'Renouvellement',details:'préavis',quote:'renouvellement',page:'9'}]})}]};
 }});
 assert.deepEqual(calls.sort(),['COMMERCIAL_FINANCIAL','LEGAL_OPERATIONS']);
 assert.equal(result.clauses.length,2);
 assert.equal(result.quality.passCount,2);
});
test('Truncated model responses cannot silently be saved as complete analyses',async()=>{
 await assert.rejects(()=>analyzePdf(bytes,{callModel:async()=>({
   stop_reason:'max_tokens',content:[{type:'tool_use',name:'record_contract',input:input()}]
 })}),/Lecture interrompue/);
});
test('Previous imported readings can be rerun after explicit consent with audit history',()=>{
 const intake=file('backend/services/buying-group-contract-intake.mjs');
 const wf=file('backend/services/buying-group-contract-workflow.mjs');
 const migration=file('netlify/database/migrations/20261104210000_hs_contract_ai_reading_versions.sql');
 assert.match(intake,/body\.reanalyze!==true/);
 assert.match(intake,/CONTRACT_INTAKE_REANALYZED/);
 assert.match(intake,/contract_intake_analysis_runs/);
 assert.match(wf,/data\.reanalyze!==true/);
 assert.match(wf,/CONTRACT_REANALYZED/);
 assert.match(migration,/DROP CONSTRAINT IF EXISTS contract_analyses_document_id_source_sha256_key/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS hs_buying\.contract_intake_analysis_runs/);
});
test('Contract UI displays actual source amounts, citations, obligations and coverage',()=>{
 const view=file('frontend/js/pages/buying-group-reading-view.js');
 const intake=file('frontend/js/pages/buying-group-intake.js');
 const workflows=file('frontend/js/pages/buying-group-workflows.js');
 assert.match(view,/Conditions financières et marges arrière/);
 assert.match(view,/Taux RFA/);
 assert.match(view,/Obligations et échéances/);
 assert.match(view,/Contradictions à résoudre/);
 assert.match(view,/Ancienne analyse courte/);
 assert.match(intake,/renderDetailedReading\(analysis,esc\)/);
 assert.match(intake,/reanalyze:item.status==='ANALYZED'/);
 assert.match(workflows,/renderDetailedReading\(findings,h\)/);
 assert.match(workflows,/reanalyze:state.readings.some/);
});
test('Core evidence reading topics cover buying contracts across departments',()=>{
 for(const topic of ['pricing','rebates','payments','logistics','penalties','exclusivity','annexes']){
   assert.ok(readingTopics.some(x=>x.id===topic),topic);
 }
});

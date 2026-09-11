import assert from 'node:assert/strict';
import {db,todayISO} from '../db.mjs';
import {saveProcessTemplate,saveProcessAssignment,ensureProcessRuns,processRun,completeProcessStep,completeProcessRun,customProcessBlockers} from '../services/process-studio.mjs';

const user=db.prepare(`SELECT * FROM users WHERE role='ops_director' LIMIT 1`).get();
const store=db.prepare(`SELECT * FROM stores WHERE id='val-fleuri'`).get()||db.prepare(`SELECT * FROM stores WHERE active=1 LIMIT 1`).get();
assert.ok(user&&store,'pilot seed must expose a director and active store');
const day=todayISO();

const template=saveProcessTemplate({user,input:{
 code:'TEST_PREMIUM_OPENING',name:'Test ouverture premium',version:'1',trigger:'DAILY',scope:'STORE',
 steps:[
  {code:'facade',title:'Façade conforme',required:true,evidenceRequired:true},
  {code:'fresh',title:'Frais contrôlés',required:true,evidenceRequired:false}
 ],gates:[]
}});
const assignment=saveProcessAssignment({user,templateId:template.id,storeId:store.id,mandatory:true,blockingLevel:'STORE_OPENING'});
assert.equal(assignment.blocking_level,'STORE_OPENING');

let runs=ensureProcessRuns(store.id,day),run=runs.find(x=>x.assignment_id===assignment.id);
assert.ok(run,'daily run must be created from assignment');
assert.equal(run.template.steps.length,2);
assert.equal(run.evaluation.progress.total,2);
assert.equal(customProcessBlockers(store.id,day,'STORE_OPENING').some(x=>x.runId===run.id),true,'mandatory custom run must block opening');

// Daily execution is immutable: changing the template must not rewrite today's run.
saveProcessTemplate({user,id:template.id,input:{
 code:'TEST_PREMIUM_OPENING',name:'Test ouverture premium v2',version:'2',trigger:'DAILY',scope:'STORE',
 steps:[{code:'new_only',title:'Nouvelle étape demain',required:true,evidenceRequired:false}],gates:[]
}});
run=processRun(run.id);
assert.equal(run.template.version,'1','existing run must preserve its original template version');
assert.deepEqual(run.template.steps.map(x=>x.code),['facade','fresh'],'existing run must preserve original steps');

let evidenceBlocked=false;
try{completeProcessStep({runId:run.id,stepCode:'facade',user})}catch(e){evidenceBlocked=e.code==='PROCESS_EVIDENCE_REQUIRED'}
assert.equal(evidenceBlocked,true,'evidence-required step must reject completion without evidence');

run=completeProcessStep({runId:run.id,stepCode:'facade',user,evidenceRef:'photo://opening/facade-1'});
assert.equal(run.steps.find(x=>x.step_code==='facade').status,'COMPLETED');
run=completeProcessStep({runId:run.id,stepCode:'fresh',user});
assert.equal(run.status,'READY_TO_COMPLETE');
run=completeProcessRun({runId:run.id,user});
assert.equal(run.status,'COMPLETED');
assert.equal(customProcessBlockers(store.id,day,'STORE_OPENING').some(x=>x.runId===run.id),false,'completed custom run must release opening blocker');

let duplicate=false;
try{saveProcessAssignment({user,templateId:template.id,storeId:store.id,mandatory:true,blockingLevel:'STORE_OPENING'})}catch(e){duplicate=e.code==='PROCESS_ASSIGNMENT_EXISTS'}
assert.equal(duplicate,true,'duplicate assignment must be rejected explicitly');

const workflowSource=await import('node:fs').then(({readFileSync})=>readFileSync(new URL('../services/workflow.mjs',import.meta.url),'utf8'));
assert.match(workflowSource,/customProcessBlockers\(storeDay\.store_id,storeDay\.business_date,blockingLevel\)/,'store opening/closing validation must consume Process Studio blockers');

console.log('StoreOps V1.80 Process Studio contracts passed');

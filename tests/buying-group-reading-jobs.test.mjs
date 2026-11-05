import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {startReadJob,runReadJob,serveReadJobStatus} from '../backend/services/buying-group-reading-jobs.mjs';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(path.join(base,p),'utf8');
const intakeId='11111111-1111-4111-8111-111111111111';
const jobId='22222222-2222-4222-8222-222222222222';
const sampleSha='a'.repeat(64),user={id:'director-a'};
const url='https://storeops.ma/api/buying-group/intakes/'+intakeId+'/analyze';
const request=(body)=>new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function jobDb({active=null}={}){
 const commands=[];
 const pool={query:async(sql,params)=>{
  commands.push({sql:String(sql),params});
  if(String(sql).includes('SELECT id,status,content_type,sha256 FROM hs_buying.contract_intakes'))
   return{rows:[{id:intakeId,status:'UPLOADED',content_type:'application/pdf',sha256:sampleSha}]};
  if(String(sql).includes('SELECT id,requested_by,status FROM hs_buying.contract_read_jobs'))
   return{rows:active?[active]:[]};
  if(String(sql).includes('INSERT INTO hs_buying.contract_read_jobs'))
   return{rows:[{id:jobId,status:'QUEUED',requested_at:'2026-11-05T00:00:00Z'}]};
  return{rows:[]};
 }};
 return{db:{pool},commands};
}
test('Consent gate refuses a job before DB and without transmitting PDF',async()=>{
 const bad={pool:{query(){throw Error('MUST NOT TOUCH DB')}}};
 const resp=await startReadJob(request({consent:false}),bad,user,'INTAKE',intakeId,{aiAvailable:true,dispatch:async()=>true});
 assert.equal(resp.status,422);
 assert.equal((await resp.json()).code,'AI_CONSENT_REQUIRED');
});
test('Authenticated API queues a PDF and instantly returns 202 with job ID',async()=>{
 const {db,commands}=jobDb();let sent;
 const resp=await startReadJob(request({consent:true}),db,user,'INTAKE',intakeId,{
  aiAvailable:true,dispatch:async(req,payload)=>{sent=payload;return true}
 });
 assert.equal(resp.status,202);
 const body=await resp.json();assert.equal(body.jobId,jobId);
 assert.equal(body.status,'QUEUED');assert.equal(body.async,true);
 assert.equal(sent.jobId,jobId);assert.match(sent.token,/^[a-f0-9]{64}$/);
 assert.ok(commands.some(x=>x.sql.includes('INSERT INTO hs_buying.contract_read_jobs')));
 assert.ok(!commands.some(x=>x.sql.includes('ai_analysis')));
 assert.ok(!JSON.stringify(body).includes(sent.token));
});
test('Repeated click attaches to current job and cannot trigger second billable model call',async()=>{
 const active={id:jobId,requested_by:user.id,status:'RUNNING'};
 const {db,commands}=jobDb({active});let dispatched=0;
 const resp=await startReadJob(request({consent:true}),db,user,'INTAKE',intakeId,{
  aiAvailable:true,dispatch:async()=>{dispatched++;return true}
 });
 assert.equal(resp.status,202);assert.equal((await resp.json()).resumed,true);
 assert.equal(dispatched,0);
 assert.equal(commands.some(x=>x.sql.includes('INSERT INTO hs_buying.contract_read_jobs')),false);
});
test('Background dispatch failure marks job failed and shows usable retry message',async()=>{
 const {db,commands}=jobDb();
 const resp=await startReadJob(request({consent:true}),db,user,'INTAKE',intakeId,{
  aiAvailable:true,dispatch:async()=>false
 });
 assert.equal(resp.status,503);
 assert.equal((await resp.json()).code,'DISPATCH_FAILED');
 assert.ok(commands.some(x=>x.sql.includes("error_code='DISPATCH_FAILED'")));
});
function workerDb({sourceHash=sampleSha,success=true}={}){
 const commands=[];
 const db={pool:{query:async(sql,params)=>{
  const str=String(sql);commands.push({sql:str,params});
  if(str.includes("SET status='RUNNING'"))return{rows:[{
   id:jobId,target_type:'INTAKE',target_id:intakeId,contract_id:null,
   source_sha256:sampleSha,requested_by:user.id,reanalyze:false
  }]};
  if(str.includes('SELECT sha256 FROM hs_buying.contract_intakes'))return{rows:[{sha256:sourceHash}]};
  return{rows:[]};
 }}};
 return{db,commands};
}
test('Background worker ignores malformed invocation token before touching DB',async()=>{
 const db={pool:{query(){throw Error('Unauthorized DB access')}}};
 const result=await runReadJob(db,{jobId,token:'wrong'});
 assert.equal(result.code,'BAD_JOB_TOKEN');
});
test('Background worker finishes a previously queued job without browser roundtrip',async()=>{
 const {db,commands}=workerDb();let executed=false;
 const result=await runReadJob(db,{jobId,token:'a'.repeat(64)},{
  execute:async()=>{executed=true;return Response.json({ok:true},{status:201})}
 });
 assert.equal(result.code,'DONE');assert.equal(executed,true);
 assert.ok(commands.some(x=>x.sql.includes("SET status='DONE'")));
 assert.ok(commands.some(x=>x.sql.includes("SET status='RUNNING'")&&x.params.length===2));
});
test('Background worker refuses a changed PDF and records explicit failure',async()=>{
 const {db,commands}=workerDb({sourceHash:'b'.repeat(64)});
 const result=await runReadJob(db,{jobId,token:'a'.repeat(64)},{
  execute:async()=>{throw Error('Model should NOT be invoked')}
 });
 assert.equal(result.code,'FAILED');
 assert.ok(commands.some(x=>x.sql.includes("SET status='FAILED'")));
 assert.ok(commands.some(x=>x.params?.includes('DOCUMENT_CHANGED')));
});
test('Only the original requester can query a job, and no tokens are included',async()=>{
 const commands=[];
 const db={pool:{query:async(sql,params)=>{
  commands.push({sql:String(sql),params});
  if(String(sql).includes('FROM hs_buying.contract_read_jobs WHERE id='))return{rows:[{
   id:jobId,status:'RUNNING',target_type:'INTAKE',target_id:intakeId,requested_at:'2026-11-05T00:00:00Z'
  }]};
  return{rows:[]};
 }}};
 const res=await serveReadJobStatus(new Request('https://storeops.ma/api/buying-group/reading-jobs/'+jobId),db,user);
 assert.equal(res.status,200);const body=await res.json();assert.equal(body.job.id,jobId);
 assert.equal('tokenHash' in body.job,false);
 assert.ok(commands.some(x=>x.sql.includes('requested_by=$2')&&x.params[1]===user.id));
});
test('UI uses same-origin endpoints and durable background status, never external redirect',()=>{
 const route=file('backend/services/buying-group-api.mjs');
 const netlify=file('netlify/functions/hs-contract-reader-background.mts');
 const frontend=file('frontend/js/pages/buying-group-reading-queue.js');
 const intake=file('frontend/js/pages/buying-group-intake.js');
 const workflow=file('frontend/js/pages/buying-group-workflows.js');
 const migration=file('netlify/database/migrations/20261105113000_hs_contract_read_jobs.sql');
 assert.match(netlify,/background:true/);
 assert.match(route,/startReadJob\(req,db,user/);
 assert.match(route,/serveReadJobStatus\(req,db,user\)/);
 assert.match(frontend,/reading-jobs\/latest/);
 assert.match(frontend,/setTimeout\(refresh,4000\)/);
 assert.match(intake,/mountContractReadingProgress/);
 assert.match(workflow,/mountContractReadingProgress/);
 assert.match(migration,/hs_buying_one_active_reader_per_file/);
 assert.match(migration,/token_hash CHAR\(64\)/);
 assert.doesNotMatch(frontend,/window\.location|anthropic\.com|openUrl/);
});

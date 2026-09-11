import { db,uid,audit,todayISO } from '../db.mjs';
import { normalizeProcessTemplate,evaluateProcessTemplate } from './process-template-engine.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS process_templates(
 id TEXT PRIMARY KEY,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 version TEXT NOT NULL DEFAULT '1',
 trigger_code TEXT NOT NULL DEFAULT 'MANUAL',
 scope_code TEXT NOT NULL DEFAULT 'STORE',
 template_json TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS process_assignments(
 id TEXT PRIMARY KEY,
 template_id TEXT NOT NULL REFERENCES process_templates(id),
 store_id TEXT NULL REFERENCES stores(id),
 mandatory INTEGER NOT NULL DEFAULT 1,
 blocking_level TEXT NOT NULL DEFAULT 'PROCESS' CHECK(blocking_level IN ('NONE','PROCESS','STORE_OPENING','STORE_CLOSING')),
 effective_from TEXT NULL,
 effective_to TEXT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(template_id,store_id)
);
CREATE TABLE IF NOT EXISTS process_runs(
 id TEXT PRIMARY KEY,
 assignment_id TEXT NOT NULL REFERENCES process_assignments(id),
 template_id TEXT NOT NULL REFERENCES process_templates(id),
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS','READY_TO_COMPLETE','COMPLETED','CANCELLED')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_by TEXT NULL REFERENCES users(id),
 completed_at TEXT NULL,
 UNIQUE(assignment_id,store_id,business_date)
);
CREATE TABLE IF NOT EXISTS process_step_runs(
 run_id TEXT NOT NULL REFERENCES process_runs(id) ON DELETE CASCADE,
 step_code TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','SKIPPED')),
 value_json TEXT NULL,
 evidence_count INTEGER NOT NULL DEFAULT 0,
 completed_by TEXT NULL REFERENCES users(id),
 completed_at TEXT NULL,
 PRIMARY KEY(run_id,step_code)
);
CREATE TABLE IF NOT EXISTS process_gate_states(
 run_id TEXT NOT NULL REFERENCES process_runs(id) ON DELETE CASCADE,
 gate_code TEXT NOT NULL,
 ok INTEGER NOT NULL DEFAULT 0,
 detail TEXT NULL,
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(run_id,gate_code)
);
CREATE TABLE IF NOT EXISTS process_run_evidence(
 id TEXT PRIMARY KEY,
 run_id TEXT NOT NULL REFERENCES process_runs(id) ON DELETE CASCADE,
 step_code TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'REFERENCE',
 reference TEXT NOT NULL,
 note TEXT NULL,
 created_by TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_process_assign_store ON process_assignments(store_id,active,blocking_level);
CREATE INDEX IF NOT EXISTS ix_process_runs_store_date ON process_runs(store_id,business_date,status);
`);

const clean=v=>String(v??'').trim();
const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(clean(v))?clean(v):null;
const parse=j=>{try{return JSON.parse(j||'{}')}catch{return{}}};
function templateRow(id){return db.prepare(`SELECT * FROM process_templates WHERE id=?`).get(id)}
function assignmentRow(id){return db.prepare(`SELECT a.*,t.code template_code,t.name template_name,t.template_json,t.trigger_code,t.scope_code FROM process_assignments a JOIN process_templates t ON t.id=a.template_id WHERE a.id=?`).get(id)}
function runRow(id){return db.prepare(`SELECT r.*,a.blocking_level,a.mandatory,t.code template_code,t.name template_name,t.template_json,t.trigger_code FROM process_runs r JOIN process_assignments a ON a.id=r.assignment_id JOIN process_templates t ON t.id=r.template_id WHERE r.id=?`).get(id)}
function hydrateTemplate(row){if(!row)return null;return{...row,active:!!row.active,template:parse(row.template_json)}}
function hydrateAssignment(row){if(!row)return null;return{...row,active:!!row.active,mandatory:!!row.mandatory,template:parse(row.template_json)}}
function activeOn(row,day){return !!row.active&&(!row.effective_from||row.effective_from<=day)&&(!row.effective_to||row.effective_to>=day)}

export function listProcessTemplates({includeInactive=false}={}){return db.prepare(`SELECT * FROM process_templates ${includeInactive?'':`WHERE active=1`} ORDER BY name,code`).all().map(hydrateTemplate)}
export function saveProcessTemplate({user,id=null,input}){
 const normalized=normalizeProcessTemplate(input),nowId=id||uid('ptpl'),existing=id?templateRow(id):db.prepare(`SELECT * FROM process_templates WHERE code=?`).get(normalized.code);
 if(existing&&(!id||existing.id!==id))throw Object.assign(new Error('Ce code process existe déjà.'),{status:409,code:'PROCESS_TEMPLATE_CODE_EXISTS'});
 if(id&&!existing)throw Object.assign(new Error('Template process introuvable.'),{status:404,code:'PROCESS_TEMPLATE_NOT_FOUND'});
 const json=JSON.stringify(normalized);
 if(id)db.prepare(`UPDATE process_templates SET code=?,name=?,version=?,trigger_code=?,scope_code=?,template_json=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(normalized.code,normalized.name,normalized.version,normalized.trigger,normalized.scope,json,user?.id||null,id);
 else db.prepare(`INSERT INTO process_templates(id,code,name,version,trigger_code,scope_code,template_json,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)`).run(nowId,normalized.code,normalized.name,normalized.version,normalized.trigger,normalized.scope,json,user?.id||null,user?.id||null);
 audit({storeId:user?.store_id||'val-fleuri',userId:user?.id||null,action:id?'PROCESS_TEMPLATE_UPDATED':'PROCESS_TEMPLATE_CREATED',entityType:'PROCESS_TEMPLATE',entityId:nowId,details:{code:normalized.code,name:normalized.name,trigger:normalized.trigger,steps:normalized.steps.length,gates:normalized.gates.length}});
 return hydrateTemplate(templateRow(nowId))
}
export function setProcessTemplateActive({id,user,active}){const row=templateRow(id);if(!row)throw Object.assign(new Error('Template process introuvable.'),{status:404});db.prepare(`UPDATE process_templates SET active=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(active?1:0,user?.id||null,id);return hydrateTemplate(templateRow(id))}

export function listProcessAssignments({storeId=null,includeInactive=false}={}){
 const where=[],args=[];if(storeId){where.push('(a.store_id=? OR a.store_id IS NULL)');args.push(storeId)}if(!includeInactive)where.push('a.active=1');
 return db.prepare(`SELECT a.*,t.code template_code,t.name template_name,t.template_json,t.trigger_code,t.scope_code FROM process_assignments a JOIN process_templates t ON t.id=a.template_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY CASE WHEN a.store_id IS NULL THEN 0 ELSE 1 END,t.name`).all(...args).map(hydrateAssignment)
}
export function saveProcessAssignment({user,id=null,templateId,storeId=null,mandatory=true,blockingLevel='PROCESS',effectiveFrom=null,effectiveTo=null,active=true}){
 const template=templateRow(templateId);if(!template)throw Object.assign(new Error('Template process introuvable.'),{status:404,code:'PROCESS_TEMPLATE_NOT_FOUND'});
 const level=clean(blockingLevel||'PROCESS').toUpperCase();if(!['NONE','PROCESS','STORE_OPENING','STORE_CLOSING'].includes(level))throw Object.assign(new Error('Niveau de blocage invalide.'),{status:400});
 const from=effectiveFrom?iso(effectiveFrom):null,to=effectiveTo?iso(effectiveTo):null;if((effectiveFrom&&!from)||(effectiveTo&&!to)||(from&&to&&from>to))throw Object.assign(new Error('Période d’affectation invalide.'),{status:400});
 if(storeId&&!db.prepare(`SELECT id FROM stores WHERE id=? AND active=1`).get(storeId))throw Object.assign(new Error('Magasin introuvable.'),{status:404});
 const rid=id||uid('passign');
 if(id){if(!assignmentRow(id))throw Object.assign(new Error('Affectation process introuvable.'),{status:404});db.prepare(`UPDATE process_assignments SET template_id=?,store_id=?,mandatory=?,blocking_level=?,effective_from=?,effective_to=?,active=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(templateId,storeId,mandatory?1:0,level,from,to,active?1:0,user?.id||null,id)}
 else{try{db.prepare(`INSERT INTO process_assignments(id,template_id,store_id,mandatory,blocking_level,effective_from,effective_to,active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(rid,templateId,storeId,mandatory?1:0,level,from,to,active?1:0,user?.id||null,user?.id||null)}catch(e){if(String(e.message).includes('UNIQUE'))throw Object.assign(new Error('Ce process est déjà affecté à ce périmètre.'),{status:409,code:'PROCESS_ASSIGNMENT_EXISTS'});throw e}}
 audit({storeId:storeId||user?.store_id||'val-fleuri',userId:user?.id||null,action:id?'PROCESS_ASSIGNMENT_UPDATED':'PROCESS_ASSIGNED',entityType:'PROCESS_ASSIGNMENT',entityId:rid,details:{templateId,storeId,mandatory,blockingLevel:level,effectiveFrom:from,effectiveTo:to,active}});
 return hydrateAssignment(assignmentRow(rid))
}

export function ensureProcessRuns(storeId,businessDate=todayISO()){
 const day=iso(businessDate)||todayISO(),assignments=listProcessAssignments({storeId}).filter(a=>activeOn(a,day)&&a.active&&a.template?.steps?.length);
 for(const a of assignments){let run=db.prepare(`SELECT * FROM process_runs WHERE assignment_id=? AND store_id=? AND business_date=?`).get(a.id,storeId,day);if(!run){const id=uid('prun');db.prepare(`INSERT INTO process_runs(id,assignment_id,template_id,store_id,business_date) VALUES(?,?,?,?,?)`).run(id,a.id,a.template_id,storeId,day);for(const s of a.template.steps)db.prepare(`INSERT OR IGNORE INTO process_step_runs(run_id,step_code) VALUES(?,?)`).run(id,s.code);for(const g of a.template.gates||[])db.prepare(`INSERT OR IGNORE INTO process_gate_states(run_id,gate_code) VALUES(?,?)`).run(id,g.code)}}
 return listProcessRuns(storeId,day)
}
function stateForRun(row){const steps=db.prepare(`SELECT * FROM process_step_runs WHERE run_id=?`).all(row.id),gates=db.prepare(`SELECT * FROM process_gate_states WHERE run_id=?`).all(row.id),stepStates=Object.fromEntries(steps.map(x=>[x.step_code,{status:x.status,evidenceCount:x.evidence_count,value:parse(x.value_json)}])),gateStates=Object.fromEntries(gates.map(x=>[x.gate_code,{ok:!!x.ok,detail:x.detail}])),evaluation=evaluateProcessTemplate(parse(row.template_json),{stepStates,gateStates});return{steps,gates,evaluation}}
function hydrateRun(row){if(!row)return null;const state=stateForRun(row);return{...row,mandatory:!!row.mandatory,template:parse(row.template_json),...state}}
export function listProcessRuns(storeId,businessDate=todayISO()){return db.prepare(`SELECT r.*,a.blocking_level,a.mandatory,t.code template_code,t.name template_name,t.template_json,t.trigger_code FROM process_runs r JOIN process_assignments a ON a.id=r.assignment_id JOIN process_templates t ON t.id=r.template_id WHERE r.store_id=? AND r.business_date=? ORDER BY t.name`).all(storeId,businessDate).map(hydrateRun)}
export function processRun(id){return hydrateRun(runRow(id))}

function refreshRunStatus(runId){const run=processRun(runId);if(!run)return null;const next=run.evaluation.blockers.length?'IN_PROGRESS':'READY_TO_COMPLETE';if(run.status!=='COMPLETED'&&run.status!==next)db.prepare(`UPDATE process_runs SET status=? WHERE id=?`).run(next,runId);return processRun(runId)}
export function completeProcessStep({runId,stepCode,user,value=null,evidenceRef=null,evidenceKind='REFERENCE',evidenceNote=''}){
 const run=processRun(runId);if(!run)throw Object.assign(new Error('Process du jour introuvable.'),{status:404});const step=run.template.steps.find(s=>s.code===stepCode);if(!step)throw Object.assign(new Error('Étape process introuvable.'),{status:404});
 let evidenceCount=db.prepare(`SELECT evidence_count n FROM process_step_runs WHERE run_id=? AND step_code=?`).get(runId,stepCode)?.n||0;
 if(evidenceRef){db.prepare(`INSERT INTO process_run_evidence(id,run_id,step_code,kind,reference,note,created_by) VALUES(?,?,?,?,?,?,?)`).run(uid('pevd'),runId,stepCode,clean(evidenceKind)||'REFERENCE',clean(evidenceRef),clean(evidenceNote)||null,user?.id||null);evidenceCount++}
 if(step.evidenceRequired&&evidenceCount<1)throw Object.assign(new Error('Une preuve est obligatoire pour valider cette étape.'),{status:409,code:'PROCESS_EVIDENCE_REQUIRED'});
 db.prepare(`UPDATE process_step_runs SET status='COMPLETED',value_json=?,evidence_count=?,completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE run_id=? AND step_code=?`).run(value===null?null:JSON.stringify(value),evidenceCount,user?.id||null,runId,stepCode);
 audit({storeId:run.store_id,businessDate:run.business_date,userId:user?.id||null,action:'CUSTOM_PROCESS_STEP_COMPLETED',entityType:'PROCESS_RUN',entityId:runId,details:{stepCode,evidenceCount}});return refreshRunStatus(runId)
}
export function setProcessGate({runId,gateCode,user,ok,detail=''}){const run=processRun(runId);if(!run)throw Object.assign(new Error('Process du jour introuvable.'),{status:404});if(!run.template.gates.some(g=>g.code===gateCode))throw Object.assign(new Error('Gate process introuvable.'),{status:404});db.prepare(`INSERT INTO process_gate_states(run_id,gate_code,ok,detail,updated_by,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(run_id,gate_code) DO UPDATE SET ok=excluded.ok,detail=excluded.detail,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).run(runId,gateCode,ok?1:0,clean(detail)||null,user?.id||null);audit({storeId:run.store_id,businessDate:run.business_date,userId:user?.id||null,action:'CUSTOM_PROCESS_GATE_UPDATED',entityType:'PROCESS_RUN',entityId:runId,details:{gateCode,ok:!!ok,detail:clean(detail)||null}});return refreshRunStatus(runId)}
export function completeProcessRun({runId,user}){const run=refreshRunStatus(runId);if(!run)throw Object.assign(new Error('Process du jour introuvable.'),{status:404});if(run.evaluation.blockers.length)throw Object.assign(new Error('Le process contient encore des obligations non terminées.'),{status:409,code:'PROCESS_BLOCKED',details:{blockers:run.evaluation.blockers}});db.prepare(`UPDATE process_runs SET status='COMPLETED',completed_by=?,completed_at=CURRENT_TIMESTAMP WHERE id=?`).run(user?.id||null,runId);audit({storeId:run.store_id,businessDate:run.business_date,userId:user?.id||null,action:'CUSTOM_PROCESS_COMPLETED',entityType:'PROCESS_RUN',entityId:runId,details:{templateCode:run.template_code}});return processRun(runId)}

export function customProcessBlockers(storeId,businessDate,blockingLevel){const level=clean(blockingLevel).toUpperCase(),runs=ensureProcessRuns(storeId,businessDate).filter(r=>r.mandatory&&r.blocking_level===level&&r.status!=='COMPLETED');return runs.map(r=>({runId:r.id,templateCode:r.template_code,name:r.template_name,status:r.status,progress:r.evaluation.progress,blockers:r.evaluation.blockers}))}

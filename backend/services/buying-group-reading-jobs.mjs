import {createHash,randomBytes} from 'node:crypto';

// Browser -> authenticated H&S API -> queued DB job -> signed background worker.
// No PDF bytes, browser tokens, or third-party URLs are exposed to the browser.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=x=>createHash('sha256').update(x).digest('hex');
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}});
const failure=(message,status=400,code='INVALID_REQUEST')=>json({error:message,code},status);
const jobsPath='/api/buying-group/reading-jobs';
const backgroundPath='/.netlify/functions/hs-contract-reader-background';
const sanitize=e=>String(e??'Lecture indisponible.').replace(/[\x00-\x1f]/g,' ').slice(0,340);
const validOrigin=url=>{
 const x=new URL(url),host=x.hostname.toLowerCase();
 if(host==='storeops.ma'||host==='franprix-storeops.netlify.app'||host.endsWith('--franprix-storeops.netlify.app')||
    (['localhost','127.0.0.1'].includes(host)&&process.env.NETLIFY_DEV==='true'))return x.origin;
 throw Error('Origine serveur non autorisée pour le traitement privé.');
};
async function markStale(db){
 await db.pool.query("UPDATE hs_buying.contract_read_jobs SET status='FAILED',error_code='WORKER_EXPIRED',error_message='La lecture a expiré. Vous pouvez la relancer.',updated_at=now(),completed_at=now() WHERE status IN ('QUEUED','RUNNING') AND updated_at < now()-interval '18 minutes'");
}
async function preflight(db,type,id,body){
 if(type==='INTAKE'){
  const r=await db.pool.query('SELECT id,status,content_type,sha256 FROM hs_buying.contract_intakes WHERE id=$1',[id]);
  if(!r.rows.length)return{error:'Document importé introuvable.',status:404};
  const file=r.rows[0];
  if(file.status==='REGISTERED')return{error:'Document déjà classé dans un contrat. Relisez son dossier.',status:409};
  if(file.content_type!=='application/pdf')return{error:'La lecture IA nécessite un PDF.',status:422};
  if(file.status==='ANALYZED'&&body.reanalyze!==true)return{error:'Une lecture existe déjà. Confirmez une relecture approfondie.',status:409};
  return{sha:file.sha256,contractId:null,targetId:id};
 }
 if(!UUID.test(String(body.documentId||'')))return{error:'Document PDF à analyser non sélectionné.',status:422};
 const r=await db.pool.query(
  "SELECT d.id,d.sha256,d.content_type,c.status AS contract_status, COALESCE(w.stage,'DRAFT') AS workflow_stage "+
  "FROM hs_buying.contract_documents d JOIN hs_buying.contracts c ON c.id=d.contract_id "+
  "LEFT JOIN hs_buying.contract_workflows w ON w.contract_id=c.id WHERE d.id=$1 AND d.contract_id=$2",
  [body.documentId,id]);
 if(!r.rows.length)return{error:'Document du contrat introuvable.',status:404};
 const f=r.rows[0];
 if(f.content_type!=='application/pdf')return{error:'La lecture IA nécessite un PDF.',status:422};
 if(f.contract_status!=='DRAFT'||['PENDING_APPROVAL','APPROVED','ACTIVE'].includes(f.workflow_stage))
   return{error:'Le dossier est soumis ou approuvé et ne peut plus être relu automatiquement.',status:409};
 const already=await db.pool.query('SELECT id FROM hs_buying.contract_analyses WHERE document_id=$1 AND source_sha256=$2 LIMIT 1',[body.documentId,f.sha256]);
 if(already.rows.length&&body.reanalyze!==true)return{error:'Une lecture existe déjà. Confirmez la relecture de ce PDF.',status:409};
 return{sha:f.sha256,contractId:id,targetId:body.documentId};
}
async function dispatchBackground(req,payload){
 const url=validOrigin(req.url)+backgroundPath;
 const controller=new AbortController(),stop=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(payload),signal:controller.signal,cache:'no-store',redirect:'error'});
  return response.status===202;
 }finally{clearTimeout(stop)}
}
export async function startReadJob(req,db,user,type,id,{dispatch=dispatchBackground}={}){
 if(req.method!=='POST'||!UUID.test(id))return failure('Requête de lecture invalide.',400);
 const body=await req.json().catch(()=>null);
 if(!body||body.consent!==true)return failure('Accord explicite requis avant transmission au prestataire IA.',422,'AI_CONSENT_REQUIRED');
 const {workflowValidation}=await import('./buying-group-contract-workflow.mjs');
 if(!workflowValidation.configAI().enabled)return failure('Lecture IA indisponible sur le serveur. La revue manuelle reste possible.',503,'AI_NOT_CONFIGURED');
 await markStale(db);
 const check=await preflight(db,type,id,body);
 if(check.error)return failure(check.error,check.status);
 const active=await db.pool.query("SELECT id,requested_by,status FROM hs_buying.contract_read_jobs WHERE target_type=$1 AND target_id=$2 AND status IN ('QUEUED','RUNNING') LIMIT 1",[type,check.targetId]);
 if(active.rows.length){
  const row=active.rows[0];
  return row.requested_by===user.id?json({jobId:row.id,status:row.status,resumed:true},202):
    failure('Une lecture du document est déjà en cours.',409,'READ_JOB_BUSY');
 }
 const token=randomBytes(32).toString('hex');
 let job;
 try{
  const res=await db.pool.query("INSERT INTO hs_buying.contract_read_jobs "+
    "(target_type,target_id,contract_id,source_sha256,token_hash,requested_by,consent_at,reanalyze) "+
    "VALUES($1,$2,$3,$4,$5,$6,now(),$7) RETURNING id,status,requested_at",
    [type,check.targetId,check.contractId,check.sha,sha(token),user.id,body.reanalyze===true]);
  job=res.rows[0];
 }catch(e){
  if(e?.code==='23505')return failure('Une lecture vient de démarrer. Actualisez le suivi.',409,'READ_JOB_BUSY');
  throw e;
 }
 try{
  if(!await dispatch(req,{jobId:job.id,token}))throw Error('Le service différé a refusé le travail.');
 }catch(e){
  await db.pool.query("UPDATE hs_buying.contract_read_jobs SET status='FAILED',error_code='DISPATCH_FAILED',error_message='Impossible de démarrer la lecture. Réessayez.',completed_at=now(),updated_at=now() WHERE id=$1 AND status='QUEUED'",[job.id]);
  console.error('Contract background dispatch failed',e);
  return failure('La lecture n’a pas démarré. Vous pouvez réessayer depuis la Centrale.',503,'DISPATCH_FAILED');
 }
 return json({jobId:job.id,status:'QUEUED',async:true,
  message:'Lecture lancée sur le serveur. Les résultats apparaîtront dans la Centrale.'},202);
}
function publicJob(x){
 return{id:x.id,status:x.status,targetType:x.target_type,targetId:x.target_id,
  createdAt:x.requested_at,startedAt:x.started_at,completedAt:x.completed_at,errorCode:x.error_code||null,
  error:x.status==='FAILED'?x.error_message||'La lecture a échoué. Réessayez.':null};
}
export async function serveReadJobStatus(req,db,user){
 if(req.method!=='GET')return failure('Méthode non autorisée.',405);
 await markStale(db);
 const u=new URL(req.url);
 let rows;
 if(u.pathname===jobsPath+'/latest'){
  const type=u.searchParams.get('targetType'),targetId=u.searchParams.get('targetId');
  if(!['INTAKE','DOCUMENT'].includes(type)||!UUID.test(targetId||''))return failure('Cible de lecture invalide.',422);
  rows=await db.pool.query("SELECT id,status,target_type,target_id,requested_at,started_at,completed_at,error_code,error_message "+
    "FROM hs_buying.contract_read_jobs WHERE requested_by=$1 AND target_type=$2 AND target_id=$3 "+
    "ORDER BY requested_at DESC LIMIT 1",[user.id,type,targetId]);
 }else{
  const id=u.pathname.slice((jobsPath+'/').length);
  if(!UUID.test(id))return failure('Identifiant de lecture invalide.',422);
  rows=await db.pool.query("SELECT id,status,target_type,target_id,requested_at,started_at,completed_at,error_code,error_message "+
    "FROM hs_buying.contract_read_jobs WHERE id=$1 AND requested_by=$2",[id,user.id]);
 }
 return json({job:rows.rows.length?publicJob(rows.rows[0]):null});
}
export async function runReadJob(db,{jobId,token}){
 if(!UUID.test(jobId||'')||!/^[a-f0-9]{64}$/i.test(token||''))return{code:'BAD_JOB_TOKEN'};
 const res=await db.pool.query("UPDATE hs_buying.contract_read_jobs "+
   "SET status='RUNNING',started_at=now(),updated_at=now() "+
   "WHERE id=$1 AND token_hash=$2 AND status='QUEUED' "+
   "RETURNING id,target_type,target_id,contract_id,source_sha256,requested_by,reanalyze",
   [jobId,sha(token)]);
 if(!res.rows.length)return{code:'NOT_CLAIMABLE'};
 const job=res.rows[0],user={id:job.requested_by};
 try{
  let response;
  if(job.target_type==='INTAKE'){
   const {serveContractIntakes}=await import('./buying-group-contract-intake.mjs');
   response=await serveContractIntakes(new Request('https://storeops.ma/api/buying-group/intakes/'+job.target_id+'/analyze',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({consent:true,reanalyze:job.reanalyze})
   }),db,user);
  }else{
   const {serveContractWorkflow}=await import('./buying-group-contract-workflow.mjs');
   response=await serveContractWorkflow(new Request('https://storeops.ma/api/buying-group/contracts/'+job.contract_id+'/analyze',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({consent:true,reanalyze:job.reanalyze,documentId:job.target_id})
   }),db,user);
  }
  if(!response.ok){
   const result=await response.json().catch(()=>({}));
   throw Object.assign(Error(sanitize(result.error||'Lecture IA échouée.')),{code:result.code||'MODEL_ERROR'});
  }
  await db.pool.query("UPDATE hs_buying.contract_read_jobs "+
    "SET status='DONE',completed_at=now(),updated_at=now(),token_hash=repeat('0',64) "+
    "WHERE id=$1 AND status='RUNNING'",[job.id]);
  return{code:'DONE'};
 }catch(e){
  console.error('Contract background job failed',{jobId,code:e?.code||'READ_JOB_FAILED',error:sanitize(e?.message)});
  await db.pool.query("UPDATE hs_buying.contract_read_jobs "+
    "SET status='FAILED',completed_at=now(),updated_at=now(),error_code=$2,error_message=$3,token_hash=repeat('0',64) "+
    "WHERE id=$1 AND status='RUNNING'",
   [job.id,sanitize(e?.code||'READ_JOB_FAILED').slice(0,50),sanitize(e?.message)]);
  return{code:'FAILED'};
 }
}

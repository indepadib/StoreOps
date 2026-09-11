import { canAccessStore,canManageStore } from './permissions.mjs';
import { listProcessTemplates,saveProcessTemplate,setProcessTemplateActive,listProcessAssignments,saveProcessAssignment,ensureProcessRuns,processRun,completeProcessStep,setProcessGate,completeProcessRun } from './process-studio.mjs';
import { todayISO } from '../db.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>4e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',reject)})}
function director(user){if(user.role!=='ops_director')throw Object.assign(new Error('Configuration réservée à la Direction / Administrateur.'),{status:403})}
function store(user,storeId){if(!canAccessStore(user,storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403})}
function manage(user,storeId){if(!canManageStore(user,storeId))throw Object.assign(new Error('Réservé au Responsable magasin ou à la Direction.'),{status:403})}
function runAccess(user,id,{write=false}={}){const run=processRun(id);if(!run)throw Object.assign(new Error('Process du jour introuvable.'),{status:404});store(user,run.store_id);if(write)manage(user,run.store_id);return run}

export async function handleProcessStudioApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/admin/process-templates'){
  director(user);
  if(req.method==='GET')return{status:200,data:{items:listProcessTemplates({includeInactive:url.searchParams.get('all')==='1'})}};
  if(req.method==='POST'){const b=await body(req);return{status:201,data:saveProcessTemplate({user,input:b})}}
 }
 p=route(path,'/api/admin/process-templates/:templateId');if(p){director(user);if(req.method==='PUT'||req.method==='PATCH'){const b=await body(req);return{status:200,data:saveProcessTemplate({user,id:p.templateId,input:b})}}}
 p=route(path,'/api/admin/process-templates/:templateId/active');if(p&&req.method==='POST'){director(user);const b=await body(req);return{status:200,data:setProcessTemplateActive({id:p.templateId,user,active:b.active!==false})}}
 if(path==='/api/admin/process-assignments'){
  director(user);
  if(req.method==='GET')return{status:200,data:{items:listProcessAssignments({storeId:url.searchParams.get('storeId')||null,includeInactive:url.searchParams.get('all')==='1'})}};
  if(req.method==='POST'){const b=await body(req);return{status:201,data:saveProcessAssignment({user,templateId:b.templateId,storeId:b.storeId||null,mandatory:b.mandatory!==false,blockingLevel:b.blockingLevel,effectiveFrom:b.effectiveFrom,effectiveTo:b.effectiveTo,active:b.active!==false})}}
 }
 p=route(path,'/api/admin/process-assignments/:assignmentId');if(p&&(req.method==='PUT'||req.method==='PATCH')){director(user);const b=await body(req);return{status:200,data:saveProcessAssignment({user,id:p.assignmentId,templateId:b.templateId,storeId:b.storeId||null,mandatory:b.mandatory!==false,blockingLevel:b.blockingLevel,effectiveFrom:b.effectiveFrom,effectiveTo:b.effectiveTo,active:b.active!==false})}}
 p=route(path,'/api/stores/:storeId/process-runs');if(p&&req.method==='GET'){store(user,p.storeId);return{status:200,data:{storeId:p.storeId,businessDate:url.searchParams.get('date')||todayISO(),items:ensureProcessRuns(p.storeId,url.searchParams.get('date')||todayISO())}}}
 p=route(path,'/api/process-runs/:runId');if(p&&req.method==='GET'){return{status:200,data:runAccess(user,p.runId)}}
 p=route(path,'/api/process-runs/:runId/steps/:stepCode/complete');if(p&&req.method==='POST'){runAccess(user,p.runId,{write:true});const b=await body(req);return{status:200,data:completeProcessStep({runId:p.runId,stepCode:p.stepCode,user,value:b.value??null,evidenceRef:b.evidenceRef||null,evidenceKind:b.evidenceKind||'REFERENCE',evidenceNote:b.evidenceNote||''})}}
 p=route(path,'/api/process-runs/:runId/gates/:gateCode');if(p&&req.method==='POST'){runAccess(user,p.runId,{write:true});const b=await body(req);return{status:200,data:setProcessGate({runId:p.runId,gateCode:p.gateCode,user,ok:b.ok===true,detail:b.detail||''})}}
 p=route(path,'/api/process-runs/:runId/complete');if(p&&req.method==='POST'){runAccess(user,p.runId,{write:true});return{status:200,data:completeProcessRun({runId:p.runId,user})}}
 return null
}

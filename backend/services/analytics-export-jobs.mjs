import { randomUUID } from 'node:crypto';
import { db } from '../db.mjs';
import { canAccessStore } from './permissions.mjs';
import { analyticsCacheKey, readAnalyticsCache, writeAnalyticsCache } from './analytics-persistent-cache.mjs';

// Long monthly exports must not run inside the ~30-second public API request.
// Only authenticated callers may create/read a job; the background worker gets
// an unguessable job id and reads the validated, persisted job specification.
export const exportJobKey=id=>analyticsCacheKey('monthly-export-job-v1',[id]);
export const exportPageKey=(id,index)=>analyticsCacheKey('monthly-export-job-page-v1',[id,index]);
const pendingKey=(userId,fingerprint)=>analyticsCacheKey('monthly-export-active-v1',[userId,fingerprint]);
const clean=v=>String(v??'').trim();
const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(clean(v))&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))?clean(v):null;
const daysBetween=(a,b)=>a&&b&&b>=a?Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)+1:0;
const error=(status,message,code)=>({status,data:{error:message,code}});
async function readBody(req){
 return new Promise((resolve,reject)=>{
  let value='';req.on('data',chunk=>{value+=chunk;if(value.length>20000)reject(new Error('Requête trop volumineuse'))});
  req.on('end',()=>{try{resolve(value?JSON.parse(value):{})}catch{reject(new Error('Paramètres JSON invalides'))}});
  req.on('error',reject)
 })
}
export async function handleAnalyticsExportJobApi({req,url,user}){
 const base='/api/analytics/monthly-export/jobs';
 const pathname=url.pathname;
 if(pathname!==base&&!pathname.startsWith(base+'/'))return null;
 const parts=pathname.slice(base.length).split('/').filter(Boolean);
 if(req.method==='POST'&&parts.length===0){
  let body;try{body=await readBody(req)}catch{return error(400,'Paramètres d’export invalides.','INVALID_EXPORT_PAYLOAD')}
  const startDate=iso(body.start),endDate=iso(body.end),compareStartDate=iso(body.compareStart),compareEndDate=iso(body.compareEnd);
  if(!startDate||!endDate||!compareStartDate||!compareEndDate||daysBetween(startDate,endDate)>31||daysBetween(startDate,endDate)<1||daysBetween(compareStartDate,compareEndDate)>31||daysBetween(compareStartDate,compareEndDate)<1)
   return error(400,'Les deux périodes doivent chacune contenir entre 1 et 31 jours.','INVALID_EXPORT_DATES');
  const storeIds=[...new Set((Array.isArray(body.storeIds)?body.storeIds:[]).map(clean).filter(Boolean))];
  const allowed=db.prepare('SELECT id,name,code FROM stores WHERE active=1 ORDER BY name').all().filter(s=>canAccessStore(user,s.id));
  const stores=allowed.filter(s=>storeIds.includes(s.id));
  if(!stores.length||stores.length!==storeIds.length)return error(403,'Un ou plusieurs magasins sont inconnus ou interdits.','EXPORT_STORE_FORBIDDEN');
  const scope=['all','stores','network'].includes(clean(body.scope))?clean(body.scope):'all';
  const comparisonMode=['previous_period','previous_month','previous_year','custom'].includes(clean(body.comparisonMode))?clean(body.comparisonMode):'custom';
  const input={startDate,endDate,compareStartDate,compareEndDate,comparisonMode,scope,stores};
  const fingerprint=JSON.stringify([storeIds.sort(),startDate,endDate,compareStartDate,compareEndDate,comparisonMode,scope]);
  const reuseKey=pendingKey(user.id,fingerprint);
  const existing=await readAnalyticsCache(reuseKey);
  if(existing?.jobId){
   const prior=await readAnalyticsCache(exportJobKey(existing.jobId));
   if(prior&&prior.userId===user.id&&['QUEUED','RUNNING','READY'].includes(prior.status))return{status:202,data:{jobId:prior.id,status:prior.status,reused:true}};
  }
  const id=randomUUID(),job={id,userId:user.id,status:'QUEUED',input,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),progress:{phase:'QUEUED',completed:0,total:stores.length},pages:0};
  if(!await writeAnalyticsCache(exportJobKey(id),'monthly-export-job-v1',job,21600))return error(503,'Impossible de préparer le stockage sécurisé de l’export.','EXPORT_STORAGE_UNAVAILABLE');
  await writeAnalyticsCache(reuseKey,'monthly-export-active-v1',{jobId:id},21600);
  const origin=clean(process.env.DEPLOY_PRIME_URL||process.env.URL||'https://storeops.ma').replace(/\/$/,'');
  try{
   const response=await fetch(origin+'/.netlify/functions/analytics-export-background',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId:id}),signal:AbortSignal.timeout(10000)
   });
   if(!response.ok){throw new Error('HTTP '+response.status)}
  }catch(cause){
   const failed={...job,status:'FAILED',code:'EXPORT_WORKER_UNAVAILABLE',message:'Service de préparation de l’export indisponible.',updatedAt:new Date().toISOString()};
   await writeAnalyticsCache(exportJobKey(id),'monthly-export-job-v1',failed,21600);
   console.error('Failed to start Analytics background export',cause);
   return error(503,'Le service d’export différé ne répond pas. Réessayer.','EXPORT_WORKER_UNAVAILABLE')
  }
  return{status:202,data:{jobId:id,status:'QUEUED',message:'Préparation de l’export en tâche serveur.'}}
 }
 if(req.method==='GET'&&parts.length>=1&&/^[0-9a-f-]{36}$/i.test(parts[0])){
  const id=parts[0],job=await readAnalyticsCache(exportJobKey(id));
  if(!job||job.userId!==user.id)return error(404,'Export introuvable ou expiré.','EXPORT_JOB_NOT_FOUND');
  if(parts.length===1){
   const {input,...publicJob}=job;
   return{status:200,data:publicJob}
  }
  if(parts.length===3&&parts[1]==='pages'&&/^\d+$/.test(parts[2])){
   if(job.status!=='READY')return error(409,'Export pas encore disponible.','EXPORT_NOT_READY');
   const index=Number(parts[2]);
   if(!Number.isSafeInteger(index)||index<0||index>=Number(job.pages||0))return error(404,'Page d’export inexistante.','EXPORT_PAGE_NOT_FOUND');
   const rows=await readAnalyticsCache(exportPageKey(id,index));
   if(!Array.isArray(rows))return error(503,'Une page d’export a expiré. Relancer l’export.','EXPORT_PAGE_EXPIRED');
   return{status:200,data:{jobId:id,index,rows}}
  }
 }
 return error(405,'Méthode ou ressource d’export inconnue.','EXPORT_METHOD_NOT_ALLOWED')
}

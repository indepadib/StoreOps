import type { Config } from '@netlify/functions';
import { prepareAnalyticsRuntime } from './api.mts';
import { analyticsCacheKey, readAnalyticsCacheFresh, writeAnalyticsCache } from '../../backend/services/analytics-persistent-cache.mjs';
const exportJobKey=(id:string)=>analyticsCacheKey('monthly-export-job-v1',[id]);
const exportPageKey=(id:string,index:number)=>analyticsCacheKey('monthly-export-job-page-v1',[id,index]);

type ExportJob={id:string,status:string,userId:string,input:any,createdAt:string,updatedAt:string,progress:any,pages:number,[key:string]:any};
const expirySeconds=21600;
const startedAt=Date.now();
const validId=(id:any)=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id);
export default async function processExport(request:Request){
 if(request.method!=='POST')return;
 let jobId:string;
 try{const payload=await request.json();jobId=payload?.jobId}catch{return}
 if(!validId(jobId))return;
 const key=exportJobKey(jobId);
 let job=await readAnalyticsCacheFresh(key,{strict:true}) as ExportJob|null;
 if(!job||!['QUEUED','RUNNING'].includes(job.status)||!Array.isArray(job.input?.stores)||!job.userId)return;
 const update=async(patch:Record<string,unknown>)=>{
  const previous=job?.progress?.phase||null;
  job={...job!,...patch,updatedAt:new Date().toISOString()};
  const phase=(patch.progress as any)?.phase;
  if(phase&&phase!==previous)console.info('Analytics export phase',job!.id,phase,'elapsed_s',Math.round((Date.now()-startedAt)/1000));
  if(!await writeAnalyticsCache(key,'monthly-export-job-v1',job,expirySeconds))throw new Error('Unable to persist export progress');
 };
 try{
  await update({status:'RUNNING',progress:{phase:'INITIALIZING',completed:0,total:job.input.stores.length}});
  await prepareAnalyticsRuntime();
  // Import backend services only after Netlify has restored the StoreOps DB/env.
  const {readMonthlySalesExport}=await import('../../backend/services/analytics-monthly-export.mjs');
  const input=job.input;
  const data=await readMonthlySalesExport(input.stores,{
   startDate:input.startDate,endDate:input.endDate,compareStartDate:input.compareStartDate,
   compareEndDate:input.compareEndDate,comparisonMode:input.comparisonMode,scope:input.scope,force:false,
   onProgress:async(progress:any)=>update({progress})
  });
  const columns=data.columns||[],rows=data.rows||[],pageSize=250;
  await update({progress:{phase:'SAVING',completed:0,total:Math.max(1,Math.ceil(rows.length/pageSize))}});
  for(let i=0;i<rows.length;i+=pageSize){
   const page=rows.slice(i,i+pageSize).map((row:any)=>columns.map((col:any)=>row[col.key]??null));
   if(!await writeAnalyticsCache(exportPageKey(jobId,Math.floor(i/pageSize)),'monthly-export-job-page-v1',page,expirySeconds))
    throw new Error('Could not save export page');
   await update({progress:{phase:'SAVING',completed:Math.floor(i/pageSize)+1,total:Math.ceil(rows.length/pageSize)}});
  }
  await update({status:'READY',pages:Math.ceil(rows.length/pageSize),columns,summary:data.summary,diagnostics:data.diagnostics,dataStatus:data.status,progress:{phase:'READY',completed:rows.length,total:rows.length},rowCount:rows.length,comparison:data.comparison,period:data.period,stores:data.stores});
  console.info('Analytics export completed',jobId,'rows',rows.length,'pages',Math.ceil(rows.length/pageSize),'elapsed_s',Math.round((Date.now()-startedAt)/1000));
 }catch(error:any){
  console.error('Analytics monthly export background failure',jobId,error);
  try{await update({status:'FAILED',code:error?.code||'EXPORT_PROCESSING_FAILED',message:'La préparation a échoué. Les données n’ont pas été présentées comme complètes.',progress:{phase:'FAILED',completed:0,total:0}})}catch(failure){console.error('Unable to persist export failure',failure)}
 }
}
export const config:Config={background:true};

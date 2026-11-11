import type {Config} from '@netlify/functions';
import {prepareAnalyticsRuntime} from './api.mts';
import {analyticsCacheKey,compareAnalyticsCache,readAnalyticsCacheFresh,writeAnalyticsCache} from '../../backend/services/analytics-persistent-cache.mjs';

export default async function runReplenishment(request:Request){
 if(request.method!=='POST')return;
 const body=await request.json().catch(()=>null),id=body?.jobId;
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))return;
 const key=analyticsCacheKey('replenishment-job-v1',[id]);
 let job=await readAnalyticsCacheFresh(key,{strict:true});
 if(job?.status!=='QUEUED'||job.id!==id||!job.userId||Date.now()-Date.parse(job.updatedAt)>600000)return;
 const claimed={...job,status:'RUNNING',updatedAt:new Date().toISOString(),revision:job.revision+1};
 if(!await compareAnalyticsCache(key,claimed,job.revision))return;
 job=claimed;
 async function update(patch:Record<string,unknown>){
  job={...job,...patch,updatedAt:new Date().toISOString()};
  if(!await writeAnalyticsCache(key,'replenishment-job-v1',job,3600))throw new Error('Progression indisponible.');
 }
 try{
  await prepareAnalyticsRuntime();
  const {generateReplenishmentOrder}=await import('../../backend/services/analytics-replenishment-orders.mjs');
  const {rows,blocked,...summary}=await generateReplenishmentOrder(job.input,{progress:async(label:string,completed:number,total:number)=>{await update({progress:{label,completed,total}});}});
  const output=[...rows.map(row=>({...row,status:'PROPOSED'})),...blocked.map(row=>({...row,status:'BLOCKED'}))];
  const pageSize=250,pages=Math.ceil(output.length/pageSize);
  for(let index=0;index<pages;index++){
   const pageKey=analyticsCacheKey('replenishment-page-v1',[id,index]);
   if(!await writeAnalyticsCache(pageKey,'replenishment-page-v1',output.slice(index*pageSize,(index+1)*pageSize),3600))throw new Error('Résultat indisponible.');
  }
  await update({status:'READY',pages,summary:{...summary,proposed:rows.length,blocked:blocked.length}});
 }catch(error:any){
  console.error('Replenishment generation failed',id,error);
  await update({status:'FAILED',message:error?.code==='REPLENISHMENT_INCOMPLETE'?error.message:'La lecture Dynamics a échoué. Relance la génération.'});
 }
}

export const config:Config={background:true};

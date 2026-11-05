import {getDatabase} from '@netlify/database';
import type {Config} from '@netlify/functions';
import {runReadJob} from '../../backend/services/buying-group-reading-jobs.mjs';

// The function URL is deliberately not exposed in the client application.
// An unguessable per-job token is needed even to claim a queued job.
// Netlify acknowledges this call with HTTP 202 and executes for up to 15 min.
export default async function backgroundContractReader(request:Request){
  if(request.method!=='POST')return;
  const payload=await request.json().catch(()=>null);
  if(!payload||typeof payload.jobId!=='string'||typeof payload.token!=='string')return;
  const db=getDatabase();
  try{
    const result=await runReadJob(db,{jobId:payload.jobId,token:payload.token});
    if(result.code==='FAILED')console.error('H&S contract analysis background task failed',payload.jobId);
  }catch(error){
    // A crash before the DB status update can be recovered by the stale-job guard.
    console.error('H&S contract analysis worker unexpected exception',error);
    throw error;
  }
}
export const config:Config={background:true};

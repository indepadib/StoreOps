import {periodPlan} from './period-loader.js';
import {mergeAssortmentSales} from './assortment-opportunities-model.js';
export async function readAssortmentPeriod({start,end,storeIds,read,signal,onProgress=()=>{}}){
 const plan=periodPlan({start,end},{start,end},2),jobs=[...new Set(storeIds)].flatMap(storeId=>plan.map(slice=>({storeId,...slice.current}))),parts=new Map(storeIds.map(id=>[id,[]]));
 let cursor=0,done=0,stopped=false,failure;
 const worker=async()=>{try{while(!stopped){signal?.throwIfAborted();const job=jobs[cursor++];if(!job)return;const result=await read(job,signal);signal?.throwIfAborted();if(result.storeId!==job.storeId||result.startDate!==job.start||result.endDate!==job.end)throw Error('Réponse de ventes hors périmètre.');parts.get(job.storeId).push(result);onProgress({done:++done,total:jobs.length})}}catch(error){stopped=true;failure??=error}};
 await Promise.all(Array.from({length:Math.min(2,jobs.length)},worker));if(failure)throw failure;signal?.throwIfAborted();
 return new Map([...parts].map(([id,list])=>{const merged=mergeAssortmentSales(list);if(merged.startDate!==start||merged.endDate!==end)throw Error('La période de ventes n’est pas complète.');return[id,merged]}));
}

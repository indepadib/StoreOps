import {analyticsCacheKey} from './analytics-persistent-cache.mjs';
export const taskFailed=(input,kind,storeId='')=>(input.preparationFailures||[]).some(x=>x.kind===kind&&(!storeId||x.storeId===storeId));
const shift=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
export function salesPreparation(stores,input){
 const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)+1,a=days(input.start,input.end),b=days(input.compareStart,input.compareEnd),blocks=Math.min(Math.ceil(Math.max(a,b)/2),a,b),split=(start,n)=>Array.from({length:blocks},(_,i)=>({start:shift(start,Math.floor(i*n/blocks)),end:shift(start,Math.floor((i+1)*n/blocks)-1)})),cur=split(input.start,a),prev=split(input.compareStart,b);
 const tasks=stores.flatMap(s=>cur.map((c,i)=>({kind:'sales',storeId:s.id,start:c.start,end:c.end,compareStart:prev[i].start,compareEnd:prev[i].end}))),slices=tasks.map(t=>({storeIds:[t.storeId],period:{startDate:t.start,endDate:t.end},comparison:{startDate:t.compareStart,endDate:t.compareEnd}}));return{tasks,preparedInput:{start:input.start,end:input.end,compareStart:input.compareStart,compareEnd:input.compareEnd,slices}};
}
export function preparationResponse(tasks,input,extra={}){return{engine:'QUERY_NEEDS_DATA',status:'ASSISTANT_PREPARATION_REQUIRED',answer:'Je prépare automatiquement les données utiles à votre question.',providerDataSent:false,tasks,preparedInput:{start:input.start,end:input.end,compareStart:input.compareStart,compareEnd:input.compareEnd,...extra},sources:[]};}
export async function missingDiagnosticSources(stores,input,{read,catalogReader,historyReader,includeBaskets=true,includeHistory=true}){
 const catalog=await catalogReader(stores,{read}),tasks=[],seen=new Set();
 for(const s of stores){const u=await read(analyticsCacheKey('detention-universe-v3',[s.id]));if((!u?.stockComplete||!u?.supplyComplete||!u?.referenceComplete||!catalog.complete)&&!taskFailed(input,'stock',s.id))tasks.push({kind:'stock',storeId:s.id});
  for(const kind of includeHistory?['store','supply']:[]){const h=await historyReader(s.id,kind),key=kind+'|'+(h?.warehouseId||s.id);if(seen.has(key))continue;seen.add(key);if(!h?.complete&&!taskFailed(input,'history',s.id))tasks.push({kind:'history',storeId:s.id,historyKind:kind});}
 }
 const key=analyticsCacheKey('customer-bi-v4',[stores.map(s=>s.id).sort().join(','),input.start,input.end,input.compareStart,input.compareEnd]);if(includeBaskets&&!await read(key)&&!taskFailed(input,'baskets'))tasks.push({kind:'baskets',storeIds:stores.map(s=>s.id),start:input.start,end:input.end,compareStart:input.compareStart,compareEnd:input.compareEnd});return tasks;
}

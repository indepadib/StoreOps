import {createHash} from 'node:crypto';
import {config} from '../config.mjs';
import {odataGet} from './dynamics.mjs';
import {readAnalyticsCacheFresh,compareAnalyticsCache} from './analytics-persistent-cache.mjs';

export function createPagedStockReader({readPage,readState,compareState,clock=Date.now,pageSize=2000,maxRows=100000,freshMs=60000}={}){
 const inflight=new Map();
 return function read(key,query,{force=false}={}){
  if(inflight.has(key))return inflight.get(key);
  const task=(async()=>{
   const now=clock(),previous=await readState(key),revision=previous?.revision??null;
   if(previous?.status==='READY'&&now-previous.checkedAt<(force?30000:freshMs))return{status:'READY',complete:true,value:previous.rows,rowCount:previous.rows.length,pages:previous.pages,checkedAt:new Date(previous.checkedAt).toISOString(),cache:{status:'SHARED_HIT'}};
   const pending=s=>({status:s.status==='FAILED'?'UNAVAILABLE':'PREPARING',complete:false,value:[],rowCount:s.offset||0,pages:s.pages||0,progress:{rowsRead:s.offset||0,startedAt:new Date(s.startedAt).toISOString(),retryAfterMs:Math.max(0,(s.retryAt||0)-clock())},error:s.error||null});
   if(previous?.retryAt>now)return pending(previous);
   const state=previous&&previous.status==='READING'?structuredClone(previous):{status:'READING',rows:[],offset:0,pages:0,startedAt:now,failures:0};
   try{
    const top=Math.min(pageSize,maxRows-state.offset),payload=await readPage({...query,top,offset:state.offset});
    if(!Array.isArray(payload?.value))throw Object.assign(new Error('Réponse stock invalide.'),{code:'D365_STOCK_INVALID_PAGE'});
    const rows=payload.value;if(!rows.length&&payload['@odata.nextLink'])throw Object.assign(new Error('Pagination stock incohérente.'),{code:'D365_STOCK_INVALID_PAGE'});state.rows.push(...rows);state.offset+=rows.length;state.pages++;state.failures=0;state.retryAt=0;state.error=null;
    if(rows.length<top&&!payload['@odata.nextLink']){state.status='READY';state.checkedAt=clock()}
    else if(state.offset>=maxRows){state.status='FAILED';state.error='D365_STOCK_TRUNCATED';state.retryAt=clock()+30000}
   }catch(e){state.failures=(state.failures||0)+1;state.status=state.failures>=3?'FAILED':'READING';state.error=e.code||'D365_STOCK_UNAVAILABLE';state.retryAt=clock()+(state.status==='FAILED'?30000:2000)}
   state.revision=(revision??0)+1;
   if(!await compareState(key,state,revision)){const current=await readState(key)||state;if(current.status==='READY')return{status:'READY',complete:true,value:current.rows,rowCount:current.rows.length,pages:current.pages,checkedAt:new Date(current.checkedAt).toISOString()};return pending(current);}
   if(state.status==='READY')return{status:'READY',complete:true,value:state.rows,rowCount:state.rows.length,pages:state.pages,checkedAt:new Date(state.checkedAt).toISOString(),cache:{status:'REFRESHED'}};
   return pending(state);
  })();inflight.set(key,task);return task.finally(()=>{if(inflight.get(key)===task)inflight.delete(key)});
 }
}
const reader=createPagedStockReader({readPage:({entity,filter,select,offset,top})=>odataGet(entity,{filter,select,top,extra:`cross-company=true&$skip=${offset}`}),readState:readAnalyticsCacheFresh,compareState:compareAnalyticsCache});
export async function readOperationalWarehouseStock(warehouseId,{force=false}={}){
 const c=config.dynamics.stock,entity=c.entity||'WarehousesOnHandV2';
 const select=[c.productField||'ItemNumber',c.warehouseField||'InventoryWarehouseId',c.physicalField||'OnHandQuantity',c.availableField||'AvailableOnHandQuantity',c.nameField,c.eanField,config.dynamics.dataAreaId?config.dynamics.dataAreaField:null].filter(Boolean).sort().filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const esc=v=>String(v).replaceAll("'","''"),filter=[`${c.warehouseField||'InventoryWarehouseId'} eq '${esc(warehouseId)}'`,config.dynamics.dataAreaId?`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`:''].filter(Boolean).join(' and ');
 const key='operational-stock-v1|'+createHash('sha256').update(JSON.stringify([config.dynamics.baseUrl,config.dynamics.dataAreaId,entity,warehouseId,select])).digest('hex');
 return reader(key,{entity,filter,select},{force});
}

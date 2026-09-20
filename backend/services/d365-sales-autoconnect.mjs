import { config } from '../config.mjs';
import { discoverD365SalesMapping } from './d365-mapping-diagnostics.mjs';
import { d365SalesMappingSettings,saveD365SalesMappingDraft,smokeD365SalesMapping,activateD365SalesMapping } from './d365-sales-mapping.mjs';

const attempts=new Map();
const inflight=new Map();
const TTL_MS=10*60*1000;

export async function ensureD365SalesAutoConnected(storeId='val-fleuri'){
  const current=d365SalesMappingSettings();
  if(current?.state==='LIVE'&&current?.smoke?.status==='PASSED')return{status:'LIVE',connected:true,mapping:current,cached:true};
  if(config.dynamics.mode!=='live')return{status:'DISABLED',connected:false,reason:'D365_MODE_NOT_LIVE'};
  const cached=attempts.get(storeId);
  if(cached&&Date.now()-cached.at<TTL_MS)return{...cached.value,cached:true};
  if(inflight.has(storeId))return inflight.get(storeId);

  const promise=(async()=>{
    try{
      const discovered=await discoverD365SalesMapping(storeId);
      const fallback={salesEntity:'RetailTransactionSalesTransBIEntities',fields:{channel:'store',businessDate:'businessDate',transaction:'transactionId',net:'netAmountInclTax',quantity:'qty',product:'itemId',time:'time',cost:'',productName:'',department:'',category:''},dateFilterMode:'datetime',salesSign:-1,quantitySign:1,costSign:-1};
      const rec=discovered.status==='READY'&&discovered.recommendation?discovered.recommendation:fallback;
      saveD365SalesMappingDraft({actor:null,input:{
        entity:rec.salesEntity,
        fields:rec.fields,
        dateFilterMode:rec.dateFilterMode||'datetime',
        salesSign:rec.salesSign??-1,
        quantitySign:rec.quantitySign??1,
        costSign:rec.costSign??-1
      }});
      const validated=await smokeD365SalesMapping({actor:null,storeId});
      if(validated?.smoke?.status!=='PASSED'){
        const value={status:'SMOKE_FAILED',connected:false,reason:validated?.smoke?.note||'Smoke ventes non concluant.',mapping:validated,discoveryStatus:discovered.status,fallbackUsed:discovered.status!=='READY'};
        attempts.set(storeId,{at:Date.now(),value});return value
      }
      const active=activateD365SalesMapping({actor:null});
      const value={status:'LIVE',connected:true,mapping:active,discovered:{entity:rec.salesEntity,fields:rec.fields},fallbackUsed:discovered.status!=='READY'};
      attempts.set(storeId,{at:Date.now(),value});return value
    }catch(error){
      const value={status:'ERROR',connected:false,reason:error?.message||String(error),code:error?.code||'D365_SALES_AUTOCONNECT_FAILED'};
      attempts.set(storeId,{at:Date.now(),value});return value
    }
  })();
  inflight.set(storeId,promise);
  try{return await promise}finally{inflight.delete(storeId)}
}

export function clearD365SalesAutoConnectCache(storeId=null){
  if(storeId)attempts.delete(storeId);else attempts.clear()
}

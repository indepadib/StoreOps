import { config } from '../config.mjs';
import { d365CostMappingSettings,smokeD365CostMapping,activateD365CostMapping } from './d365-cost-mapping.mjs';

const attempts=new Map();
const inflight=new Map();
const TTL_MS=10*60*1000;
export const VERIFIED_RELEASED_PRODUCTS_COST_MAPPING=Object.freeze({
 entity:'ReleasedProductsV2',
 fields:{
  item:'ItemNumber',
  cost:'UnitCost',
  validFrom:'UnitCostDate',
  validTo:'',
  currency:'',
  warehouse:'',
  site:'',
  unit:'InventoryUnitSymbol',
  quantity:'UnitCostQuantity',
  recordId:''
 }
});

export async function ensureD365CostAutoConnected(productNumber){
 const sku=String(productNumber||'').trim(),current=d365CostMappingSettings();
 if(current?.state==='LIVE'&&current?.smoke?.status==='PASSED')return{status:'LIVE',connected:true,mapping:current,cached:true};
 if(current?.state==='DISABLED')return{status:'DISABLED',connected:false,reason:'MANUALLY_DISABLED',mapping:current};
 if(current&&current.state!=='DRAFT'&&current.state!=='VALIDATED')return{status:current.state||'CONFIGURED',connected:false,reason:'EXISTING_MAPPING_STATE',mapping:current};
 if(current&&(current.entity!==VERIFIED_RELEASED_PRODUCTS_COST_MAPPING.entity||current.fields?.item!==VERIFIED_RELEASED_PRODUCTS_COST_MAPPING.fields.item||current.fields?.cost!==VERIFIED_RELEASED_PRODUCTS_COST_MAPPING.fields.cost)){
  return{status:'CONFIGURED',connected:false,reason:'CUSTOM_MAPPING_IN_PROGRESS',mapping:current};
 }
 if(config.dynamics.mode!=='live')return{status:'DISABLED',connected:false,reason:'D365_MODE_NOT_LIVE'};
 if(!sku)return{status:'NO_SAMPLE',connected:false,reason:'PRODUCT_NUMBER_REQUIRED'};
 const cached=attempts.get(sku);if(cached&&Date.now()-cached.at<TTL_MS)return{...cached.value,cached:true};
 if(inflight.has(sku))return inflight.get(sku);
 const promise=(async()=>{
  try{
   const validated=await smokeD365CostMapping({actor:null,productNumber:sku,input:VERIFIED_RELEASED_PRODUCTS_COST_MAPPING});
   if(validated?.smoke?.status!=='PASSED'){
    const value={status:'SMOKE_FAILED',connected:false,reason:validated?.smoke?.note||'Smoke coût non concluant.',mapping:validated};
    attempts.set(sku,{at:Date.now(),value});return value
   }
   const active=activateD365CostMapping({actor:null});
   const value={status:'LIVE',connected:true,mapping:active,verifiedSource:'ReleasedProductsV2.UnitCost / InventoryUnitSymbol / UnitCostQuantity'};
   attempts.set(sku,{at:Date.now(),value});return value
  }catch(error){
   const value={status:'ERROR',connected:false,reason:error?.message||String(error),code:error?.code||'D365_COST_AUTOCONNECT_FAILED'};
   attempts.set(sku,{at:Date.now(),value});return value
  }
 })();
 inflight.set(sku,promise);
 try{return await promise}finally{inflight.delete(sku)}
}

export function clearD365CostAutoConnectCache(productNumber=null){
 if(productNumber)attempts.delete(String(productNumber));else attempts.clear()
}

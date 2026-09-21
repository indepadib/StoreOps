import { config } from '../config.mjs';
import { odataGet } from './dynamics.mjs';
import { effectiveD365CostMapping,d365CostMappingSettings } from './d365-cost-mapping.mjs';
import { storeOperationalSettings } from './store-settings.mjs';
import { ensureD365CostAutoConnected } from './d365-cost-autoconnect.mjs';

const clean=v=>String(v??'').trim();
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
const esc=v=>String(v).replaceAll("'","''");
function dateOnly(v){const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function activeOn(row,fields,day){
 if(!day)return true;const from=fields.validFrom?dateOnly(row?.[fields.validFrom]):null,to=fields.validTo?dateOnly(row?.[fields.validTo]):null;
 return(!from||from<=day)&&(!to||to>=day)
}
export function costIntegrationConfig(storeId=null){
 const persisted=d365CostMappingSettings(),live=effectiveD365CostMapping(),settings=storeId?storeOperationalSettings(storeId):null;
 return{state:live?'LIVE':persisted?.state||'UNMAPPED',ready:config.dynamics.mode==='live'&&!!live,entity:live?.entity||persisted?.entity||null,fields:live?.fields||persisted?.fields||null,warehouseId:settings?.storeWarehouseId||null,validatedAt:persisted?.validatedAt||null}
}
export async function getProductCost(storeId,productNumber,{businessDate=null}={}){
 const sku=clean(productNumber);let cfg=costIntegrationConfig(storeId);if(!sku)return{status:'UNAVAILABLE',reason:'PRODUCT_NOT_MAPPED',unitCost:null};
 if(!cfg.ready){await ensureD365CostAutoConnected(sku);cfg=costIntegrationConfig(storeId)}
 if(!cfg.ready)return{status:'UNAVAILABLE',reason:cfg.state==='UNMAPPED'?'COST_MAPPING_UNMAPPED':'COST_MAPPING_NOT_LIVE',state:cfg.state,unitCost:null};
 const f=cfg.fields,filters=[`${f.item} eq '${esc(sku)}'`];if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
 if(f.warehouse&&cfg.warehouseId)filters.push(`${f.warehouse} eq '${esc(cfg.warehouseId)}'`);
 const inferredUnitField=!f.unit&&cfg.entity==='ReleasedProductsV2'?'InventoryUnitSymbol':null;
 const unitField=f.unit||inferredUnitField;
 const buildSelect=includeInferred=>[...new Set([f.item,f.cost,f.validFrom,f.validTo,f.currency,f.warehouse,f.site,f.unit,includeInferred?inferredUnitField:null,f.quantity,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean))].join(',');
 let payload;
 try{payload=await odataGet(cfg.entity,{filter:filters.join(' and '),select:buildSelect(true),top:100,extra:config.dynamics.dataAreaId?'cross-company=true':''})}
 catch(error){if(!inferredUnitField)throw error;payload=await odataGet(cfg.entity,{filter:filters.join(' and '),select:buildSelect(false),top:100,extra:config.dynamics.dataAreaId?'cross-company=true':''})}
 const rows=payload?.value||[];
 const day=dateOnly(businessDate)||new Date().toISOString().slice(0,10),eligible=rows.filter(r=>activeOn(r,f,day)&&num(r?.[f.cost])!==null);
 eligible.sort((a,b)=>String(f.validFrom?b?.[f.validFrom]||'':'').localeCompare(String(f.validFrom?a?.[f.validFrom]||'':'')));
 const row=eligible[0];if(!row)return{status:'UNAVAILABLE',reason:'COST_NOT_FOUND',state:cfg.state,source:`D365/${cfg.entity}`,unitCost:null};
 const raw=num(row?.[f.cost]),qty=f.quantity?num(row?.[f.quantity]):null,unitCost=qty&&qty>0?raw/qty:raw;
 return{status:'READY',state:cfg.state,source:`D365/${cfg.entity}`,entity:cfg.entity,productNumber:sku,businessDate:day,warehouseId:f.warehouse?cfg.warehouseId:null,unitCost:unitCost==null?null:Math.round((unitCost+Number.EPSILON)*10000)/10000,currency:f.currency?clean(row?.[f.currency])||null:null,unit:unitField?clean(row?.[unitField])||null:null,unitSource:f.unit?'MAPPED_FIELD':(inferredUnitField&&row?.[inferredUnitField]!==undefined?'RELEASED_PRODUCTS_INVENTORY_UNIT':null),rawCost:raw,costQuantity:qty}
}

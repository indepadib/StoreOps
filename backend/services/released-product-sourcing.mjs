import {config} from '../config.mjs';
import {odataGet} from './dynamics.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const normalized=v=>clean(v).toUpperCase().replace(/[\s_-]+/g,'');
const DIRECT_VALUES=new Set(['DIRECT','DIRECTFOURNISSEUR','FOURNISSEURDIRECT','DIRECTSUPPLIER']);
const DC_VALUES=new Set(['DC','DISTRIBUTIONCENTER','CENTREDEDISTRIBUTION','ENTREPOT','WAREHOUSE']);
const candidateNames=['SupplyMode','SupplyType','ReplenishmentType','SourcingMode','SourcingType','DCOrDirect','DCDirect','DistributionMode','ProcurementMode'];

export function normalizeReleasedProductSupplyMode(value){
 const v=normalized(value);if(!v)return null;
 if(DIRECT_VALUES.has(v)||v.includes('DIRECT'))return'DIRECT_SUPPLIER';
 if(DC_VALUES.has(v)||v==='LVELAKHYATA'||v==='LVELAKHYA')return'WAREHOUSE';
 return null
}
function inferField(row){
 const configured=clean(process.env.D365_RELEASED_PRODUCT_SUPPLY_MODE_FIELD);if(configured)return configured;
 const keys=Object.keys(row||{});
 const exact=candidateNames.find(name=>keys.some(k=>k.toLowerCase()===name.toLowerCase()));if(exact)return keys.find(k=>k.toLowerCase()===exact.toLowerCase());
 const valued=keys.find(k=>normalizeReleasedProductSupplyMode(row?.[k]));if(valued)return valued;
 return null
}
export async function releasedProductSourcing(productNumber){
 const sku=clean(productNumber);if(!sku)return{status:'UNAVAILABLE',productNumber:null,supplyMode:null,field:null,primaryVendorAccount:null};
 if(config.dynamics.mode!=='live')return{status:'UNAVAILABLE',productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:'D365_NOT_LIVE'};
 const entity=clean(process.env.D365_RELEASED_PRODUCT_ENTITY)||'ReleasedProductsV2';
 const itemField=clean(process.env.D365_RELEASED_PRODUCT_ITEM_FIELD)||'ItemNumber';
 const vendorField=clean(process.env.D365_RELEASED_PRODUCT_VENDOR_FIELD)||'PrimaryVendorAccountNumber';
 const filters=[`${itemField} eq '${esc(sku)}'`];if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
 try{
  const payload=await odataGet(entity,{filter:filters.join(' and '),top:1,extra:config.dynamics.dataAreaId?'cross-company=true':''}),row=payload?.value?.[0]||null;
  if(!row)return{status:'UNAVAILABLE',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:'RELEASED_PRODUCT_NOT_FOUND'};
  const field=inferField(row),raw=field?row[field]:null,supplyMode=normalizeReleasedProductSupplyMode(raw),primaryVendorAccount=clean(row[vendorField])||null;
  return{status:supplyMode?'READY':'UNMAPPED',source:`D365/${entity}`,productNumber:sku,supplyMode,rawValue:raw??null,field:field||null,primaryVendorAccount,warehouseId:supplyMode==='WAREHOUSE'?'LVE Lakhya':null,reason:supplyMode?null:field?'UNRECOGNIZED_SUPPLY_MODE':'SUPPLY_MODE_FIELD_NOT_FOUND'}
 }catch(error){return{status:'ERROR',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,error:error.message,code:error.code||'D365_RELEASED_PRODUCT_SOURCING_FAILED'}}
}

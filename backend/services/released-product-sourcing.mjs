import {config} from '../config.mjs';
import {odataGet,odataGetAll} from './dynamics.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const normalized=v=>clean(v).toUpperCase().replace(/[\s_-]+/g,'');
const DIRECT_VALUES=new Set(['DIRECT','DIRECTFOURNISSEUR','FOURNISSEURDIRECT','DIRECTSUPPLIER']);
const DC_VALUES=new Set(['DC','DISTRIBUTIONCENTER','CENTREDEDISTRIBUTION','ENTREPOT','WAREHOUSE']);
const candidateNames=['SupplyMode','SupplyType','ReplenishmentType','SourcingMode','SourcingType','DCOrDirect','DCDirect','DistributionMode','ProcurementMode'];
const productNameCandidates=['ProductName','ProductDescription','Description','ProductSearchName','SearchName'];
function productNameField(row){const configured=clean(process.env.D365_RELEASED_PRODUCT_NAME_FIELD||config.dynamics.productNameField),keys=Object.keys(row||{});if(configured){const found=keys.find(k=>k.toLowerCase()===configured.toLowerCase());if(found&&clean(row[found]))return found}for(const name of productNameCandidates){const found=keys.find(k=>k.toLowerCase()===name.toLowerCase());if(found&&clean(row[found]))return found}return null}
export function releasedProductDisplayName(row){const field=productNameField(row);return{field:field||null,name:field?clean(row?.[field]):null}}

export function normalizeReleasedProductSupplyMode(value){
 const v=normalized(value);if(!v)return null;
 if(DIRECT_VALUES.has(v)||v.includes('DIRECT'))return'DIRECT_SUPPLIER';
 if(DC_VALUES.has(v)||v==='LVELAKHYATA'||v==='LVELAKHYA')return'WAREHOUSE';
 return null
}
function inferField(row){
 const configured=clean(process.env.D365_RELEASED_PRODUCT_SUPPLY_MODE_FIELD);if(configured){const found=Object.keys(row||{}).find(k=>k.toLowerCase()===configured.toLowerCase());if(found)return found}
 const keys=Object.keys(row||{});
 const exact=candidateNames.find(name=>keys.some(k=>k.toLowerCase()===name.toLowerCase()));if(exact)return keys.find(k=>k.toLowerCase()===exact.toLowerCase());
 const valued=keys.find(k=>normalizeReleasedProductSupplyMode(row?.[k]));if(valued)return valued;
 return null
}
export async function releasedProductSourcing(productNumber){
 const sku=clean(productNumber);if(!sku)return{status:'UNAVAILABLE',productNumber:null,supplyMode:null,field:null,primaryVendorAccount:null};
 if(config.dynamics.mode!=='live')return{status:'UNAVAILABLE',productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:'D365_NOT_LIVE'};
 const entity=clean(process.env.D365_RELEASED_PRODUCT_ENTITY)||'ReleasedProductsV2';
 const itemFields=[...new Set([clean(process.env.D365_RELEASED_PRODUCT_ITEM_FIELD),clean(config.dynamics.productNumberField),'ProductNumber','ItemNumber'].filter(Boolean))];
 const vendorField=clean(process.env.D365_RELEASED_PRODUCT_VENDOR_FIELD)||'PrimaryVendorAccountNumber';
 let lastError=null;
 for(const itemField of itemFields){
  const filters=[`${itemField} eq '${esc(sku)}'`];if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
  try{
   const payload=await odataGet(entity,{filter:filters.join(' and '),top:1,extra:config.dynamics.dataAreaId?'cross-company=true':''}),row=payload?.value?.[0]||null;
   if(!row)continue;
   const field=inferField(row),raw=field?row[field]:null,supplyMode=normalizeReleasedProductSupplyMode(raw),primaryVendorAccount=clean(row[vendorField]||row.PrimaryVendorAccount||row.VendorAccountNumber)||null,nameField=productNameField(row),productName=nameField?clean(row[nameField]):null,actualSku=clean(row[itemField])||sku;
   return{status:supplyMode?'READY':'UNMAPPED',source:`D365/${entity}`,productNumber:actualSku,productName,nameField:nameField||null,supplyMode,rawValue:raw??null,field:field||null,itemField,primaryVendorAccount,warehouseId:supplyMode==='WAREHOUSE'?'LVE Lakhya':null,reason:supplyMode?null:field?'UNRECOGNIZED_SUPPLY_MODE':'SUPPLY_MODE_FIELD_NOT_FOUND'}
  }catch(error){lastError=error;if(!(error?.code==='D365_REQUEST_FAILED'&&Number(error?.details?.httpStatus)===400))break}
 }
 if(lastError)return{status:'ERROR',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,error:lastError.message,code:lastError.code||'D365_RELEASED_PRODUCT_SOURCING_FAILED'};
 return{status:'UNAVAILABLE',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:'RELEASED_PRODUCT_NOT_FOUND'}
}
export async function releasedProductSourcingMany(productNumbers=[]){
 const skus=[...new Set((productNumbers||[]).map(clean).filter(Boolean))];if(!skus.length)return new Map();
 if(config.dynamics.mode!=='live')return new Map(skus.map(sku=>[sku,{status:'UNAVAILABLE',productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:'D365_NOT_LIVE'}]));
 const entity=clean(process.env.D365_RELEASED_PRODUCT_ENTITY)||'ReleasedProductsV2',itemFields=[...new Set([clean(process.env.D365_RELEASED_PRODUCT_ITEM_FIELD),clean(config.dynamics.productNumberField),'ProductNumber','ItemNumber'].filter(Boolean))],vendorField=clean(process.env.D365_RELEASED_PRODUCT_VENDOR_FIELD)||'PrimaryVendorAccountNumber',out=new Map();
 let workingItemField=null,lastError=null;
 for(const probeSku of skus.slice(0,4)){
  for(const candidate of itemFields){
   const filters=[`${candidate} eq '${esc(probeSku)}'`];if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
   try{const probe=await odataGet(entity,{filter:filters.join(' and '),top:1,extra:config.dynamics.dataAreaId?'cross-company=true':''});if(probe?.value?.[0]){workingItemField=candidate;break}}catch(error){lastError=error}
  }
  if(workingItemField)break
 }
 if(!workingItemField){for(const sku of skus)out.set(sku,{status:lastError?'ERROR':'UNAVAILABLE',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:lastError?null:'RELEASED_PRODUCT_NOT_FOUND',error:lastError?.message||null,code:lastError?.code||null});return out}
 for(let i=0;i<skus.length;i+=30){
  const chunk=skus.slice(i,i+30),filters=[`(${chunk.map(sku=>`${workingItemField} eq '${esc(sku)}'`).join(' or ')})`];if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
  try{
   const payload=await odataGetAll(entity,{filter:filters.join(' and '),extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:100,maxRows:1000});
   for(const row of payload.value||[]){
    const sku=clean(row[workingItemField]);if(!sku)continue;const field=inferField(row),raw=field?row[field]:null,supplyMode=normalizeReleasedProductSupplyMode(raw),primaryVendorAccount=clean(row[vendorField]||row.PrimaryVendorAccount||row.VendorAccountNumber)||null,nameField=productNameField(row),productName=nameField?clean(row[nameField]):null;
    out.set(sku,{status:supplyMode?'READY':'UNMAPPED',source:`D365/${entity}`,productNumber:sku,productName,nameField:nameField||null,supplyMode,rawValue:raw??null,field:field||null,itemField:workingItemField,primaryVendorAccount,warehouseId:supplyMode==='WAREHOUSE'?'LVE Lakhya':null,reason:supplyMode?null:field?'UNRECOGNIZED_SUPPLY_MODE':'SUPPLY_MODE_FIELD_NOT_FOUND'})
   }
  }catch(error){for(const sku of chunk)if(!out.has(sku))out.set(sku,{status:'ERROR',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,error:error.message,code:error.code||'D365_RELEASED_PRODUCT_SOURCING_FAILED'})}
 }
 for(const sku of skus)if(!out.has(sku))out.set(sku,{status:'UNAVAILABLE',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:'RELEASED_PRODUCT_NOT_FOUND'});
 return out
}

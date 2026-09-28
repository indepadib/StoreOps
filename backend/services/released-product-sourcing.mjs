import {config} from '../config.mjs';
import {odataGet,odataGetAll} from './dynamics.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const normalized=v=>clean(v).toUpperCase().replace(/[\s_-]+/g,'');
const DIRECT_VALUES=new Set(['DIRECT','DIRECTFOURNISSEUR','FOURNISSEURDIRECT','DIRECTSUPPLIER']);
const DC_VALUES=new Set(['DC','AUTO','DISTRIBUTIONCENTER','CENTREDEDISTRIBUTION','ENTREPOT','WAREHOUSE']);
const candidateNames=['BatchNumberGroupCode','BATCHNUMBERGROUPCODE','SupplyMode','SupplyType','ReplenishmentType','SourcingMode','SourcingType','DCOrDirect','DCDirect','DistributionMode','ProcurementMode'];
const productNameCandidates=['ProductName','ProductDescription','Description','ProductSearchName','PRODUCTSEARCHNAME','SearchName','SEARCHNAME'];
const sourcingCache=new Map();
const sourcingCacheMs=()=>Math.max(30_000,Math.min(900_000,Number(process.env.STOREOPS_RELEASED_PRODUCT_CACHE_MS)||300_000));
function cacheGet(sku){const x=sourcingCache.get(String(sku||''));return x&&Date.now()<x.expiresAt?x.value:null}
function cachePut(sku,value){if(sku&&value)sourcingCache.set(String(sku),{value,expiresAt:Date.now()+sourcingCacheMs()});return value}
function productNameField(row){const configured=clean(process.env.D365_RELEASED_PRODUCT_NAME_FIELD||config.dynamics.productNameField),keys=Object.keys(row||{});if(configured){const found=keys.find(k=>k.toLowerCase()===configured.toLowerCase());if(found&&clean(row[found]))return found}for(const name of productNameCandidates){const found=keys.find(k=>k.toLowerCase()===name.toLowerCase());if(found&&clean(row[found]))return found}return null}
export function releasedProductDisplayName(row){
 const field=productNameField(row),name=field?clean(row?.[field]):null;
 const quality=!field?null:/productsearchname/i.test(field)?'SEARCH_FALLBACK':/^searchname$/i.test(field)?'SEARCH_FALLBACK':'DISPLAY_NAME';
 return{field:field||null,name,quality}
}
function valueField(row,candidates=[]){const keys=Object.keys(row||{});for(const c of candidates){const hit=keys.find(k=>k.toLowerCase()===String(c).toLowerCase());if(hit)return hit}return null}
export function parseRetailFinancialDimension(value){
 const raw=clean(value),parts=raw.split('|').map(clean).filter(Boolean);
 if(!raw||!parts.length)return{raw:raw||null,retailScope:null,rayonCode:null,rayonLabel:null};
 const retailIndex=parts.findIndex(x=>x.toUpperCase()==='RETAIL'),retailScope=retailIndex>=0?parts[retailIndex+1]||null:parts.length>=2?parts[1]:null,last=parts.at(-1)||null,rayonCode=last&&last!==retailScope&&/^\d+[A-Za-z]?$/.test(last)?last:null;
 return{raw,retailScope,rayonCode,rayonLabel:rayonCode?`Rayon ${rayonCode}`:null}
}
export function releasedProductProfile(row={}){
 const itemField=valueField(row,['ProductNumber','ItemNumber']),productNumber=itemField?clean(row[itemField]):null,display=releasedProductDisplayName(row),supplyField=inferField(row),supplyRaw=supplyField?row[supplyField]:null,supplyMode=normalizeReleasedProductSupplyMode(supplyRaw),vendorField=valueField(row,['PrimaryVendorAccountNumber','PrimaryVendorAccount','VendorAccountNumber']),dimensionField=valueField(row,['DefaultLedgerDimensionDisplayValue','DEFAULTLEDGERDIMENSIONDISPLAYVALUE']),dimension=parseRetailFinancialDimension(dimensionField?row[dimensionField]:null),inventoryUnitField=valueField(row,['InventoryUnitSymbol']),salesUnitField=valueField(row,['SalesUnitSymbol']),purchaseUnitField=valueField(row,['PurchaseUnitSymbol']),salesPriceField=valueField(row,['SalesPrice']),unitCostField=valueField(row,['UnitCost']);
 return{productNumber,productName:display.name,nameField:display.field,nameQuality:display.quality,supplyMode,supplyRawValue:supplyRaw??null,supplyField:supplyField||null,primaryVendorAccount:vendorField?clean(row[vendorField])||null:null,retailScope:dimension.retailScope,rayonCode:dimension.rayonCode,rayonLabel:dimension.rayonLabel,financialDimension:dimension.raw,inventoryUnit:inventoryUnitField?clean(row[inventoryUnitField])||null:null,salesUnit:salesUnitField?clean(row[salesUnitField])||null:null,purchaseUnit:purchaseUnitField?clean(row[purchaseUnitField])||null:null,salesPrice:salesPriceField&&Number.isFinite(Number(row[salesPriceField]))?Number(row[salesPriceField]):null,unitCost:unitCostField&&Number.isFinite(Number(row[unitCostField]))?Number(row[unitCostField]):null}
}

export function normalizeReleasedProductSupplyMode(value){
 const v=normalized(value);if(!v)return null;
 if(DIRECT_VALUES.has(v)||v.includes('DIRECT'))return'DIRECT_SUPPLIER';
 if(DC_VALUES.has(v)||['LVELAKHYATA','LVELAKHYAYTA','LVELAKHYA','LVELKHAYTA','LVELKHAYYATA'].includes(v))return'WAREHOUSE';
 return null
}
function inferField(row){
 const configured=clean(process.env.D365_RELEASED_PRODUCT_SUPPLY_MODE_FIELD);if(configured){const found=Object.keys(row||{}).find(k=>k.toLowerCase()===configured.toLowerCase());if(found)return found}
 const keys=Object.keys(row||{});
 const exact=candidateNames.find(name=>keys.some(k=>k.toLowerCase()===name.toLowerCase()));if(exact)return keys.find(k=>k.toLowerCase()===exact.toLowerCase());
 const valued=keys.find(k=>{const raw=normalized(row?.[k]);return DIRECT_VALUES.has(raw)||DC_VALUES.has(raw)||raw==='LVELAKHYATA'||raw==='LVELAKHYA'});if(valued)return valued;
 return null
}
export async function releasedProductSourcing(productNumber){
 const sku=clean(productNumber);if(!sku)return{status:'UNAVAILABLE',productNumber:null,supplyMode:null,field:null,primaryVendorAccount:null};const cached=cacheGet(sku);if(cached)return cached;
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
   const profile=releasedProductProfile(row),actualSku=clean(row[itemField])||profile.productNumber||sku,supplyMode=profile.supplyMode;
   return cachePut(actualSku,{status:supplyMode?'READY':'UNMAPPED',source:`D365/${entity}`,productNumber:actualSku,productName:profile.productName,nameField:profile.nameField,nameQuality:profile.nameQuality,supplyMode,rawValue:profile.supplyRawValue,field:profile.supplyField,itemField,primaryVendorAccount:profile.primaryVendorAccount,retailScope:profile.retailScope,rayonCode:profile.rayonCode,rayonLabel:profile.rayonLabel,financialDimension:profile.financialDimension,inventoryUnit:profile.inventoryUnit,salesUnit:profile.salesUnit,purchaseUnit:profile.purchaseUnit,salesPrice:profile.salesPrice,unitCost:profile.unitCost,warehouseId:supplyMode==='WAREHOUSE'?'LVE Lakhya':null,reason:supplyMode?null:profile.supplyField?'UNRECOGNIZED_SUPPLY_MODE':'SUPPLY_MODE_FIELD_NOT_FOUND'})
  }catch(error){lastError=error;if(!(error?.code==='D365_REQUEST_FAILED'&&Number(error?.details?.httpStatus)===400))break}
 }
 if(lastError)return{status:'ERROR',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,error:lastError.message,code:lastError.code||'D365_RELEASED_PRODUCT_SOURCING_FAILED'};
 return{status:'UNAVAILABLE',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:'RELEASED_PRODUCT_NOT_FOUND'}
}
export async function releasedProductSourcingMany(productNumbers=[]){
 const skus=[...new Set((productNumbers||[]).map(clean).filter(Boolean))];if(!skus.length)return new Map();const out=new Map();for(const sku of skus){const cached=cacheGet(sku);if(cached)out.set(sku,cached)};const pending=skus.filter(sku=>!out.has(sku));if(!pending.length)return out;
 if(config.dynamics.mode!=='live'){for(const sku of pending)out.set(sku,{status:'UNAVAILABLE',productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:'D365_NOT_LIVE'});return out}
 const entity=clean(process.env.D365_RELEASED_PRODUCT_ENTITY)||'ReleasedProductsV2',itemFields=[...new Set([clean(process.env.D365_RELEASED_PRODUCT_ITEM_FIELD),clean(config.dynamics.productNumberField),'ProductNumber','ItemNumber'].filter(Boolean))],vendorField=clean(process.env.D365_RELEASED_PRODUCT_VENDOR_FIELD)||'PrimaryVendorAccountNumber';
 let workingItemField=null,probeRow=null,lastError=null;
 for(const probeSku of pending.slice(0,4)){
  for(const candidate of itemFields){
   const filters=[`${candidate} eq '${esc(probeSku)}'`];if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
   try{const probe=await odataGet(entity,{filter:filters.join(' and '),top:1,extra:config.dynamics.dataAreaId?'cross-company=true':''});if(probe?.value?.[0]){workingItemField=candidate;probeRow=probe.value[0];break}}catch(error){lastError=error}
  }
  if(workingItemField)break
 }
 if(!workingItemField){for(const sku of skus)out.set(sku,{status:lastError?'ERROR':'UNAVAILABLE',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:lastError?null:'RELEASED_PRODUCT_NOT_FOUND',error:lastError?.message||null,code:lastError?.code||null});return out}
 const probeNameField=productNameField(probeRow),probeSupplyField=inferField(probeRow),probeVendorField=[vendorField,'PrimaryVendorAccount','VendorAccountNumber'].find(field=>field&&Object.prototype.hasOwnProperty.call(probeRow||{},field))||null,probeDimensionField=valueField(probeRow,['DefaultLedgerDimensionDisplayValue','DEFAULTLEDGERDIMENSIONDISPLAYVALUE']),probeInventoryUnit=valueField(probeRow,['InventoryUnitSymbol']),probeSalesUnit=valueField(probeRow,['SalesUnitSymbol']),probePurchaseUnit=valueField(probeRow,['PurchaseUnitSymbol']),probeSalesPrice=valueField(probeRow,['SalesPrice']),probeUnitCost=valueField(probeRow,['UnitCost']),select=[workingItemField,probeNameField,probeSupplyField,probeVendorField,probeDimensionField,probeInventoryUnit,probeSalesUnit,probePurchaseUnit,probeSalesPrice,probeUnitCost,config.dynamics.dataAreaId?config.dynamics.dataAreaField:null].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 for(let i=0;i<pending.length;i+=30){
  const chunk=pending.slice(i,i+30),filters=[`(${chunk.map(sku=>`${workingItemField} eq '${esc(sku)}'`).join(' or ')})`];if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
  try{
   const payload=await odataGetAll(entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:100,maxRows:1000});
   for(const row of payload.value||[]){
    const sku=clean(row[workingItemField]);if(!sku)continue;const profile=releasedProductProfile(row),supplyMode=profile.supplyMode;
    out.set(sku,cachePut(sku,{status:supplyMode?'READY':'UNMAPPED',source:`D365/${entity}`,productNumber:sku,productName:profile.productName,nameField:profile.nameField,nameQuality:profile.nameQuality,supplyMode,rawValue:profile.supplyRawValue,field:profile.supplyField,itemField:workingItemField,primaryVendorAccount:profile.primaryVendorAccount,retailScope:profile.retailScope,rayonCode:profile.rayonCode,rayonLabel:profile.rayonLabel,financialDimension:profile.financialDimension,inventoryUnit:profile.inventoryUnit,salesUnit:profile.salesUnit,purchaseUnit:profile.purchaseUnit,salesPrice:profile.salesPrice,unitCost:profile.unitCost,warehouseId:supplyMode==='WAREHOUSE'?'LVE Lakhya':null,reason:supplyMode?null:profile.supplyField?'UNRECOGNIZED_SUPPLY_MODE':'SUPPLY_MODE_FIELD_NOT_FOUND'}))
   }
  }catch(error){for(const sku of chunk)if(!out.has(sku))out.set(sku,{status:'ERROR',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,error:error.message,code:error.code||'D365_RELEASED_PRODUCT_SOURCING_FAILED'})}
 }
 for(const sku of pending)if(!out.has(sku))out.set(sku,cachePut(sku,{status:'UNAVAILABLE',source:`D365/${entity}`,productNumber:sku,supplyMode:null,field:null,primaryVendorAccount:null,reason:'RELEASED_PRODUCT_NOT_FOUND'}));
 return out
}

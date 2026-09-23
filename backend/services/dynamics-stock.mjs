import { config } from '../config.mjs';
import { getProductByEan,getProductByReference,odataGetAll } from './dynamics.mjs';
import { storeOperationalSettings,allStoreOperationalSettings,networkOperationalSettings } from './store-settings.mjs';
import { rememberProductIdentity,cachedProductByEan,noteProductIdentityFailure } from './product-cache.mjs';

// Pilot fallback only. Other stores must be explicitly mapped in configuration.
export const STORE_WAREHOUSES=Object.freeze({'val-fleuri':'FRP0001'});
export const STOCK_ENTITY='WarehousesOnHandV2';

function escapeOData(v){return String(v).replaceAll("'","''")}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function clean(v){return String(v??'').trim()}
function stockLive(){return config.dynamics.mode==='live'&&config.dynamics.read?.stock==='live'}
function stockEntity(){return config.dynamics.stock.entity||STOCK_ENTITY}
function stockFields(){return{
  item:config.dynamics.stock.productField||'ItemNumber',
  warehouse:config.dynamics.stock.warehouseField||'InventoryWarehouseId',
  onHand:config.dynamics.stock.physicalField||'OnHandQuantity',
  availableOnHand:config.dynamics.stock.availableField||'AvailableOnHandQuantity',
  batch:config.dynamics.stock.batchField||'',
  location:config.dynamics.stock.locationField||'',
  status:config.dynamics.stock.statusField||''
}}
function mappedWarehouseForStore(storeId){return storeOperationalSettings(storeId).storeWarehouseId||null}
export function supplyWarehouseForStore(storeId){return storeOperationalSettings(storeId).supplyWarehouseId||null}

export function warehouseForStore(storeId){
  const warehouseId=mappedWarehouseForStore(storeId);
  if(!warehouseId)throw Object.assign(new Error(`Warehouse Dynamics non mappé pour le magasin ${storeId}.`),{status:503,code:'D365_STORE_WAREHOUSE_NOT_MAPPED',details:{storeId}});
  return warehouseId
}

export function stockIntegrationConfig(){
  const fields=stockFields(),network=networkOperationalSettings();
  return {
    mode:stockLive()?'LIVE':'SIMULATED',entity:stockEntity(),dataAreaId:config.dynamics.dataAreaId||null,
    network:{defaultSupplyWarehouseId:network.defaultSupplyWarehouseId,settingsSource:network.source},
    stores:allStoreOperationalSettings().map(s=>({storeId:s.id,storeName:s.name,warehouseId:s.settings.storeWarehouseId,supplyWarehouseId:s.settings.supplyWarehouseId,supplyWarehouseSource:s.settings.supplyWarehouseSource,settingsSource:s.settings.source})),
    fields:{item:fields.item,warehouse:fields.warehouse,onHand:fields.onHand,availableOnHand:fields.availableOnHand,batch:fields.batch||null,location:fields.location||null,status:fields.status||null,reservedOnHand:'ReservedOnHandQuantity',ordered:'OrderedQuantity',availableOrdered:'AvailableOrderedQuantity',reservedOrdered:'ReservedOrderedQuantity',onOrder:'OnOrderQuantity',totalAvailable:'TotalAvailableQuantity'}
  }
}

export async function listWarehouseOptions(){
  const known=new Set(),network=networkOperationalSettings();if(network.defaultSupplyWarehouseId)known.add(network.defaultSupplyWarehouseId);for(const s of allStoreOperationalSettings()){if(s.settings.storeWarehouseId)known.add(s.settings.storeWarehouseId);if(s.settings.supplyWarehouseOverrideId)known.add(s.settings.supplyWarehouseOverrideId);for(const x of s.settings.secondarySupplyWarehouseIds||[])known.add(x)}
  if(!stockLive())return{status:'CONFIG_ONLY',source:'STOREOPS',items:[...known].sort().map(id=>({id,name:id})),partial:false};
  const fields=stockFields(),directoryEntity=clean(process.env.D365_WAREHOUSE_DIRECTORY_ENTITY),directoryIdField=clean(process.env.D365_WAREHOUSE_DIRECTORY_ID_FIELD)||fields.warehouse,directoryNameField=clean(process.env.D365_WAREHOUSE_DIRECTORY_NAME_FIELD),entity=directoryEntity||stockEntity(),select=[directoryIdField,directoryNameField,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(','),filters=[];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  try{
    const fetched=await odataGetAll(entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:Math.max(100,Math.min(2000,Number(process.env.D365_WAREHOUSE_DIRECTORY_PAGE_SIZE)||500)),maxRows:Math.max(500,Math.min(50000,Number(process.env.D365_WAREHOUSE_DIRECTORY_MAX_ROWS)||10000))});
    const map=new Map();for(const row of fetched.value||[]){const id=clean(row[directoryIdField]);if(!id)continue;const name=clean(directoryNameField?row[directoryNameField]:'')||id;if(!map.has(id))map.set(id,{id,name})}for(const id of known)if(!map.has(id))map.set(id,{id,name:id});
    return{status:'READY',source:`D365/${entity}`,items:[...map.values()].sort((a,b)=>a.id.localeCompare(b.id)),partial:!!fetched.truncated,rowCount:fetched.rowCount}
  }catch(error){return{status:'DEGRADED',source:`D365/${entity}`,items:[...known].sort().map(id=>({id,name:id})),partial:true,error:error.message}}
}

export function aggregateDimensionRows(rows,fields){
  if(!fields.batch&&!fields.location&&!fields.status)return[];
  const groups=new Map();
  for(const row of rows){
    const batch=fields.batch?clean(row[fields.batch]):'',location=fields.location?clean(row[fields.location]):'',status=fields.status?clean(row[fields.status]):'',key=`${batch}|${location}|${status}`;
    const cur=groups.get(key)||{batch:batch||null,location:location||null,status:status||null,onHandQuantity:0,availableOnHandQuantity:0,reservedOnHandQuantity:0,rowCount:0};
    cur.onHandQuantity+=n(row[fields.onHand]);cur.availableOnHandQuantity+=n(row[fields.availableOnHand]);cur.reservedOnHandQuantity+=n(row.ReservedOnHandQuantity);cur.rowCount+=1;groups.set(key,cur)
  }
  return [...groups.values()].sort((a,b)=>b.availableOnHandQuantity-a.availableOnHandQuantity)
}

async function getWarehouseStockByProductNumber(warehouseId,productNumber,{mappingType='STORE'}={}){
  const entity=stockEntity(),fields=stockFields();
  if(!warehouseId)return {warehouseId:null,dataAreaId:config.dynamics.dataAreaId||null,rowCount:0,onHandQuantity:null,availableOnHandQuantity:null,reservedOnHandQuantity:null,orderedQuantity:null,availableOrderedQuantity:null,reservedOrderedQuantity:null,onOrderQuantity:null,totalAvailableQuantity:null,batches:[],source:'UNMAPPED_D365',mappingRequired:true,mappingType,complete:false};
  if(!stockLive())return {warehouseId,dataAreaId:config.dynamics.dataAreaId||null,rowCount:0,onHandQuantity:null,availableOnHandQuantity:null,reservedOnHandQuantity:null,orderedQuantity:null,availableOrderedQuantity:null,reservedOrderedQuantity:null,onOrderQuantity:null,totalAvailableQuantity:null,batches:[],source:'SIMULATED_D365',mappingType,complete:false};
  const filters=[`${fields.item} eq '${escapeOData(productNumber)}'`,`${fields.warehouse} eq '${escapeOData(warehouseId)}'`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  const select=[fields.item,fields.warehouse,fields.onHand,fields.availableOnHand,fields.batch,fields.location,fields.status,'ReservedOnHandQuantity','OrderedQuantity','AvailableOrderedQuantity','ReservedOrderedQuantity','OnOrderQuantity','TotalAvailableQuantity',config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
  const fetched=await odataGetAll(entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:config.dynamics.stock.pageSize,maxRows:config.dynamics.stock.maxRows});
  if(fetched.truncated)throw Object.assign(new Error(`Stock ${mappingType.toLowerCase()} incomplet pour ${productNumber}: limite OData atteinte.`),{status:409,code:'D365_STOCK_TRUNCATED',details:{warehouseId,productNumber,rowCount:fetched.rowCount,maxRows:config.dynamics.stock.maxRows,mappingType}});
  const rows=fetched.value||[],sum=field=>rows.reduce((s,r)=>s+n(r[field]),0);
  return {warehouseId,dataAreaId:rows[0]?.[config.dynamics.dataAreaField]||rows[0]?.dataAreaId||config.dynamics.dataAreaId||null,rowCount:rows.length,pages:fetched.pages,complete:true,onHandQuantity:sum(fields.onHand),availableOnHandQuantity:sum(fields.availableOnHand),reservedOnHandQuantity:sum('ReservedOnHandQuantity'),orderedQuantity:sum('OrderedQuantity'),availableOrderedQuantity:sum('AvailableOrderedQuantity'),reservedOrderedQuantity:sum('ReservedOrderedQuantity'),onOrderQuantity:sum('OnOrderQuantity'),totalAvailableQuantity:sum('TotalAvailableQuantity'),batches:aggregateDimensionRows(rows,fields),source:`D365/${entity}`,mappingType}
}

export async function getStoreStockByProductNumber(storeId,productNumber){return getWarehouseStockByProductNumber(mappedWarehouseForStore(storeId),productNumber,{mappingType:'STORE'})}
export async function getSupplyStockByProductNumber(storeId,productNumber){return getWarehouseStockByProductNumber(supplyWarehouseForStore(storeId),productNumber,{mappingType:'SUPPLY'})}

function safeError(error){return{code:error?.code||'D365_UNAVAILABLE',message:error?.message||'Dynamics indisponible'}}

export async function getStoreProductByReference(storeId,reference){
  const ref=clean(reference);let product=null,identityError=null,identityFallback=false;
  try{
    product=await getProductByReference(ref);
    if(product)rememberProductIdentity(product,{liveSource:product.source||'D365'});
  }catch(error){
    identityError=safeError(error);if(/^\d{8,14}$/.test(ref)){noteProductIdentityFailure(ref,error);product=cachedProductByEan(ref);identityFallback=!!product}if(!product)throw error
  }
  if(!product&&/^\d{8,14}$/.test(ref)){product=cachedProductByEan(ref);identityFallback=!!product}if(!product)return null

  let stock=null,stockError=null;
  try{stock=await getStoreStockByProductNumber(storeId,product.productNumber)}catch(error){stockError=safeError(error)}

  if(stockError){return {...product,source:identityFallback?(product.source||'STOREOPS_CACHE'):(product.source||'D365'),identityFallback,identityError,warehouseId:mappedWarehouseForStore(storeId),stock:null,availableStock:null,reservedStock:null,orderedStock:null,availableOrderedStock:null,reservedOrderedStock:null,onOrderStock:null,totalAvailableStock:null,stockRowCount:null,stockPages:null,stockSource:'D365_UNAVAILABLE',stockUnavailable:true,stockError,batches:[],stockComplete:false}}
  if(!stockLive())return {...product,identityFallback,identityError,warehouseId:stock?.warehouseId||mappedWarehouseForStore(storeId),stockSource:stock?.source||'SIMULATED_D365',batches:[],stockComplete:false};
  if(stock?.mappingRequired)return {...product,identityFallback,identityError,warehouseId:null,stock:null,availableStock:null,stockSource:stock.source,stockMappingRequired:true,batches:[],stockComplete:false};
  return {...product,identityFallback,identityError,stock:stock?.onHandQuantity??null,availableStock:stock?.availableOnHandQuantity??null,reservedStock:stock?.reservedOnHandQuantity??null,orderedStock:stock?.orderedQuantity??null,availableOrderedStock:stock?.availableOrderedQuantity??null,reservedOrderedStock:stock?.reservedOrderedQuantity??null,onOrderStock:stock?.onOrderQuantity??null,totalAvailableStock:stock?.totalAvailableQuantity??null,warehouseId:stock?.warehouseId??mappedWarehouseForStore(storeId),stockRowCount:stock?.rowCount??null,stockPages:stock?.pages??null,stockSource:stock?.source||'D365',batches:stock?.batches||[],stockComplete:stock?.complete===true}
}

export async function getStoreProductByEan(storeId,ean){return getStoreProductByReference(storeId,ean)}

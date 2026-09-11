import { config } from '../config.mjs';
import { getProductByEan,odataGet } from './dynamics.mjs';

export const STORE_WAREHOUSES=Object.freeze({
  'val-fleuri':'FRP0001',
  'trefle':'FRP0002'
});

export const STOCK_ENTITY='WarehousesOnHandV2';

function escapeOData(v){return String(v).replaceAll("'","''")}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function stockLive(){return config.dynamics.mode==='live'&&config.dynamics.read?.stock==='live'}
function stockEntity(){return config.dynamics.stock.entity||STOCK_ENTITY}
function stockFields(){return{
  item:config.dynamics.stock.productField||'ItemNumber',
  warehouse:config.dynamics.stock.warehouseField||'InventoryWarehouseId',
  onHand:config.dynamics.stock.physicalField||'OnHandQuantity',
  availableOnHand:config.dynamics.stock.availableField||'AvailableOnHandQuantity'
}}
function parseMap(value=''){
  const raw=String(value||'').trim();if(!raw)return{};
  if(raw.startsWith('{')){try{const p=JSON.parse(raw);return p&&typeof p==='object'?p:{}}catch{return{}}}
  return Object.fromEntries(raw.split(',').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i>0?[x.slice(0,i).trim(),x.slice(i+1).trim()]:null}).filter(Boolean))
}
function mappedWarehouseForStore(storeId){
  const key=String(storeId||'');
  return config.dynamics.stock.storeWarehouses?.[key]||STORE_WAREHOUSES[key]||null
}
export function supplyWarehouseForStore(storeId){return parseMap(process.env.D365_STORE_SUPPLY_WAREHOUSES||'')[String(storeId||'')]||null}

export function warehouseForStore(storeId){
  const warehouseId=mappedWarehouseForStore(storeId);
  if(!warehouseId)throw Object.assign(new Error(`Warehouse Dynamics non mappé pour le magasin ${storeId}.`),{status:503,code:'D365_STORE_WAREHOUSE_NOT_MAPPED',details:{storeId}});
  return warehouseId
}

export function stockIntegrationConfig(){
  const fields=stockFields(),stores={...STORE_WAREHOUSES,...(config.dynamics.stock.storeWarehouses||{})},supply=parseMap(process.env.D365_STORE_SUPPLY_WAREHOUSES||'');
  return {
    mode:stockLive()?'LIVE':'SIMULATED',
    entity:stockEntity(),
    dataAreaId:config.dynamics.dataAreaId||null,
    stores:Object.entries(stores).map(([storeId,warehouseId])=>({storeId,warehouseId,supplyWarehouseId:supply[storeId]||null})),
    fields:{
      item:fields.item,
      warehouse:fields.warehouse,
      onHand:fields.onHand,
      availableOnHand:fields.availableOnHand,
      reservedOnHand:'ReservedOnHandQuantity',
      ordered:'OrderedQuantity',
      availableOrdered:'AvailableOrderedQuantity',
      reservedOrdered:'ReservedOrderedQuantity',
      onOrder:'OnOrderQuantity',
      totalAvailable:'TotalAvailableQuantity'
    }
  }
}

async function getWarehouseStockByProductNumber(warehouseId,productNumber,{mappingType='STORE'}={}){
  const entity=stockEntity(),fields=stockFields();
  if(!warehouseId)return {warehouseId:null,dataAreaId:config.dynamics.dataAreaId||null,rowCount:0,onHandQuantity:null,availableOnHandQuantity:null,reservedOnHandQuantity:null,orderedQuantity:null,availableOrderedQuantity:null,reservedOrderedQuantity:null,onOrderQuantity:null,totalAvailableQuantity:null,source:'UNMAPPED_D365',mappingRequired:true,mappingType};
  if(!stockLive())return {warehouseId,dataAreaId:config.dynamics.dataAreaId||null,rowCount:0,onHandQuantity:null,availableOnHandQuantity:null,reservedOnHandQuantity:null,orderedQuantity:null,availableOrderedQuantity:null,reservedOrderedQuantity:null,onOrderQuantity:null,totalAvailableQuantity:null,source:'SIMULATED_D365',mappingType};
  const filters=[`${fields.item} eq '${escapeOData(productNumber)}'`,`${fields.warehouse} eq '${escapeOData(warehouseId)}'`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  const payload=await odataGet(entity,{filter:filters.join(' and '),top:1000,extra:config.dynamics.dataAreaId?'cross-company=true':''}),rows=Array.isArray(payload?.value)?payload.value:[],sum=field=>rows.reduce((s,r)=>s+n(r[field]),0);
  return {warehouseId,dataAreaId:rows[0]?.[config.dynamics.dataAreaField]||rows[0]?.dataAreaId||config.dynamics.dataAreaId||null,rowCount:rows.length,onHandQuantity:sum(fields.onHand),availableOnHandQuantity:sum(fields.availableOnHand),reservedOnHandQuantity:sum('ReservedOnHandQuantity'),orderedQuantity:sum('OrderedQuantity'),availableOrderedQuantity:sum('AvailableOrderedQuantity'),reservedOrderedQuantity:sum('ReservedOrderedQuantity'),onOrderQuantity:sum('OnOrderQuantity'),totalAvailableQuantity:sum('TotalAvailableQuantity'),source:`D365/${entity}`,mappingType}
}

export async function getStoreStockByProductNumber(storeId,productNumber){return getWarehouseStockByProductNumber(mappedWarehouseForStore(storeId),productNumber,{mappingType:'STORE'})}
export async function getSupplyStockByProductNumber(storeId,productNumber){return getWarehouseStockByProductNumber(supplyWarehouseForStore(storeId),productNumber,{mappingType:'SUPPLY'})}

export async function getStoreProductByEan(storeId,ean){
  const product=await getProductByEan(ean);if(!product)return null;
  const stock=await getStoreStockByProductNumber(storeId,product.productNumber);
  if(!stockLive())return {...product,warehouseId:stock.warehouseId,stockSource:stock.source};
  if(stock.mappingRequired)return {...product,warehouseId:null,stock:null,availableStock:null,stockSource:stock.source,stockMappingRequired:true};
  return {...product,stock:stock.onHandQuantity,availableStock:stock.availableOnHandQuantity,reservedStock:stock.reservedOnHandQuantity,orderedStock:stock.orderedQuantity,availableOrderedStock:stock.availableOrderedQuantity,reservedOrderedStock:stock.reservedOrderedQuantity,onOrderStock:stock.onOrderQuantity,totalAvailableStock:stock.totalAvailableQuantity,warehouseId:stock.warehouseId,stockRowCount:stock.rowCount,stockSource:stock.source}
}

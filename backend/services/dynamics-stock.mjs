import { config } from '../config.mjs';
import { getProductByEan,odataGet } from './dynamics.mjs';

export const STORE_WAREHOUSES=Object.freeze({
  'val-fleuri':'FRP0001',
  'trefle':'FRP0002'
});

export const STOCK_ENTITY='WarehousesOnHandV2';

function escapeOData(v){return String(v).replaceAll("'","''")}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}

export function warehouseForStore(storeId){
  const warehouseId=STORE_WAREHOUSES[String(storeId||'')];
  if(!warehouseId)throw Object.assign(new Error(`Warehouse Dynamics non mappé pour le magasin ${storeId}.`),{status:503,code:'D365_STORE_WAREHOUSE_NOT_MAPPED',details:{storeId}});
  return warehouseId;
}

export function stockIntegrationConfig(){
  return {
    entity:STOCK_ENTITY,
    dataAreaId:config.dynamics.dataAreaId||null,
    stores:Object.entries(STORE_WAREHOUSES).map(([storeId,warehouseId])=>({storeId,warehouseId})),
    fields:{
      item:'ItemNumber',
      warehouse:'InventoryWarehouseId',
      onHand:'OnHandQuantity',
      availableOnHand:'AvailableOnHandQuantity',
      reservedOnHand:'ReservedOnHandQuantity',
      onOrder:'OnOrderQuantity',
      totalAvailable:'TotalAvailableQuantity'
    }
  };
}

export async function getStoreStockByProductNumber(storeId,productNumber){
  const warehouseId=warehouseForStore(storeId);
  if(config.dynamics.mode!=='live'){
    return {warehouseId,dataAreaId:config.dynamics.dataAreaId||null,rowCount:0,onHandQuantity:null,availableOnHandQuantity:null,reservedOnHandQuantity:null,onOrderQuantity:null,totalAvailableQuantity:null,source:'SIMULATED_D365'};
  }
  const filters=[
    `ItemNumber eq '${escapeOData(productNumber)}'`,
    `InventoryWarehouseId eq '${escapeOData(warehouseId)}'`
  ];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  const payload=await odataGet(STOCK_ENTITY,{filter:filters.join(' and '),top:1000,extra:config.dynamics.dataAreaId?'cross-company=true':''});
  const rows=Array.isArray(payload?.value)?payload.value:[];
  const sum=field=>rows.reduce((s,r)=>s+n(r[field]),0);
  return {
    warehouseId,
    dataAreaId:rows[0]?.dataAreaId||config.dynamics.dataAreaId||null,
    rowCount:rows.length,
    onHandQuantity:sum('OnHandQuantity'),
    availableOnHandQuantity:sum('AvailableOnHandQuantity'),
    reservedOnHandQuantity:sum('ReservedOnHandQuantity'),
    onOrderQuantity:sum('OnOrderQuantity'),
    totalAvailableQuantity:sum('TotalAvailableQuantity'),
    source:`D365/${STOCK_ENTITY}`
  };
}

export async function getStoreProductByEan(storeId,ean){
  const product=await getProductByEan(ean);
  if(!product)return null;
  const stock=await getStoreStockByProductNumber(storeId,product.productNumber);
  if(config.dynamics.mode!=='live')return {...product,warehouseId:stock.warehouseId,stockSource:stock.source};
  return {
    ...product,
    stock:stock.onHandQuantity,
    availableStock:stock.availableOnHandQuantity,
    reservedStock:stock.reservedOnHandQuantity,
    onOrderStock:stock.onOrderQuantity,
    totalAvailableStock:stock.totalAvailableQuantity,
    warehouseId:stock.warehouseId,
    stockRowCount:stock.rowCount,
    stockSource:stock.source
  };
}

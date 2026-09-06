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

export function warehouseForStore(storeId){
  const key=String(storeId||'');
  const warehouseId=config.dynamics.stock.storeWarehouses?.[key]||STORE_WAREHOUSES[key];
  if(!warehouseId)throw Object.assign(new Error(`Warehouse Dynamics non mappé pour le magasin ${storeId}.`),{status:503,code:'D365_STORE_WAREHOUSE_NOT_MAPPED',details:{storeId}});
  return warehouseId;
}

export function stockIntegrationConfig(){
  const fields=stockFields(),stores={...STORE_WAREHOUSES,...(config.dynamics.stock.storeWarehouses||{})};
  return {
    mode:stockLive()?'LIVE':'SIMULATED',
    entity:stockEntity(),
    dataAreaId:config.dynamics.dataAreaId||null,
    stores:Object.entries(stores).map(([storeId,warehouseId])=>({storeId,warehouseId})),
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
  };
}

export async function getStoreStockByProductNumber(storeId,productNumber){
  const warehouseId=warehouseForStore(storeId),entity=stockEntity(),fields=stockFields();
  if(!stockLive()){
    return {warehouseId,dataAreaId:config.dynamics.dataAreaId||null,rowCount:0,onHandQuantity:null,availableOnHandQuantity:null,reservedOnHandQuantity:null,orderedQuantity:null,availableOrderedQuantity:null,reservedOrderedQuantity:null,onOrderQuantity:null,totalAvailableQuantity:null,source:'SIMULATED_D365'};
  }
  const filters=[
    `${fields.item} eq '${escapeOData(productNumber)}'`,
    `${fields.warehouse} eq '${escapeOData(warehouseId)}'`
  ];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  const payload=await odataGet(entity,{filter:filters.join(' and '),top:1000,extra:config.dynamics.dataAreaId?'cross-company=true':''});
  const rows=Array.isArray(payload?.value)?payload.value:[];
  const sum=field=>rows.reduce((s,r)=>s+n(r[field]),0);
  return {
    warehouseId,
    dataAreaId:rows[0]?.[config.dynamics.dataAreaField]||rows[0]?.dataAreaId||config.dynamics.dataAreaId||null,
    rowCount:rows.length,
    onHandQuantity:sum(fields.onHand),
    availableOnHandQuantity:sum(fields.availableOnHand),
    reservedOnHandQuantity:sum('ReservedOnHandQuantity'),
    orderedQuantity:sum('OrderedQuantity'),
    availableOrderedQuantity:sum('AvailableOrderedQuantity'),
    reservedOrderedQuantity:sum('ReservedOrderedQuantity'),
    onOrderQuantity:sum('OnOrderQuantity'),
    totalAvailableQuantity:sum('TotalAvailableQuantity'),
    source:`D365/${entity}`
  };
}

export async function getStoreProductByEan(storeId,ean){
  const product=await getProductByEan(ean);
  if(!product)return null;
  const stock=await getStoreStockByProductNumber(storeId,product.productNumber);
  if(!stockLive())return {...product,warehouseId:stock.warehouseId,stockSource:stock.source};
  return {
    ...product,
    stock:stock.onHandQuantity,
    availableStock:stock.availableOnHandQuantity,
    reservedStock:stock.reservedOnHandQuantity,
    orderedStock:stock.orderedQuantity,
    availableOrderedStock:stock.availableOrderedQuantity,
    reservedOrderedStock:stock.reservedOrderedQuantity,
    onOrderStock:stock.onOrderQuantity,
    totalAvailableStock:stock.totalAvailableQuantity,
    warehouseId:stock.warehouseId,
    stockRowCount:stock.rowCount,
    stockSource:stock.source
  };
}

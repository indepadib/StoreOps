import { config } from '../config.mjs';
import { odataGetAll } from './dynamics.mjs';
import { STORE_WAREHOUSES,STOCK_ENTITY } from './dynamics-stock.mjs';
import { assortmentIndex,classifyAvailability } from './assortment.mjs';

const clean=v=>String(v??'').trim();
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const validField=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
const esc=v=>String(v).replaceAll("'","''");

function requireField(name,value){
  if(!validField(value))throw Object.assign(new Error(`${name} non configuré ou invalide`),{status:503,code:'D365_STOCK_MAPPING_REQUIRED',details:{field:name}});
  return clean(value);
}

function simulated(storeId){
  if(storeId!=='val-fleuri')return {source:'SIMULATED',storeId,warehouse:STORE_WAREHOUSES[storeId]||null,items:[],summary:{total:0,negative:0,outOfStock:0,residualOutsideAssortment:0,assortmentReady:false},checkedAt:new Date().toISOString()};
  const items=[
    {id:'sim-neg-coca',type:'NEGATIVE',priority:'P0',product:'Coca-Cola 1,5L',productNumber:'COCA15',ean:'5449000000996',qty:-3,availableQty:-3,physicalQty:-3,warehouse:STORE_WAREHOUSES[storeId],assortmentStatus:'UNKNOWN',detail:'Stock disponible -3 · vérifier rayon + réserve puis lancer un inventaire ciblé'},
    {id:'sim-oos-eau',type:'OUT',priority:'P1',product:'Sidi Ali 1,5L',productNumber:'EAU15',ean:'6111000000011',qty:0,availableQty:0,physicalQty:0,warehouse:STORE_WAREHOUSES[storeId],assortmentStatus:'SIMULATED',detail:'Rupture simulée · stock disponible 0 · assortiment pilote simulé'},
    {id:'sim-oos-lait',type:'OUT',priority:'P1',product:'Lait UHT entier 1L',productNumber:'LAITUHT1',ean:'6111035000013',qty:0,availableQty:0,physicalQty:0,warehouse:STORE_WAREHOUSES[storeId],assortmentStatus:'SIMULATED',detail:'Rupture simulée · stock disponible 0 · assortiment pilote simulé'}
  ];
  return {source:'SIMULATED',storeId,warehouse:STORE_WAREHOUSES[storeId],items,summary:{total:items.length,negative:1,outOfStock:2,residualOutsideAssortment:0,assortmentReady:false},checkedAt:new Date().toISOString()};
}

function aggregateRows(rows,c){
  const byProduct=new Map();
  for(const row of rows||[]){
    const productNumber=clean(row[c.productField]);if(!productNumber)continue;
    const current=byProduct.get(productNumber)||{productNumber,product:clean(c.nameField?row[c.nameField]:'')||productNumber,ean:clean(c.eanField?row[c.eanField]:'')||null,availableQty:0,physicalQty:0,rowCount:0};
    current.availableQty+=num(row[c.availableField]);
    current.physicalQty+=c.physicalField?num(row[c.physicalField]):num(row[c.availableField]);
    current.rowCount+=1;
    if(!current.ean&&c.eanField)current.ean=clean(row[c.eanField])||null;
    if((!current.product||current.product===productNumber)&&c.nameField)current.product=clean(row[c.nameField])||productNumber;
    byProduct.set(productNumber,current);
  }
  return [...byProduct.values()];
}

function signalFromClassification(x,warehouse,classification){
  const available=Math.round((num(x.availableQty)+Number.EPSILON)*1000)/1000;
  const physical=Math.round((num(x.physicalQty)+Number.EPSILON)*1000)/1000;
  const assortmentStatus=classification.membership?.status||'UNKNOWN';
  if(classification.state==='STOCK_ANOMALY')return {id:`neg-${warehouse}-${x.productNumber}`,type:'NEGATIVE',priority:'P0',product:x.product,productNumber:x.productNumber,ean:x.ean,qty:available,availableQty:available,physicalQty:physical,warehouse,assortmentStatus,detail:`Stock disponible ${available} · anomalie système à contrôler immédiatement`};
  if(classification.state==='OUT_OF_STOCK')return {id:`oos-${warehouse}-${x.productNumber}`,type:'OUT',priority:'P1',product:x.product,productNumber:x.productNumber,ean:x.ean,qty:0,availableQty:0,physicalQty:physical,warehouse,assortmentStatus,detail:'Rupture assortiment · stock disponible 0 · vérifier rayon, réserve et réapprovisionnement'};
  if(classification.state==='RESIDUAL_STOCK_OUTSIDE_ASSORTMENT')return {id:`residual-${warehouse}-${x.productNumber}`,type:'OUTSIDE_ASSORTMENT',priority:'P2',product:x.product,productNumber:x.productNumber,ean:x.ean,qty:available,availableQty:available,physicalQty:physical,warehouse,assortmentStatus,detail:`${available} unité(s) en stock sur un article hors assortiment · traiter transfert, retour ou sortie commerciale selon politique`};
  return null;
}

export async function getStockSignals(storeId,{businessDate=null}={}){
  if(config.dynamics.mode!=='live'||config.dynamics.read?.stock!=='live')return simulated(storeId);
  const c=config.dynamics.stock||{};
  const entity=clean(c.entity)||STOCK_ENTITY;
  if(!/^[A-Za-z0-9_]+$/.test(entity))throw Object.assign(new Error('D365_STOCK_ENTITY invalide'),{status:503,code:'D365_STOCK_MAPPING_INVALID'});
  const warehouse=clean(c.storeWarehouses?.[storeId]||STORE_WAREHOUSES[storeId]);
  if(!warehouse)return {source:'UNMAPPED_D365',storeId,warehouse:null,mappingRequired:true,items:[],summary:{total:0,negative:0,outOfStock:0,residualOutsideAssortment:0,assortmentReady:false},checkedAt:new Date().toISOString()};

  const productField=requireField('D365_STOCK_PRODUCT_FIELD',c.productField||'ItemNumber');
  const availableField=requireField('D365_STOCK_AVAILABLE_FIELD',c.availableField||'AvailableOnHandQuantity');
  const warehouseField=requireField('D365_STOCK_WAREHOUSE_FIELD',c.warehouseField||'InventoryWarehouseId');
  const physicalField=clean(c.physicalField||'OnHandQuantity');if(physicalField&&!validField(physicalField))throw Object.assign(new Error('D365_STOCK_PHYSICAL_FIELD invalide'),{status:503,code:'D365_STOCK_MAPPING_INVALID'});
  const nameField=clean(c.nameField);if(nameField&&!validField(nameField))throw Object.assign(new Error('D365_STOCK_NAME_FIELD invalide'),{status:503,code:'D365_STOCK_MAPPING_INVALID'});
  const eanField=clean(c.eanField);if(eanField&&!validField(eanField))throw Object.assign(new Error('D365_STOCK_EAN_FIELD invalide'),{status:503,code:'D365_STOCK_MAPPING_INVALID'});

  const filters=[`${warehouseField} eq '${esc(warehouse)}'`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
  const select=[productField,availableField,physicalField,nameField,eanField,warehouseField,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
  const fetched=await odataGetAll(entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize||config.dynamics.odataPageSize,maxRows:c.maxRows||config.dynamics.odataMaxRows});
  const aggregated=aggregateRows(fetched.value,{productField,availableField,physicalField,nameField,eanField});
  const index=assortmentIndex(storeId,{businessDate});
  const classified=aggregated.map(x=>({product:x,classification:classifyAvailability({storeId,productNumber:x.productNumber,availableQty:x.availableQty,businessDate,index})}));
  const allSignals=classified.map(({product,classification})=>signalFromClassification(product,warehouse,classification)).filter(Boolean);
  const negative=allSignals.filter(x=>x.type==='NEGATIVE').sort((a,b)=>a.availableQty-b.availableQty);
  const out=allSignals.filter(x=>x.type==='OUT').slice(0,Math.max(1,Number(c.maxOutOfStock)||100));
  const residual=allSignals.filter(x=>x.type==='OUTSIDE_ASSORTMENT');
  const unknownZero=classified.filter(x=>x.classification.state==='ASSORTMENT_UNKNOWN'&&Number(x.product.availableQty)===0).length;
  const items=[...negative,...out,...residual];
  return {source:`D365/${entity}`,storeId,warehouse,checkedAt:new Date().toISOString(),entity,items,summary:{total:items.length,negative:negative.length,outOfStock:out.length,residualOutsideAssortment:residual.length,assortmentUnknownZero:unknownZero,assortmentReady:index.status==='READY',assortmentSyncedAt:index.syncedAt||null,activeAssortments:index.assortments?.length||0,aggregatedProducts:aggregated.length,rowsRead:fetched.rowCount,pages:fetched.pages,truncated:!!fetched.truncated}};
}

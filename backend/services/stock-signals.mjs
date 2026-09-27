import { config } from '../config.mjs';
import { db } from '../db.mjs';
import { odataGetAll } from './dynamics.mjs';
import { STORE_WAREHOUSES,STOCK_ENTITY,supplyWarehouseForStore } from './dynamics-stock.mjs';
import { storeOperationalSettings } from './store-settings.mjs';
import { assortmentIndex } from './assortment-resolver.mjs';
import { classifyAvailability } from './assortment.mjs';
import { readStoreSalesActivityWindow } from './dynamics-sales.mjs';

const clean=v=>String(v??'').trim();
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const validField=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
const esc=v=>String(v).replaceAll("'","''");
const assortmentMaxAgeHours=()=>Math.max(1,Math.min(24*30,Number(process.env.STOREOPS_ASSORTMENT_MAX_AGE_HOURS)||36));
const stockSignalsCacheSeconds=()=>Math.max(30,Math.min(3600,Number(process.env.STOREOPS_STOCK_SIGNALS_CACHE_SECONDS)||900));
const lowCoverageDays=()=>Math.max(.5,Math.min(14,Number(process.env.STOREOPS_LOW_COVERAGE_DAYS)||2.5));
const signalCache=new Map();
const signalInflight=new Map();

function requireField(name,value){
  if(!validField(value))throw Object.assign(new Error(`${name} non configuré ou invalide`),{status:503,code:'D365_STOCK_MAPPING_REQUIRED',details:{field:name}});
  return clean(value)
}

function simulated(storeId){
  const warehouse=storeOperationalSettings(storeId).storeWarehouseId||STORE_WAREHOUSES[storeId]||null;
  if(storeId!=='val-fleuri')return {source:'SIMULATED',storeId,warehouse,items:[],summary:{total:0,negative:0,outOfStock:0,residualOutsideAssortment:0,assortmentReady:false},checkedAt:new Date().toISOString()};
  const items=[
    {id:'sim-neg-coca',type:'NEGATIVE',priority:'P0',product:'Coca-Cola 1,5L',productNumber:'COCA15',ean:'5449000000996',qty:-3,availableQty:-3,physicalQty:-3,warehouse,assortmentStatus:'UNKNOWN',detail:'Stock disponible -3 · vérifier rayon + réserve puis lancer un inventaire ciblé'},
    {id:'sim-oos-eau',type:'OUT',priority:'P1',product:'Sidi Ali 1,5L',productNumber:'EAU15',ean:'6111000000011',qty:0,availableQty:0,physicalQty:0,warehouse,assortmentStatus:'SIMULATED',detail:'Rupture simulée · stock disponible 0 · assortiment pilote simulé'},
    {id:'sim-oos-lait',type:'OUT',priority:'P1',product:'Lait UHT entier 1L',productNumber:'LAITUHT1',ean:'6111035000013',qty:0,availableQty:0,physicalQty:0,warehouse,assortmentStatus:'SIMULATED',detail:'Rupture simulée · stock disponible 0 · assortiment pilote simulé'}
  ];
  return {source:'SIMULATED',storeId,warehouse,items,summary:{total:items.length,negative:1,outOfStock:2,residualOutsideAssortment:0,assortmentReady:false},checkedAt:new Date().toISOString()}
}

function supplierHistory(){
  const map=new Map();
  try{
    const rows=db.prepare(`SELECT rl.product_number productNumber,r.vendor supplier,r.source_vendor_account supplierAccount,COALESCE(r.source_updated_at,r.created_at) seenAt
      FROM receipt_lines rl JOIN receipts r ON r.id=rl.receipt_id
      WHERE r.document_type='PO' AND rl.product_number IS NOT NULL AND TRIM(rl.product_number)<>'' AND r.vendor IS NOT NULL
      ORDER BY COALESCE(r.source_updated_at,r.created_at) DESC LIMIT 20000`).all();
    for(const row of rows){const key=clean(row.productNumber);if(key&&!map.has(key))map.set(key,{supplier:clean(row.supplier)||null,supplierAccount:clean(row.supplierAccount)||null,supplierSource:'LAST_STORE_PO'})}
  }catch{}
  return map
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
  return [...byProduct.values()]
}

function signalFromClassification(x,warehouse,classification){
  const available=Math.round((num(x.availableQty)+Number.EPSILON)*1000)/1000;
  const physical=Math.round((num(x.physicalQty)+Number.EPSILON)*1000)/1000;
  const assortmentStatus=classification.membership?.status||'UNKNOWN';
  if(classification.state==='STOCK_ANOMALY')return {id:`neg-${warehouse}-${x.productNumber}`,type:'NEGATIVE',priority:'P0',product:x.product,productNumber:x.productNumber,ean:x.ean,qty:available,availableQty:available,physicalQty:physical,warehouse,assortmentStatus,detail:`Stock disponible ${available} · anomalie système à contrôler immédiatement`};
  if(classification.state==='OUT_OF_STOCK')return {id:`oos-${warehouse}-${x.productNumber}`,type:'OUT',priority:'P1',product:x.product,productNumber:x.productNumber,ean:x.ean,qty:0,availableQty:0,physicalQty:physical,warehouse,assortmentStatus,detail:'Rupture assortiment · stock disponible 0 · vérifier rayon, réserve et réapprovisionnement'};
  if(classification.state==='RESIDUAL_STOCK_OUTSIDE_ASSORTMENT')return {id:`residual-${warehouse}-${x.productNumber}`,type:'OUTSIDE_ASSORTMENT',priority:'P2',product:x.product,productNumber:x.productNumber,ean:x.ean,qty:available,availableQty:available,physicalQty:physical,warehouse,assortmentStatus,detail:`${available} unité(s) en stock sur un article hors assortiment · traiter transfert, retour ou sortie commerciale selon politique`};
  return null
}

async function computeStockSignals(storeId,{businessDate=null}={}){
  if(config.dynamics.mode!=='live'||config.dynamics.read?.stock!=='live')return simulated(storeId);
  const c=config.dynamics.stock||{},entity=clean(c.entity)||STOCK_ENTITY;
  if(!/^[A-Za-z0-9_]+$/.test(entity))throw Object.assign(new Error('D365_STOCK_ENTITY invalide'),{status:503,code:'D365_STOCK_MAPPING_INVALID'});
  const warehouse=clean(storeOperationalSettings(storeId).storeWarehouseId);
  if(!warehouse)return {source:'UNMAPPED_D365',storeId,warehouse:null,mappingRequired:true,items:[],summary:{total:0,negative:0,outOfStock:0,residualOutsideAssortment:0,assortmentReady:false},checkedAt:new Date().toISOString()};

  const productField=requireField('D365_STOCK_PRODUCT_FIELD',c.productField||'ItemNumber');
  const availableField=requireField('D365_STOCK_AVAILABLE_FIELD',c.availableField||'AvailableOnHandQuantity');
  const warehouseField=requireField('D365_STOCK_WAREHOUSE_FIELD',c.warehouseField||'InventoryWarehouseId');
  const physicalField=clean(c.physicalField||'OnHandQuantity');if(physicalField&&!validField(physicalField))throw Object.assign(new Error('D365_STOCK_PHYSICAL_FIELD invalide'),{status:503,code:'D365_STOCK_MAPPING_INVALID'});
  const nameField=clean(c.nameField);if(nameField&&!validField(nameField))throw Object.assign(new Error('D365_STOCK_NAME_FIELD invalide'),{status:503,code:'D365_STOCK_MAPPING_INVALID'});
  const eanField=clean(c.eanField);if(eanField&&!validField(eanField))throw Object.assign(new Error('D365_STOCK_EAN_FIELD invalide'),{status:503,code:'D365_STOCK_MAPPING_INVALID'});

  const filters=[`${warehouseField} eq '${esc(warehouse)}'`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
  const supplyWarehouse=clean(supplyWarehouseForStore(storeId));
  const supplyFilters=supplyWarehouse?[`${warehouseField} eq '${esc(supplyWarehouse)}'`]:[];
  if(supplyWarehouse&&config.dynamics.dataAreaId)supplyFilters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
  const select=[productField,availableField,physicalField,nameField,eanField,warehouseField,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
  const requestOpts={select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize||config.dynamics.odataPageSize,maxRows:c.maxRows||config.dynamics.odataMaxRows};
  const stockPromise=odataGetAll(entity,{filter:filters.join(' and '),...requestOpts});
  const supplyPromise=supplyWarehouse?odataGetAll(entity,{filter:supplyFilters.join(' and '),...requestOpts}):Promise.resolve({value:[],rowCount:0,pages:0,truncated:false});
  const salesPromise=readStoreSalesActivityWindow(storeId,{businessDate:businessDate||new Date().toISOString().slice(0,10),days:30});
  const [stockResult,supplyResult,salesResult]=await Promise.allSettled([stockPromise,supplyPromise,salesPromise]);
  if(stockResult.status==='rejected')throw stockResult.reason;
  const fetched=stockResult.value;
  const supplyFetched=supplyResult.status==='fulfilled'?supplyResult.value:{value:[],rowCount:0,pages:0,truncated:false,error:supplyResult.reason?.message||String(supplyResult.reason||'')};
  const supplyReadReady=!!supplyWarehouse&&supplyResult.status==='fulfilled'&&!supplyFetched.truncated;
  const salesActivity=salesResult.status==='fulfilled'?salesResult.value:{status:'UNAVAILABLE',products:[],error:{code:salesResult.reason?.code||'D365_SALES_ACTIVITY_READ_FAILED',message:salesResult.reason?.message||String(salesResult.reason||'')}};
  const aggregated=aggregateRows(fetched.value,{productField,availableField,physicalField,nameField,eanField});
  const supplyAggregated=aggregateRows(supplyFetched.value,{productField,availableField,physicalField,nameField,eanField});
  const supplyByProduct=new Map(supplyAggregated.map(x=>[clean(x.productNumber),x]));
  const suppliers=supplierHistory();
  const maxAgeHours=assortmentMaxAgeHours(),index=assortmentIndex(storeId,{businessDate,maxAgeHours});
  const classified=aggregated.map(x=>({product:x,classification:classifyAvailability({storeId,productNumber:x.productNumber,availableQty:x.availableQty,businessDate,index,maxAgeHours})}));
  const allSignals=classified.map(({product,classification})=>signalFromClassification(product,warehouse,classification)).filter(Boolean);
  const salesByProduct=new Map((salesActivity?.products||[]).map(x=>[clean(x.productNumber),x]));
  const enrich=x=>{const sale=salesByProduct.get(clean(x.productNumber)),supply=supplyByProduct.get(clean(x.productNumber)),supplier=suppliers.get(clean(x.productNumber))||{},centralStock=supply?Math.round((num(supply.availableQty)+Number.EPSILON)*1000)/1000:(supplyReadReady?0:null);return{...x,sold30d:!!sale,salesValue30d:Number(sale?.salesValue||0),salesUnits30:Number(sale?.units||0),dailySales:Number(sale?.units||0)>0?Math.round((Number(sale.units)/30+Number.EPSILON)*1000)/1000:null,lastSaleDate:sale?.lastSaleDate||null,centralStock,supplyWarehouse:supplyWarehouse||null,supplyReadStatus:supplyReadReady?'READY':supplyWarehouse?'UNAVAILABLE':'UNMAPPED',...supplier}};
  const negativeAll=allSignals.filter(x=>x.type==='NEGATIVE').map(enrich).sort((a,b)=>Number(b.sold30d)-Number(a.sold30d)||Number(b.salesValue30d)-Number(a.salesValue30d)||a.availableQty-b.availableQty);
  const residualAll=allSignals.filter(x=>x.type==='OUTSIDE_ASSORTMENT');
  const unknownZero=classified.filter(x=>x.classification.state==='ASSORTMENT_UNKNOWN'&&Number(x.product.availableQty)===0).length;
  const stockByProduct=new Map(aggregated.map(x=>[clean(x.productNumber),x]));
  const ruptureReady=salesActivity?.status==='READY'&&!fetched.truncated;
  const outAll=ruptureReady?(salesActivity.products||[]).map(sale=>{
    const productNumber=clean(sale.productNumber),stock=stockByProduct.get(productNumber),available=stock?Math.round((num(stock.availableQty)+Number.EPSILON)*1000)/1000:0,physical=stock?Math.round((num(stock.physicalQty)+Number.EPSILON)*1000)/1000:0;
    if(index.status==='READY'&&!index.included.has(productNumber))return null;
    if(available!==0)return null;
    return enrich({id:`oos30-${warehouse}-${productNumber}`,type:'OUT',priority:'P1',product:clean(stock?.product)||clean(sale.name)||productNumber,productNumber,ean:stock?.ean||null,qty:0,availableQty:0,physicalQty:physical,warehouse,assortmentStatus:index.status==='READY'?'ASSORTED':'UNKNOWN',ruptureBasis:'SALES_30D_ZERO_STOCK',salesWindowDays:30,stockEvidence:stock?'WAREHOUSE_SNAPSHOT':'NO_ON_HAND_ROW',detail:'Vendu sur les 30 derniers jours · stock disponible magasin 0 · rupture à traiter'});
  }).filter(Boolean):[];
  const lowThreshold=lowCoverageDays();
  const lowAll=ruptureReady?(salesActivity.products||[]).map(sale=>{
    const productNumber=clean(sale.productNumber),stock=stockByProduct.get(productNumber);if(!stock)return null;
    if(index.status==='READY'&&!index.included.has(productNumber))return null;
    const available=Math.round((num(stock.availableQty)+Number.EPSILON)*1000)/1000,daily=Number(sale.units||0)/30;if(!(available>0)||!(daily>0))return null;
    const cover=Math.round((available/daily+Number.EPSILON)*100)/100;if(cover>lowThreshold)return null;
    return enrich({id:`low30-${warehouse}-${productNumber}`,type:'LOW',priority:cover<=1?'P0':'P1',product:clean(stock.product)||clean(sale.name)||productNumber,productNumber,ean:stock.ean||null,qty:available,availableQty:available,physicalQty:Math.round((num(stock.physicalQty)+Number.EPSILON)*1000)/1000,warehouse,assortmentStatus:index.status==='READY'?'ASSORTED':'UNKNOWN',ruptureBasis:'SALES_30D_LOW_COVERAGE',salesWindowDays:30,coverageDays:cover,detail:`Proche rupture · environ ${cover} jour(s) de couverture au rythme récent`});
  }).filter(Boolean).sort((a,b)=>Number(a.coverageDays)-Number(b.coverageDays)||Number(b.salesValue30d)-Number(a.salesValue30d)):[];
  const negativeLimit=Math.max(5,Math.min(25,Number(process.env.STOREOPS_NEGATIVE_STOCK_PREVIEW_LIMIT)||12)),outLimit=Math.max(5,Math.min(50,Number(process.env.STOREOPS_RUPTURE_PREVIEW_LIMIT)||20)),lowLimit=Math.max(5,Math.min(50,Number(process.env.STOREOPS_LOW_STOCK_PREVIEW_LIMIT)||25)),residualLimit=Math.max(0,Math.min(20,Number(process.env.STOREOPS_RESIDUAL_STOCK_PREVIEW_LIMIT)||8));
  const negative=negativeAll.slice(0,negativeLimit),out=outAll.sort((a,b)=>Number(b.salesValue30d)-Number(a.salesValue30d)).slice(0,outLimit),low=lowAll.slice(0,lowLimit),residual=residualAll.slice(0,residualLimit),items=[...negative,...out,...low,...residual];
  const totalAnomalies=negativeAll.length+outAll.length+lowAll.length+residualAll.length;
  return {source:`D365/${entity}`,storeId,warehouse,supplyWarehouse:supplyWarehouse||null,checkedAt:new Date().toISOString(),entity,items,summary:{total:totalAnomalies,previewItems:items.length,hiddenItems:Math.max(0,totalAnomalies-items.length),negative:negativeAll.length,negativePreview:negative.length,negativeHidden:Math.max(0,negativeAll.length-negative.length),outOfStock:ruptureReady?outAll.length:null,outOfStockPreview:out.length,outOfStockHidden:ruptureReady?Math.max(0,outAll.length-out.length):null,nearOutOfStock:ruptureReady?lowAll.length:null,nearOutOfStockPreview:low.length,lowCoverageDays:lowThreshold,ruptureReady,ruptureMethod:'SALES_30D_ZERO_OR_LOW_COVERAGE',salesWindowDays:30,salesWindowStatus:salesActivity?.status||'UNAVAILABLE',salesWindowProducts:(salesActivity?.products||[]).length,salesWindowRows:salesActivity?.rowCount??null,salesWindowTruncated:!!salesActivity?.truncated,residualOutsideAssortment:residualAll.length,residualPreview:residual.length,assortmentUnknownZero:unknownZero,assortmentReady:index.status==='READY',assortmentState:index.status,assortmentModel:index.model||'SNAPSHOT',assortmentMaxAgeHours:maxAgeHours,assortmentSyncedAt:index.syncedAt||null,activeAssortments:index.assortments?.length||0,aggregatedProducts:aggregated.length,rowsRead:fetched.rowCount,pages:fetched.pages,truncated:!!fetched.truncated,supplyRowsRead:supplyFetched.rowCount||0,supplyTruncated:!!supplyFetched.truncated,supplyReadStatus:supplyReadReady?'READY':supplyWarehouse?'UNAVAILABLE':'UNMAPPED',supplyError:supplyResult.status==='rejected'?(supplyResult.reason?.message||String(supplyResult.reason||'')):null}}
}

export function peekStockSignals(storeId,{businessDate=null,allowStale=true}={}){
  const key=`${clean(storeId)}|${clean(businessDate)||'today'}`,cached=signalCache.get(key);
  if(!cached)return null;
  const fresh=Date.now()<cached.expiresAt;
  if(!fresh&&!allowStale)return null;
  return {...cached.value,cache:{status:fresh?'HIT':'STALE',ttlSeconds:stockSignalsCacheSeconds()}};
}

export async function getStockSignals(storeId,{businessDate=null,force=false}={}){
  const key=`${clean(storeId)}|${clean(businessDate)||'today'}`;
  const ttl=stockSignalsCacheSeconds()*1000,now=Date.now(),cached=signalCache.get(key);
  if(!force&&cached&&now<cached.expiresAt)return {...cached.value,cache:{status:'HIT',ttlSeconds:stockSignalsCacheSeconds()}};
  if(!force&&signalInflight.has(key))return signalInflight.get(key);

  const promise=(async()=>{
    const value=await computeStockSignals(storeId,{businessDate});
    signalCache.set(key,{value,expiresAt:Date.now()+ttl});
    return {...value,cache:{status:'MISS',ttlSeconds:stockSignalsCacheSeconds()}}
  })();
  signalInflight.set(key,promise);
  try{return await promise}finally{signalInflight.delete(key)}
}

import { db } from '../db.mjs';
import { getStockSignals,peekStockSignals } from './stock-signals.mjs';

const clean=v=>String(v??'').trim();
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>finite(v)?Number(v):0;
const targetDays=()=>Math.max(1,Math.min(14,Number(process.env.STOREOPS_WAREHOUSE_TARGET_DAYS)||5));
const round=v=>Math.round((Number(v||0)+Number.EPSILON)*1000)/1000;
const sourceTimeoutMs=()=>Math.max(2500,Math.min(6500,Number(process.env.STOREOPS_WAREHOUSE_SOURCE_TIMEOUT_MS)||4500));
async function boundedStockSignals(store,{businessDate,force}){const cached=!force?peekStockSignals(store.id,{businessDate,allowStale:true}):null;if(cached?.cache?.status==='HIT')return cached;let timer;try{return await Promise.race([getStockSignals(store.id,{businessDate,force}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Lecture Dynamics trop longue pour le cockpit.'),{code:'WAREHOUSE_SOURCE_TIMEOUT'})),sourceTimeoutMs())})])}catch(error){if(cached)return{...cached,cache:{...(cached.cache||{}),status:'STALE_FALLBACK'},degradedReason:error.code||'WAREHOUSE_SOURCE_TIMEOUT'};throw error}finally{if(timer)clearTimeout(timer)}}

function projectedNeed(row){
 const daily=Math.max(0,num(row.dailySales)),available=Math.max(0,num(row.availableQty));
 if(daily<=0)return row.type==='OUT'?1:0;
 return Math.max(1,Math.ceil(daily*targetDays()-available));
}

function groupRows(rows,keyFn,metaFn){
 const map=new Map();
 for(const row of rows){
  const key=keyFn(row);if(!key)continue;
  const cur=map.get(key)||{key,...metaFn(row),lines:[],lineCount:0,totalQty:0};
  cur.lines.push(row);cur.lineCount+=1;cur.totalQty=round(cur.totalQty+num(row.purchaseQty||row.transferQty||row.needQty));map.set(key,cur);
 }
 return [...map.values()].sort((a,b)=>b.totalQty-a.totalQty);
}

export async function warehouseControlSnapshot({businessDate=null,force=false}={}){
 const stores=db.prepare("SELECT id,code,name FROM stores WHERE active=1 ORDER BY name").all();
 const settled=await Promise.allSettled(stores.map(store=>boundedStockSignals(store,{businessDate,force})));
 const lines=[],storeSummaries=[];let sourceErrors=0;
 for(let i=0;i<stores.length;i++){
  const store=stores[i],result=settled[i];
  if(result.status!=='fulfilled'){sourceErrors++;storeSummaries.push({...store,status:'ERROR',error:result.reason?.message||String(result.reason||'')});continue}
  const data=result.value,items=data?.items||[],actionable=items.filter(x=>['OUT','LOW'].includes(x.type));
  let transfers=0,purchases=0,unknownSupply=0;
  for(const item of actionable){
   const needQty=projectedNeed(item),supplyMode=item.supplyMode||null,isDirect=supplyMode==='DIRECT_SUPPLIER',isDc=supplyMode==='WAREHOUSE',centralKnown=isDc&&finite(item.centralStock),centralStock=centralKnown?Math.max(0,num(item.centralStock)):null;
   const transferQty=isDc&&centralKnown?Math.min(needQty,centralStock):0,purchaseQty=isDirect?needQty:isDc&&centralKnown?Math.max(0,needQty-transferQty):null;
   const mode=isDirect?'DIRECT_PURCHASE':!isDc?'SOURCING_REQUIRED':!centralKnown?'SUPPLY_DATA_REQUIRED':purchaseQty>0&&transferQty>0?'TRANSFER_PLUS_DC_PURCHASE':purchaseQty>0?'DC_PURCHASE':'TRANSFER';
   if(transferQty>0)transfers++;if(purchaseQty>0)purchases++;if(['SUPPLY_DATA_REQUIRED','SOURCING_REQUIRED'].includes(mode))unknownSupply++;
   lines.push({storeId:store.id,storeCode:store.code,storeName:store.name,signalId:item.id,type:item.type,priority:item.priority,product:item.product,productNumber:item.productNumber,ean:item.ean||null,availableQty:item.availableQty,dailySales:item.dailySales??null,coverageDays:item.coverageDays??null,supplyMode,sourcingStatus:item.sourcingStatus||null,centralStock,supplyWarehouse:isDc?(item.supplyWarehouse||data.supplyWarehouse||'LVE Lakhya'):null,supplier:item.supplier||null,supplierAccount:item.supplierAccount||null,supplierSource:item.supplierSource||null,needQty,transferQty:round(transferQty),purchaseQty:purchaseQty==null?null:round(purchaseQty),mode,lastSaleDate:item.lastSaleDate||null,salesValue30d:item.salesValue30d??null});
  }
  storeSummaries.push({...store,status:'READY',ruptures:Number(data?.summary?.outOfStock||0),nearStockouts:Number(data?.summary?.nearOutOfStock||0),transfers,purchases,unknownSupply,source:data?.source||null});
 }

 const byProduct=new Map();
 for(const row of lines){
  const key=clean(row.productNumber)||clean(row.ean);if(!key)continue;
  const cur=byProduct.get(key)||{productNumber:row.productNumber,ean:row.ean,product:row.product,supplyMode:row.supplyMode,centralStock:row.centralStock,supplyWarehouse:row.supplyWarehouse,networkNeedQty:0,transferQty:0,purchaseQty:0,stores:new Set(),supplier:row.supplier,supplierAccount:row.supplierAccount};
  cur.networkNeedQty+=num(row.needQty);cur.transferQty+=num(row.transferQty);if(row.purchaseQty!==null)cur.purchaseQty+=num(row.purchaseQty);cur.stores.add(row.storeId);
  if(cur.centralStock===null&&row.centralStock!==null)cur.centralStock=row.centralStock;if(!cur.supplier&&row.supplier)cur.supplier=row.supplier;if(!cur.supplierAccount&&row.supplierAccount)cur.supplierAccount=row.supplierAccount;byProduct.set(key,cur);
 }
 const products=[...byProduct.values()].map(x=>({...x,networkNeedQty:round(x.networkNeedQty),transferQty:round(x.transferQty),purchaseQty:round(x.purchaseQty),storeCount:x.stores.size,stores:[...x.stores]})).sort((a,b)=>b.purchaseQty-a.purchaseQty||b.networkNeedQty-a.networkNeedQty);
 const purchaseLines=lines.filter(x=>Number(x.purchaseQty)>0),dcPurchaseLines=purchaseLines.filter(x=>x.supplyMode==='WAREHOUSE'),directPurchaseLines=purchaseLines.filter(x=>x.supplyMode==='DIRECT_SUPPLIER');
 const transferLines=lines.filter(x=>Number(x.transferQty)>0);
 const supplierGroups=groupRows(dcPurchaseLines,x=>clean(x.supplierAccount)||clean(x.supplier)||'A_AFFECTER',x=>({supplier:x.supplier||'À affecter',supplierAccount:x.supplierAccount||null,destinationWarehouse:x.supplyWarehouse||'LVE Lakhya'}));
 const directSupplierGroups=groupRows(directPurchaseLines,x=>`${x.storeId}:${clean(x.supplierAccount)||clean(x.supplier)||'A_AFFECTER'}`,x=>({storeId:x.storeId,storeCode:x.storeCode,storeName:x.storeName,supplier:x.supplier||'À affecter',supplierAccount:x.supplierAccount||null,destinationWarehouse:null}));
 const transferGroups=groupRows(transferLines,x=>x.storeId,x=>({storeId:x.storeId,storeCode:x.storeCode,storeName:x.storeName,sourceWarehouse:x.supplyWarehouse||null}));
 let expectedPO=0,expectedTO=0;try{expectedPO=db.prepare("SELECT COUNT(*) n FROM receipts WHERE document_type='PO' AND status='EXPECTED'").get()?.n||0;expectedTO=db.prepare("SELECT COUNT(*) n FROM receipts WHERE document_type='TO' AND status='EXPECTED'").get()?.n||0}catch{}
 return {status:sourceErrors===stores.length&&stores.length?'DEGRADED':'READY',businessDate:businessDate||new Date().toISOString().slice(0,10),refreshedAt:new Date().toISOString(),policy:{targetDays:targetDays()},metrics:{stores:stores.length,sourceErrors,ruptures:storeSummaries.reduce((a,x)=>a+num(x.ruptures),0),nearStockouts:storeSummaries.reduce((a,x)=>a+num(x.nearStockouts),0),transferLines:transferLines.length,purchaseLines:purchaseLines.length,dcPurchaseLines:dcPurchaseLines.length,directPurchaseLines:directPurchaseLines.length,supplierOrders:supplierGroups.length,directSupplierOrders:directSupplierGroups.length,unknownSupply:lines.filter(x=>['SUPPLY_DATA_REQUIRED','SOURCING_REQUIRED'].includes(x.mode)).length,expectedPO,expectedTO},stores:storeSummaries,products,lines,supplierGroups,directSupplierGroups,transferGroups};
}

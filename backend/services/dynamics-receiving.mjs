import { db,uid,todayISO } from '../db.mjs';
import { config } from '../config.mjs';
import { isD365ReadLive,odataGet,odataGetAll } from './dynamics.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v??'').replaceAll("'","''");
const dateOnly=v=>{const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null};
const unique=rows=>[...new Set(rows.map(clean).filter(Boolean))];
function chunks(rows,size=20){const out=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out}
function orFilter(field,values){return `(${values.map(v=>`${field} eq '${esc(v)}'`).join(' or ')})`}
function finite(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function companyFilter(){return config.dynamics.dataAreaId?`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`:''}
function withCompany(filter=''){return[filter,companyFilter()].filter(Boolean).join(' and ')}
function extraCompany(){return config.dynamics.dataAreaId?'cross-company=true':''}

function receiving(){return config.dynamics.receiving||{}}
function transferReceiving(){return config.dynamics.transferReceiving||{}}
function field(row,name,fallbacks=[]){for(const key of [name,...fallbacks].filter(Boolean)){if(row?.[key]!==undefined&&row?.[key]!==null)return row[key]}return null}
function selected(...fields){return unique(fields).join(',')}
function remainingFor(row,c){
  const explicit=c.remainingQtyField?finite(field(row,c.remainingQtyField,[])):null;
  if(explicit!==null)return Math.max(0,explicit);
  const ordered=finite(field(row,c.orderedQtyField,['OrderedPurchaseQuantity']));
  const received=c.receivedQtyField?finite(field(row,c.receivedQtyField,[])):null;
  if(ordered!==null&&received!==null)return Math.max(0,ordered-received);
  return null;
}
function purchaseLineOpen(row,c){
 const status=clean(field(row,c.lineStatusField,['PurchaseOrderLineStatus'])).toUpperCase();
 if(status)return !/(CANCEL|INVOICE|RECEIVED|CLOSED|FINALIZED)/.test(status);
 const remaining=remainingFor(row,c);
 return remaining==null||remaining>0
}
function temperatureRequired(category=''){return /frais|surgel/i.test(clean(category))?1:0}

db.exec(`
CREATE TABLE IF NOT EXISTS d365_receiving_sync_state(
 store_id TEXT PRIMARY KEY,
 warehouse_id TEXT NULL,
 last_attempt_at TEXT NULL,
 last_success_at TEXT NULL,
 last_error_at TEXT NULL,
 last_error_code TEXT NULL,
 last_error_message TEXT NULL,
 last_po_count INTEGER NULL,
 last_authoritative INTEGER NOT NULL DEFAULT 0,
 last_diagnostics_json TEXT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS d365_transfer_receiving_sync_state(
 store_id TEXT PRIMARY KEY,
 warehouse_id TEXT NULL,
 last_attempt_at TEXT NULL,
 last_success_at TEXT NULL,
 last_error_at TEXT NULL,
 last_error_code TEXT NULL,
 last_error_message TEXT NULL,
 last_to_count INTEGER NULL,
 last_authoritative INTEGER NOT NULL DEFAULT 0,
 last_diagnostics_json TEXT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function safeJson(raw,fallback=null){try{return raw?JSON.parse(raw):fallback}catch{return fallback}}
function receivingHealthMaxAgeMinutes(){return Math.max(15,Math.min(10080,Number(process.env.STOREOPS_RECEIVING_HEALTH_MAX_AGE_MINUTES)||1440))}
function isoMs(v){const n=v?Date.parse(String(v).replace(' ','T')+'Z'):NaN;return Number.isFinite(n)?n:null}
function storeWarehouse(storeId){const settings=storeOperationalSettings(storeId);return clean(settings?.storeWarehouseId||config.dynamics.stock?.storeWarehouses?.[storeId])||null}
function receivingStateForStore(storeId){
 const enabled=isD365ReadLive('receiving'),warehouseId=storeWarehouse(storeId),row=db.prepare(`SELECT * FROM d365_receiving_sync_state WHERE store_id=?`).get(storeId),base={storeId,warehouseId,enabled,lastAttemptAt:row?.last_attempt_at||null,lastSuccessAt:row?.last_success_at||null,lastErrorAt:row?.last_error_at||null,lastErrorCode:row?.last_error_code||null,lastErrorMessage:row?.last_error_message||null,lastPoCount:row?.last_po_count??null,lastAuthoritative:!!row?.last_authoritative,diagnostics:safeJson(row?.last_diagnostics_json,null),maxAgeMinutes:receivingHealthMaxAgeMinutes()};
 if(!enabled)return{...base,state:config.realOnly?'UNMAPPED':'SIMULATED',reason:'READ_MODE_DISABLED'};
 if(!warehouseId)return{...base,state:'LIVE_PENDING',reason:'WAREHOUSE_NOT_MAPPED'};
 if(!row?.last_success_at){
  if(row?.last_error_at)return{...base,state:'DEGRADED',reason:'SYNC_FAILED'};
  return{...base,state:'LIVE_PENDING',reason:'NEVER_SYNCED'};
 }
 const successMs=isoMs(row.last_success_at),errorMs=isoMs(row.last_error_at);
 if(errorMs&&(!successMs||errorMs>=successMs))return{...base,state:'DEGRADED',reason:'LATEST_SYNC_FAILED'};
 const ageMinutes=successMs==null?Infinity:Math.max(0,(Date.now()-successMs)/60000);
 if(!row.last_authoritative)return{...base,state:'DEGRADED',reason:'PARTIAL_SYNC',ageMinutes:Math.round(ageMinutes)};
 if(ageMinutes>receivingHealthMaxAgeMinutes())return{...base,state:'DEGRADED',reason:'STALE_SYNC',ageMinutes:Math.round(ageMinutes)};
 return{...base,state:'LIVE',reason:'SYNC_CONFIRMED',ageMinutes:Math.round(ageMinutes)}
}
function recordReceivingSuccess(storeId,snapshot,{authoritative=true}={}){
 const warehouseId=clean(snapshot?.warehouseId)||storeWarehouse(storeId),poCount=Array.isArray(snapshot?.items)?snapshot.items.length:0,diagnostics=JSON.stringify(snapshot?.diagnostics||{});
 db.prepare(`INSERT INTO d365_receiving_sync_state(store_id,warehouse_id,last_attempt_at,last_success_at,last_error_at,last_error_code,last_error_message,last_po_count,last_authoritative,last_diagnostics_json,updated_at)
 VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,NULL,NULL,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(store_id) DO UPDATE SET warehouse_id=excluded.warehouse_id,last_attempt_at=CURRENT_TIMESTAMP,last_success_at=CURRENT_TIMESTAMP,last_error_at=NULL,last_error_code=NULL,last_error_message=NULL,last_po_count=excluded.last_po_count,last_authoritative=excluded.last_authoritative,last_diagnostics_json=excluded.last_diagnostics_json,updated_at=CURRENT_TIMESTAMP`).run(storeId,warehouseId,poCount,authoritative?1:0,diagnostics)
}
function recordReceivingFailure(storeId,{warehouseId=null,code='D365_RECEIVING_SYNC_FAILED',message='Synchronisation D365 impossible.',diagnostics=null}={}){
 db.prepare(`INSERT INTO d365_receiving_sync_state(store_id,warehouse_id,last_attempt_at,last_error_at,last_error_code,last_error_message,last_authoritative,last_diagnostics_json,updated_at)
 VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,0,?,CURRENT_TIMESTAMP)
 ON CONFLICT(store_id) DO UPDATE SET warehouse_id=COALESCE(excluded.warehouse_id,d365_receiving_sync_state.warehouse_id),last_attempt_at=CURRENT_TIMESTAMP,last_error_at=CURRENT_TIMESTAMP,last_error_code=excluded.last_error_code,last_error_message=excluded.last_error_message,last_authoritative=0,last_diagnostics_json=excluded.last_diagnostics_json,updated_at=CURRENT_TIMESTAMP`).run(storeId,warehouseId||storeWarehouse(storeId),code,message,diagnostics?JSON.stringify(diagnostics):null)
}

function transferReceivingStateForStore(storeId){
 const enabled=isD365ReadLive('receiving'),warehouseId=storeWarehouse(storeId),row=db.prepare(`SELECT * FROM d365_transfer_receiving_sync_state WHERE store_id=?`).get(storeId),base={storeId,warehouseId,enabled,lastAttemptAt:row?.last_attempt_at||null,lastSuccessAt:row?.last_success_at||null,lastErrorAt:row?.last_error_at||null,lastErrorCode:row?.last_error_code||null,lastErrorMessage:row?.last_error_message||null,lastToCount:row?.last_to_count??null,lastAuthoritative:!!row?.last_authoritative,diagnostics:safeJson(row?.last_diagnostics_json,null),maxAgeMinutes:receivingHealthMaxAgeMinutes()};
 if(!enabled)return{...base,state:config.realOnly?'UNMAPPED':'SIMULATED',reason:'READ_MODE_DISABLED'};
 if(!warehouseId)return{...base,state:'LIVE_PENDING',reason:'WAREHOUSE_NOT_MAPPED'};
 if(!row?.last_success_at){
  if(row?.last_error_at)return{...base,state:'DEGRADED',reason:'SYNC_FAILED'};
  return{...base,state:'LIVE_PENDING',reason:'NEVER_SYNCED'};
 }
 const successMs=isoMs(row.last_success_at),errorMs=isoMs(row.last_error_at);
 if(errorMs&&(!successMs||errorMs>=successMs))return{...base,state:'DEGRADED',reason:'LATEST_SYNC_FAILED'};
 const ageMinutes=successMs==null?Infinity:Math.max(0,(Date.now()-successMs)/60000);
 if(!row.last_authoritative)return{...base,state:'DEGRADED',reason:'PARTIAL_SYNC',ageMinutes:Math.round(ageMinutes)};
 if(ageMinutes>receivingHealthMaxAgeMinutes())return{...base,state:'DEGRADED',reason:'STALE_SYNC',ageMinutes:Math.round(ageMinutes)};
 return{...base,state:'LIVE',reason:'SYNC_CONFIRMED',ageMinutes:Math.round(ageMinutes)}
}
function recordTransferReceivingSuccess(storeId,snapshot,{authoritative=true}={}){
 const warehouseId=clean(snapshot?.warehouseId)||storeWarehouse(storeId),count=Array.isArray(snapshot?.items)?snapshot.items.length:0,diagnostics=JSON.stringify(snapshot?.diagnostics||{});
 db.prepare(`INSERT INTO d365_transfer_receiving_sync_state(store_id,warehouse_id,last_attempt_at,last_success_at,last_error_at,last_error_code,last_error_message,last_to_count,last_authoritative,last_diagnostics_json,updated_at)
 VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,NULL,NULL,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(store_id) DO UPDATE SET warehouse_id=excluded.warehouse_id,last_attempt_at=CURRENT_TIMESTAMP,last_success_at=CURRENT_TIMESTAMP,last_error_at=NULL,last_error_code=NULL,last_error_message=NULL,last_to_count=excluded.last_to_count,last_authoritative=excluded.last_authoritative,last_diagnostics_json=excluded.last_diagnostics_json,updated_at=CURRENT_TIMESTAMP`).run(storeId,warehouseId,count,authoritative?1:0,diagnostics)
}
function recordTransferReceivingFailure(storeId,{warehouseId=null,code='D365_TRANSFER_RECEIVING_SYNC_FAILED',message='Synchronisation TO D365 impossible.',diagnostics=null}={}){
 db.prepare(`INSERT INTO d365_transfer_receiving_sync_state(store_id,warehouse_id,last_attempt_at,last_error_at,last_error_code,last_error_message,last_authoritative,last_diagnostics_json,updated_at)
 VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,0,?,CURRENT_TIMESTAMP)
 ON CONFLICT(store_id) DO UPDATE SET warehouse_id=COALESCE(excluded.warehouse_id,d365_transfer_receiving_sync_state.warehouse_id),last_attempt_at=CURRENT_TIMESTAMP,last_error_at=CURRENT_TIMESTAMP,last_error_code=excluded.last_error_code,last_error_message=excluded.last_error_message,last_authoritative=0,last_diagnostics_json=excluded.last_diagnostics_json,updated_at=CURRENT_TIMESTAMP`).run(storeId,warehouseId||storeWarehouse(storeId),code,message,diagnostics?JSON.stringify(diagnostics):null)
}

export function receivingIntegrationConfig(storeId=null){
 const c=receiving(),t=transferReceiving(),live=isD365ReadLive('receiving'),storeIds=storeId?[storeId]:db.prepare(`SELECT id FROM stores WHERE active=1 ORDER BY name`).all().map(x=>x.id),stores=Object.fromEntries(storeIds.map(id=>[id,receivingStateForStore(id)])),transferStores=Object.fromEntries(storeIds.map(id=>[id,transferReceivingStateForStore(id)]));
 return{
  mode:live?'LIVE':config.realOnly?'UNAVAILABLE':'SIMULATED',
  enabled:live,
  state:storeId?stores[storeId]?.state||'LIVE_PENDING':null,
  entity:{header:c.headerEntity||null,line:c.lineEntity||null},
  transferEntity:{header:t.headerEntity||null,line:t.lineEntity||null},
  storeWarehouses:Object.fromEntries(storeIds.map(id=>[id,storeWarehouse(id)]).filter(([,v])=>v)),
  stores,
  transferStores,
  fields:{
   purchaseOrder:c.purchaseOrderField,
   vendor:c.vendorField,
   vendorName:c.vendorNameField,
   creationDate:c.creationDateField,
   headerDate:c.headerDateField,
   headerStatus:c.headerStatusField,
   headerWarehouse:c.headerWarehouseField,
   lineNumber:c.lineNumberField,
   product:c.productField,
   description:c.descriptionField,
   barcode:c.barcodeField||null,
   category:c.categoryField||null,
   orderedQty:c.orderedQtyField,
   lineStatus:c.lineStatusField||null,
   receivedQty:c.receivedQtyField||null,
   remainingQty:c.remainingQtyField,
   unit:c.unitField,
   lineDate:c.lineDateField,
   warehouse:c.warehouseField
  }
 };
}

function syncTop(){return Math.max(50,Math.min(2000,Number(process.env.D365_PO_SYNC_TOP)||750))}
function headerEnrichmentLimit(){return Math.max(0,Math.min(500,Number(process.env.D365_PO_HEADER_ENRICH_LIMIT)||200))}
function oneMonthAgoISO(reference=todayISO()){const d=new Date(`${dateOnly(reference)||todayISO()}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,10)}
function openPoStatus(value){const s=clean(value).toUpperCase();return !/(CANCEL|CANCELED|CANCELLED|INVOICE|RECEIVED|CLOSED|FINALIZED)/.test(s)}
function syncTimeoutMs(){return Math.max(4000,Math.min(20000,Number(process.env.D365_PO_SYNC_TIMEOUT_MS)||12000))}
function withSyncTimeout(promise,documentType='PO'){const ms=syncTimeoutMs();return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error(`Synchronisation ${documentType} interrompue après ${ms} ms pour protéger StoreOps.`),{status:503,code:'D365_RECEIVING_SYNC_TIMEOUT',details:{timeoutMs:ms,documentType}})),ms))])}

async function purchaseOrderLinesForWarehouse(warehouseId){
 const c=receiving();
 if(!c.lineEntity)throw Object.assign(new Error('D365_PO_LINE_ENTITY non configuré.'),{status:503,code:'D365_RECEIVING_LINE_MAPPING_REQUIRED'});
 const top=syncTop(),warehouseCandidates=unique([c.warehouseField,'ReceivingWarehouseId','InventoryWarehouseId','WarehouseId','DefaultReceivingWarehouseId','InventLocationId']),statusField=c.lineStatusField||'PurchaseOrderLineStatus';
 const attempts=[];
 for(const warehouseField of warehouseCandidates){
  const filters=[
   {kind:'PURCH_STATUS_ENUM',value:`${statusField} eq Microsoft.Dynamics.DataEntities.PurchStatus'Backorder'`},
   {kind:'WAREHOUSE_ONLY',value:''}
  ];
  for(const candidate of filters){
   const warehouseFilter=`${warehouseField} eq '${esc(warehouseId)}'`,filter=withCompany([warehouseFilter,candidate.value].filter(Boolean).join(' and '));
   try{
    const pageSize=Math.max(100,Math.min(2000,Number(c.pageSize)||top)),maxRows=Math.max(pageSize,Math.min(25000,Number(c.maxRows)||10000));
    const payload=await odataGetAll(c.lineEntity,{filter,pageSize,maxRows,extra:extraCompany()}),raw=Array.isArray(payload?.value)?payload.value:[],rows=raw.filter(row=>purchaseLineOpen(row,c));
    return{value:rows,rowCount:rows.length,pages:payload.pages||1,truncated:!!payload.truncated,top:pageSize,maxRows,serverOpenFilter:candidate.kind==='PURCH_STATUS_ENUM',openFilterKind:candidate.kind,serverRemainingFilter:false,warehouseField,attempts};
   }catch(error){
    attempts.push({warehouseField,openFilterKind:candidate.kind,serverOpenFilter:candidate.kind==='PURCH_STATUS_ENUM',code:error?.code||'D365_PO_FILTER_FAILED',message:error?.message||String(error)});
   }
  }
 }
 let sampleKeys=[];
 try{
  const sample=await odataGet(c.lineEntity,{filter:withCompany(''),top:3,extra:extraCompany()}),rows=Array.isArray(sample?.value)?sample.value:[];
  sampleKeys=unique(rows.flatMap(row=>Object.keys(row||{}))).filter(key=>/warehouse|inventlocation|location/i.test(key)).slice(0,20)
 }catch{}
 throw Object.assign(new Error(`Aucun champ warehouse exploitable n’a permis de lire les PO de ${warehouseId}.`),{status:503,code:'D365_RECEIVING_WAREHOUSE_FIELD_UNRESOLVED',details:{warehouseId,entity:c.lineEntity,attemptedFields:warehouseCandidates,sampleWarehouseFields:sampleKeys,attempts:attempts.slice(-8)}})
}

async function purchaseOrderHeaders(poNumbers){
 const c=receiving(),limit=headerEnrichmentLimit();
 if(!poNumbers.length||limit===0)return{value:[],rowCount:0,pages:0,truncated:false,skipped:limit===0};
 if(!c.headerEntity)return{value:[],rowCount:0,pages:0,truncated:false,skipped:true,error:{code:'D365_RECEIVING_HEADER_MAPPING_REQUIRED',message:'D365_PO_HEADER_ENTITY non configuré.'}};
 const batch=poNumbers.slice(0,limit),parts=chunks(batch,20),settled=await Promise.allSettled(parts.map(part=>odataGet(c.headerEntity,{filter:withCompany(orFilter(c.purchaseOrderField,part)),top:Math.max(50,part.length),extra:extraCompany()})));
 const rows=[],errors=[];for(const r of settled){if(r.status==='fulfilled')rows.push(...(Array.isArray(r.value?.value)?r.value.value:[]));else errors.push({code:r.reason?.code||'D365_RECEIVING_HEADER_ENRICH_FAILED',message:r.reason?.message||String(r.reason)})}
 return{value:rows,rowCount:rows.length,pages:parts.length,truncated:poNumbers.length>limit||errors.length>0,skipped:false,error:errors.length?{code:'D365_RECEIVING_HEADER_PARTIAL',message:`${errors.length} lot(s) d’en-têtes PO n’ont pas pu être lus.`,errors}:null};
}

export async function listExpectedPurchaseOrders(storeId,{businessDate=todayISO()}={}){
 const c=receiving(),storeSettings=storeOperationalSettings(storeId),warehouseId=clean(storeSettings?.storeWarehouseId||config.dynamics.stock?.storeWarehouses?.[storeId]);
 if(!isD365ReadLive('receiving'))return{mode:config.realOnly?'UNAVAILABLE':'SIMULATED',source:config.realOnly?'UNMAPPED':'STOREOPS',storeId,warehouseId:warehouseId||null,businessDate,items:[],diagnostics:{liveRequested:false,code:config.realOnly?'D365_RECEIVING_NOT_CONNECTED':null}};
 if(!warehouseId)return{mode:'LIVE_UNMAPPED',source:'D365',storeId,warehouseId:null,businessDate,items:[],diagnostics:{liveRequested:true,code:'D365_STORE_WAREHOUSE_NOT_MAPPED'}};
 const startedAt=Date.now(),linePayload=await purchaseOrderLinesForWarehouse(warehouseId),lines=linePayload.value||[];
 const poNumbers=unique(lines.map(row=>field(row,c.purchaseOrderField,['PurchaseOrderNumber']))),headerPayload=await purchaseOrderHeaders(poNumbers),headers=headerPayload.value||[];
 const headerByPo=new Map(headers.map(row=>[clean(field(row,c.purchaseOrderField,['PurchaseOrderNumber'])),row]));
 const cutoff=oneMonthAgoISO(todayISO());let hiddenOld=0,hiddenClosed=0;
 const items=poNumbers.map(poNumber=>{
  const poLines=lines.filter(row=>clean(field(row,c.purchaseOrderField,['PurchaseOrderNumber']))===poNumber),header=headerByPo.get(poNumber)||{};
  const dates=poLines.map(row=>dateOnly(field(row,c.lineDateField,['RequestedDeliveryDate','ExpectedDeliveryDate']))).filter(Boolean).sort();
  const eta=dateOnly(field(header,c.headerDateField,['RequestedDeliveryDate','ConfirmedDeliveryDate']))||dates[0]||businessDate;
  const sourceStatus=clean(field(header,c.headerStatusField,['PurchaseOrderStatus']))||'Open';
  const vendorAccount=clean(field(header,c.vendorField,['OrderVendorAccountNumber','InvoiceVendorAccountNumber']))||null;
  const vendorName=clean(field(header,c.vendorNameField,['PurchaseOrderName','VendorName','OrderVendorName']))||vendorAccount||'Fournisseur';
  const createdDate=dateOnly(field(header,c.creationDateField,['AccountingDate','CreatedDateTime','PurchaseOrderCreationDate']))||null;
  if(!openPoStatus(sourceStatus)){hiddenClosed++;return null}
  if(createdDate&&createdDate<cutoff){hiddenOld++;return null}
  return{
   poNumber,vendor:vendorName,vendorName,vendorAccount,createdDate,creationDateSource:createdDate?(c.creationDateField||'AccountingDate'):null,eta,status:'EXPECTED',source:'D365',sourceStatus,warehouseId,
   lines:poLines.map(row=>{
    const productNumber=clean(field(row,c.productField,['ProductNumber','ItemNumber'])),ean=clean(field(row,c.barcodeField,['Barcode'])),category=clean(field(row,c.categoryField,['ProcurementProductCategoryName']))||'Autre';
    return{sourceLineNumber:clean(field(row,c.lineNumberField,['LineNumber','PurchaseOrderLineNumber']))||productNumber,productNumber,ean,productName:clean(field(row,c.descriptionField,['LineDescription','ProductName']))||productNumber||'Article',category,orderedQty:finite(field(row,c.orderedQtyField,['OrderedPurchaseQuantity']))??0,lineStatus:clean(field(row,c.lineStatusField,['PurchaseOrderLineStatus']))||null,receivedQty:c.receivedQtyField?finite(field(row,c.receivedQtyField,[])):null,remainingQty:remainingFor(row,c),remainingSource:remainingFor(row,c)==null?'UNAVAILABLE':'D365',unit:clean(field(row,c.unitField,['PurchaseUnitSymbol']))||null,requestedDeliveryDate:dateOnly(field(row,c.lineDateField,['RequestedDeliveryDate','ExpectedDeliveryDate']))||eta,warehouseId:clean(field(row,c.warehouseField,['ReceivingWarehouseId']))||warehouseId,temperatureRequired:temperatureRequired(category)};
   })
  };
 }).filter(Boolean);
 const truncated=!!linePayload.truncated||!!headerPayload.truncated;
 return{mode:'LIVE',source:'D365',storeId,warehouseId,businessDate,items,diagnostics:{liveRequested:true,elapsedMs:Date.now()-startedAt,lineRows:linePayload.rowCount||0,linePages:linePayload.pages||0,lineTop:linePayload.top||null,serverOpenFilter:!!linePayload.serverOpenFilter,serverRemainingFilter:false,headerRows:headerPayload.rowCount||0,headerPages:headerPayload.pages||0,headerSkipped:!!headerPayload.skipped,headerError:headerPayload.error||null,hiddenOldPo:hiddenOld,hiddenClosedPo:hiddenClosed,poCutoffDate:cutoff,warehouseField:linePayload.warehouseField||c.warehouseField,filterFallbacks:linePayload.attempts||[],truncated,authoritative:!truncated}};
}


async function transferHeadersForWarehouse(warehouseId){
 const t=transferReceiving(),top=Math.max(50,Math.min(t.maxRows||10000,Number(process.env.D365_TO_HEADER_TOP)||500));
 const base=`${t.toWarehouseField} eq '${esc(warehouseId)}'`,company=withCompany(base),attempts=[];
 for(const filter of [withCompany(`${base} and ${t.statusField} ne 'Received'`),company]){
  try{
   const payload=await odataGet(t.headerEntity,{filter,top,extra:extraCompany()}),raw=Array.isArray(payload?.value)?payload.value:[],rows=raw.filter(r=>clean(r?.[t.statusField]).toUpperCase()!=='RECEIVED');
   return{value:rows,rowCount:rows.length,truncated:raw.length>=top,top,attempts}
  }catch(error){attempts.push({filter,code:error?.code||'D365_TO_HEADER_FILTER_FAILED',message:error?.message||String(error)})}
 }
 throw Object.assign(new Error(`Lecture des TO à destination de ${warehouseId} impossible.`),{status:503,code:'D365_TO_HEADER_READ_FAILED',details:{warehouseId,entity:t.headerEntity,attempts}})
}
function transferRemaining(row,t){
 const explicit=finite(row?.[t.remainingQtyField]);if(explicit!==null)return Math.max(0,explicit);
 const ordered=finite(row?.[t.transferQtyField])??0,received=finite(row?.[t.receivedQtyField])??0;
 return Math.max(0,ordered-received)
}
async function transferLinesForOrders(orderNumbers){
 const t=transferReceiving(),all=[],attempts=[];let truncated=false;
 for(const batch of chunks(orderNumbers,20)){
  const base=orFilter(t.numberField,batch);
  let payload=null;
  for(const filter of [withCompany(`${base} and ${t.remainingQtyField} gt 0`),withCompany(base)]){
   try{payload=await odataGet(t.lineEntity,{filter,top:Math.max(100,Math.min(t.maxRows||10000,2000)),extra:extraCompany()});break}
   catch(error){attempts.push({filter,code:error?.code||'D365_TO_LINE_FILTER_FAILED',message:error?.message||String(error)})}
  }
  if(!payload)continue;
  const raw=Array.isArray(payload.value)?payload.value:[];if(raw.length>=Math.max(100,Math.min(t.maxRows||10000,2000)))truncated=true;
  all.push(...raw.filter(row=>transferRemaining(row,t)>0))
 }
 return{value:all,rowCount:all.length,truncated,attempts}
}
async function transferProductNames(itemNumbers){
 const entity=config.dynamics.entities?.basePrice||'ReleasedProductsV2',numberField='ItemNumber',nameField='ProductName',map=new Map(),parts=chunks(itemNumbers,20);
 const settled=await Promise.allSettled(parts.map(batch=>odataGet(entity,{filter:withCompany(orFilter(numberField,batch)),select:`${numberField},${nameField}`,top:Math.max(50,batch.length),extra:extraCompany()})));
 for(const result of settled)if(result.status==='fulfilled')for(const row of result.value?.value||[])map.set(clean(row[numberField]),clean(row[nameField]));
 return map
}
export async function listExpectedTransferOrders(storeId,{businessDate=todayISO()}={}){
 const t=transferReceiving(),warehouseId=storeWarehouse(storeId);
 if(!isD365ReadLive('receiving'))return{mode:config.realOnly?'UNAVAILABLE':'SIMULATED',source:config.realOnly?'UNMAPPED':'STOREOPS',documentType:'TO',storeId,warehouseId,businessDate,items:[],diagnostics:{liveRequested:false}};
 if(!warehouseId)return{mode:'LIVE_UNMAPPED',source:'D365',documentType:'TO',storeId,warehouseId:null,businessDate,items:[],diagnostics:{liveRequested:true,code:'D365_STORE_WAREHOUSE_NOT_MAPPED'}};
 const startedAt=Date.now(),headersPayload=await transferHeadersForWarehouse(warehouseId),allHeaders=headersPayload.value||[],cutoff=oneMonthAgoISO(businessDate),headers=allHeaders.filter(h=>{const d=dateOnly(h?.[t.headerDateField]);return !d||d>=cutoff}),hiddenOldTo=allHeaders.length-headers.length,numbers=unique(headers.map(r=>r?.[t.numberField]));
 const linesPayload=await transferLinesForOrders(numbers),lines=linesPayload.value||[],withLines=new Set(lines.map(r=>clean(r?.[t.numberField]))),activeHeaders=headers.filter(h=>withLines.has(clean(h?.[t.numberField])));
 const itemNumbers=unique(lines.map(r=>r?.[t.productField])),names=await transferProductNames(itemNumbers);
 const items=activeHeaders.map(header=>{
  const number=clean(header?.[t.numberField]),orderLines=lines.filter(r=>clean(r?.[t.numberField])===number),origin=clean(header?.[t.fromWarehouseField])||'Origine D365',eta=dateOnly(header?.[t.headerDateField])||businessDate,sourceStatus=clean(header?.[t.statusField])||'Open';
  return{
   documentType:'TO',poNumber:number,documentNumber:number,vendor:origin,vendorAccount:null,origin,eta,status:'EXPECTED',source:'D365',sourceStatus,warehouseId,
   lines:orderLines.map(row=>{
    const productNumber=clean(row?.[t.productField]),remaining=transferRemaining(row,t),ordered=finite(row?.[t.transferQtyField])??0,received=finite(row?.[t.receivedQtyField])??0;
    return{sourceLineNumber:clean(row?.[t.lineNumberField])||productNumber,productNumber,ean:productNumber,productName:names.get(productNumber)||productNumber||'Article',category:'Autre',orderedQty:ordered,receivedQty:received,remainingQty:remaining,unit:clean(row?.[t.unitField])||null,requestedDeliveryDate:dateOnly(row?.[t.lineDateField])||eta,warehouseId,temperatureRequired:0}
   })
  }
 });
 const truncated=!!headersPayload.truncated||!!linesPayload.truncated;
 return{mode:'LIVE',source:'D365',documentType:'TO',storeId,warehouseId,businessDate,items,diagnostics:{liveRequested:true,elapsedMs:Date.now()-startedAt,headerRows:headers.length,hiddenOldTo,toCutoffDate:cutoff,lineRows:lines.length,openHeaders:items.length,headerAttempts:headersPayload.attempts||[],lineAttempts:linesPayload.attempts||[],truncated,authoritative:!truncated}}
}

function ensureColumn(table,column,definition){const cols=db.prepare(`PRAGMA table_info(${table})`).all();if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)}
export function ensureReceivingStorage(){
 ensureColumn('receipts','source',"TEXT NOT NULL DEFAULT 'STOREOPS'");
 ensureColumn('receipts','source_status','TEXT NULL');
 ensureColumn('receipts','source_warehouse_id','TEXT NULL');
 ensureColumn('receipts','source_updated_at','TEXT NULL');
 ensureColumn('receipts','document_type',"TEXT NOT NULL DEFAULT 'PO'");
 ensureColumn('receipts','source_origin','TEXT NULL');
 ensureColumn('receipts','source_destination','TEXT NULL');
 ensureColumn('receipts','source_created_date','TEXT NULL');
 ensureColumn('receipts','source_vendor_account','TEXT NULL');
 ensureColumn('receipt_lines','product_number','TEXT NULL');
 ensureColumn('receipt_lines','source_line_number','TEXT NULL');
 ensureColumn('receipt_lines','remaining_qty','REAL NULL');
 ensureColumn('receipt_lines','purchase_unit','TEXT NULL');
 ensureColumn('receipt_lines','source_active','INTEGER NOT NULL DEFAULT 1');
}

export async function syncExpectedReceiptsFromDynamics(storeId,{businessDate=todayISO()}={}){
 ensureReceivingStorage();
 let snapshot;
 try{snapshot=await withSyncTimeout(listExpectedPurchaseOrders(storeId,{businessDate}))}
 catch(error){const code=error?.code||'D365_RECEIVING_SYNC_FAILED',message=error?.message||String(error);recordReceivingFailure(storeId,{code,message,diagnostics:{liveRequested:true,code}});return{mode:'LIVE_ERROR',source:'D365',storeId,businessDate,items:[],synced:false,partial:false,authoritative:false,created:0,updated:0,lineCreated:0,lineUpdated:0,error:{code,message},diagnostics:{liveRequested:true,code},readiness:receivingStateForStore(storeId)}}
 if(snapshot.mode!=='LIVE'){recordReceivingFailure(storeId,{warehouseId:snapshot.warehouseId,code:snapshot.diagnostics?.code||'D365_RECEIVING_NOT_LIVE',message:snapshot.diagnostics?.code||'Lecture PO D365 non exploitable.',diagnostics:snapshot.diagnostics});return{...snapshot,synced:false,partial:false,authoritative:false,created:0,updated:0,lineCreated:0,lineUpdated:0,readiness:receivingStateForStore(storeId)}};
 const authoritative=snapshot.diagnostics?.authoritative!==false&&!snapshot.diagnostics?.truncated;
 let created=0,updated=0,lineCreated=0,lineUpdated=0;
 if(authoritative)db.prepare(`UPDATE receipts SET source_status='NOT_OPEN',source_updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND source='D365' AND document_type='PO' AND status<>'POSTED'`).run(storeId);
 for(const po of snapshot.items){
  let receipt=db.prepare(`SELECT * FROM receipts WHERE po_number=?`).get(po.poNumber);
  if(receipt&&receipt.store_id!==storeId)continue;
  if(!receipt){
   const id=uid('receipt');
   db.prepare(`INSERT INTO receipts(id,store_id,po_number,vendor,eta,status,source,source_status,source_warehouse_id,source_updated_at,document_type,source_origin,source_destination,source_created_date,source_vendor_account) VALUES(?,?,?,?,?,'EXPECTED','D365',?,?,CURRENT_TIMESTAMP,'PO',?,?,?,?)`).run(id,storeId,po.poNumber,po.vendor,po.eta,po.sourceStatus,po.warehouseId,po.vendorAccount||po.vendor,po.warehouseId,po.createdDate||null,po.vendorAccount||null);
   receipt=db.prepare(`SELECT * FROM receipts WHERE id=?`).get(id);created++;
  }else{
   db.prepare(`UPDATE receipts SET vendor=?,eta=?,source='D365',source_status=?,source_warehouse_id=?,source_updated_at=CURRENT_TIMESTAMP,document_type='PO',source_origin=?,source_destination=?,source_created_date=?,source_vendor_account=?,status=CASE WHEN status='POSTED' THEN status ELSE 'EXPECTED' END WHERE id=?`).run(po.vendor,po.eta,po.sourceStatus,po.warehouseId,po.vendorAccount||po.vendor,po.warehouseId,po.createdDate||null,po.vendorAccount||null,receipt.id);updated++;
  }
  if(authoritative)db.prepare(`UPDATE receipt_lines SET source_active=0 WHERE receipt_id=? AND source_line_number IS NOT NULL`).run(receipt.id);
  for(const line of po.lines){
   let existing=line.sourceLineNumber?db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? AND source_line_number=?`).get(receipt.id,line.sourceLineNumber):null;
   if(!existing&&line.productNumber)existing=db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? AND product_number=? ORDER BY id LIMIT 1`).get(receipt.id,line.productNumber);
   const identifier=line.ean||existing?.ean||line.productNumber||line.sourceLineNumber;
   if(existing){db.prepare(`UPDATE receipt_lines SET ean=?,product_name=?,category=?,ordered_qty=?,temperature_required=?,product_number=?,source_line_number=?,remaining_qty=?,purchase_unit=?,source_active=1 WHERE id=?`).run(identifier,line.productName,line.category,line.orderedQty,line.temperatureRequired,line.productNumber||null,line.sourceLineNumber||null,line.remainingQty,line.unit||null,existing.id);lineUpdated++}
   else{db.prepare(`INSERT INTO receipt_lines(id,receipt_id,ean,product_name,category,ordered_qty,temperature_required,product_number,source_line_number,remaining_qty,purchase_unit,source_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)`).run(uid('rline'),receipt.id,identifier,line.productName,line.category,line.orderedQty,line.temperatureRequired,line.productNumber||null,line.sourceLineNumber||null,line.remainingQty,line.unit||null);lineCreated++}
  }
 }
 recordReceivingSuccess(storeId,snapshot,{authoritative});
 return{...snapshot,synced:true,partial:!authoritative,authoritative,created,updated,lineCreated,lineUpdated,readiness:receivingStateForStore(storeId)};
}


export async function syncExpectedTransferOrdersFromDynamics(storeId,{businessDate=todayISO()}={}){
 ensureReceivingStorage();let snapshot;
 try{snapshot=await withSyncTimeout(listExpectedTransferOrders(storeId,{businessDate}),'TO')}
 catch(error){const code=error?.code||'D365_TRANSFER_RECEIVING_SYNC_FAILED',message=error?.message||String(error);recordTransferReceivingFailure(storeId,{code,message,diagnostics:{liveRequested:true,code}});return{mode:'LIVE_ERROR',source:'D365',documentType:'TO',storeId,businessDate,items:[],synced:false,partial:false,authoritative:false,created:0,updated:0,lineCreated:0,lineUpdated:0,error:{code,message},readiness:transferReceivingStateForStore(storeId)}}
 if(snapshot.mode!=='LIVE'){recordTransferReceivingFailure(storeId,{warehouseId:snapshot.warehouseId,code:snapshot.diagnostics?.code||'D365_TRANSFER_RECEIVING_NOT_LIVE',message:'Lecture TO D365 non exploitable.',diagnostics:snapshot.diagnostics});return{...snapshot,synced:false,partial:false,authoritative:false,created:0,updated:0,lineCreated:0,lineUpdated:0,readiness:transferReceivingStateForStore(storeId)}}
 const authoritative=snapshot.diagnostics?.authoritative!==false&&!snapshot.diagnostics?.truncated;let created=0,updated=0,lineCreated=0,lineUpdated=0;
 if(authoritative)db.prepare(`UPDATE receipts SET source_status='NOT_OPEN',source_updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND source='D365' AND document_type='TO' AND status<>'POSTED'`).run(storeId);
 for(const doc of snapshot.items){
  let receipt=db.prepare(`SELECT * FROM receipts WHERE po_number=?`).get(doc.documentNumber);
  if(receipt&&receipt.store_id!==storeId)continue;
  if(!receipt){
   const id=uid('receipt');db.prepare(`INSERT INTO receipts(id,store_id,po_number,vendor,eta,status,source,source_status,source_warehouse_id,source_updated_at,document_type,source_origin,source_destination) VALUES(?,?,?,?,?,'EXPECTED','D365',?,?,CURRENT_TIMESTAMP,'TO',?,?)`).run(id,storeId,doc.documentNumber,doc.vendor,doc.eta,doc.sourceStatus,doc.warehouseId,doc.origin||doc.vendor,doc.warehouseId);receipt=db.prepare(`SELECT * FROM receipts WHERE id=?`).get(id);created++
  }else{db.prepare(`UPDATE receipts SET vendor=?,eta=?,source='D365',source_status=?,source_warehouse_id=?,source_updated_at=CURRENT_TIMESTAMP,document_type='TO',source_origin=?,source_destination=?,status=CASE WHEN status='POSTED' THEN status ELSE 'EXPECTED' END WHERE id=?`).run(doc.vendor,doc.eta,doc.sourceStatus,doc.warehouseId,doc.origin||doc.vendor,doc.warehouseId,receipt.id);updated++}
  if(authoritative)db.prepare(`UPDATE receipt_lines SET source_active=0 WHERE receipt_id=? AND source_line_number IS NOT NULL`).run(receipt.id);
  for(const line of doc.lines){
   let existing=line.sourceLineNumber?db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? AND source_line_number=?`).get(receipt.id,line.sourceLineNumber):null;
   if(!existing&&line.productNumber)existing=db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? AND product_number=? ORDER BY id LIMIT 1`).get(receipt.id,line.productNumber);
   const identifier=line.ean||existing?.ean||line.productNumber||line.sourceLineNumber;
   if(existing){db.prepare(`UPDATE receipt_lines SET ean=?,product_name=?,category=?,ordered_qty=?,temperature_required=?,product_number=?,source_line_number=?,remaining_qty=?,purchase_unit=?,source_active=1 WHERE id=?`).run(identifier,line.productName,line.category,line.orderedQty,line.temperatureRequired,line.productNumber||null,line.sourceLineNumber||null,line.remainingQty,line.unit||null,existing.id);lineUpdated++}
   else{db.prepare(`INSERT INTO receipt_lines(id,receipt_id,ean,product_name,category,ordered_qty,temperature_required,product_number,source_line_number,remaining_qty,purchase_unit,source_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)`).run(uid('rline'),receipt.id,identifier,line.productName,line.category,line.orderedQty,line.temperatureRequired,line.productNumber||null,line.sourceLineNumber||null,line.remainingQty,line.unit||null);lineCreated++}
  }
 }
 recordTransferReceivingSuccess(storeId,snapshot,{authoritative});
 return{...snapshot,synced:true,partial:!authoritative,authoritative,created,updated,lineCreated,lineUpdated,readiness:transferReceivingStateForStore(storeId)}
}

export function listReceiptsForStore(storeId,{documentType='PO'}={}){
 ensureReceivingStorage();
 const type=clean(documentType).toUpperCase(),whereType=type==='ALL'?'':' AND document_type=?',args=type==='ALL'?[storeId]:[storeId,type],cutoff=oneMonthAgoISO(todayISO());
 const receipts=db.prepare(`SELECT * FROM receipts WHERE store_id=?${whereType}
  AND (document_type<>'PO' OR source<>'D365' OR COALESCE(source_created_date,eta)>=?)
  AND (source<>'D365' OR source_status IS NULL OR source_status<>'NOT_OPEN' OR status='POSTED' OR EXISTS(SELECT 1 FROM receipt_lines rl WHERE rl.receipt_id=receipts.id AND rl.quality_control_id IS NOT NULL))
  ORDER BY CASE WHEN document_type='PO' THEN COALESCE(source_created_date,eta) ELSE eta END DESC,po_number DESC`).all(...args,cutoff);
 return receipts.map(r=>{const lines=db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? AND (source_active=1 OR quality_control_id IS NOT NULL) ORDER BY COALESCE(source_line_number,''),id`).all(r.id);return{...r,line_count:lines.length,remaining_total:lines.reduce((s,x)=>s+Number(x.remaining_qty??x.ordered_qty??0),0),lines}});
}

export function receivingStoreReadiness(storeId){return receivingStateForStore(storeId)}
export function transferReceivingStoreReadiness(storeId){return transferReceivingStateForStore(storeId)}

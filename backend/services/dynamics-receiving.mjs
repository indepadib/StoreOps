import { db,uid,todayISO } from '../db.mjs';
import { config } from '../config.mjs';
import { isD365ReadLive,odataGet,odataGetAll } from './dynamics.mjs';

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
function field(row,name,fallbacks=[]){for(const key of [name,...fallbacks].filter(Boolean)){if(row?.[key]!==undefined&&row?.[key]!==null)return row[key]}return null}
function selected(...fields){return unique(fields).join(',')}
function remainingFor(row,c){
  const explicit=finite(field(row,c.remainingQtyField,['RemainingPurchaseQuantity','RemainingInventoryQuantity']));
  if(explicit!==null)return explicit;
  const ordered=finite(field(row,c.orderedQtyField,['OrderedPurchaseQuantity']))??0;
  const received=finite(field(row,c.receivedQtyField,['ReceivedPurchaseQuantity','ReceivedInventoryQuantity']))??0;
  return Math.max(0,ordered-received);
}
function temperatureRequired(category=''){return /frais|surgel/i.test(clean(category))?1:0}

export function receivingIntegrationConfig(){
 const c=receiving();
 return{
  mode:isD365ReadLive('receiving')?'LIVE':'SIMULATED',
  entity:{header:c.headerEntity||null,line:c.lineEntity||null},
  storeWarehouses:{...(config.dynamics.stock?.storeWarehouses||{})},
  fields:{
   purchaseOrder:c.purchaseOrderField,
   vendor:c.vendorField,
   headerDate:c.headerDateField,
   headerStatus:c.headerStatusField,
   headerWarehouse:c.headerWarehouseField,
   lineNumber:c.lineNumberField,
   product:c.productField,
   description:c.descriptionField,
   barcode:c.barcodeField||null,
   category:c.categoryField||null,
   orderedQty:c.orderedQtyField,
   receivedQty:c.receivedQtyField,
   remainingQty:c.remainingQtyField,
   unit:c.unitField,
   lineDate:c.lineDateField,
   warehouse:c.warehouseField
  }
 };
}

async function queryAllWithSelectFallback(entity,options){
 try{return{...(await odataGetAll(entity,options)),selectFallback:false}}
 catch(error){
  if(!options.select)throw error;
  const fallback={...options};delete fallback.select;
  const payload=await odataGetAll(entity,fallback);
  return{...payload,selectFallback:true,selectError:{code:error?.code||'D365_SELECT_FAILED',message:error?.message||String(error)}};
 }
}

async function purchaseOrderLinesForWarehouse(warehouseId){
 const c=receiving();
 if(!c.lineEntity)throw Object.assign(new Error('D365_PO_LINE_ENTITY non configuré.'),{status:503,code:'D365_RECEIVING_LINE_MAPPING_REQUIRED'});
 const select=selected(config.dynamics.dataAreaField,c.purchaseOrderField,c.lineNumberField,c.productField,c.descriptionField,c.barcodeField,c.categoryField,c.orderedQtyField,c.receivedQtyField,c.remainingQtyField,c.unitField,c.lineDateField,c.warehouseField);
 const payload=await queryAllWithSelectFallback(c.lineEntity,{
  filter:withCompany(`${c.warehouseField} eq '${esc(warehouseId)}'`),
  select,
  extra:extraCompany(),
  pageSize:c.pageSize,
  maxRows:c.maxRows
 });
 const rows=(payload.value||[]).filter(row=>remainingFor(row,c)>0);
 return{...payload,value:rows,rowCount:rows.length};
}

async function purchaseOrderHeaders(poNumbers){
 const c=receiving();
 if(!poNumbers.length)return{value:[],rowCount:0,pages:0,truncated:false};
 if(!c.headerEntity)throw Object.assign(new Error('D365_PO_HEADER_ENTITY non configuré.'),{status:503,code:'D365_RECEIVING_HEADER_MAPPING_REQUIRED'});
 const select=selected(config.dynamics.dataAreaField,c.purchaseOrderField,c.vendorField,c.headerDateField,c.headerStatusField,c.headerWarehouseField,'PurchaseOrderName');
 const rows=[];let pages=0,truncated=false,selectFallback=false;
 for(const batch of chunks(poNumbers,20)){
  const payload=await queryAllWithSelectFallback(c.headerEntity,{filter:withCompany(orFilter(c.purchaseOrderField,batch)),select,extra:extraCompany(),pageSize:Math.max(50,batch.length),maxRows:500});
  rows.push(...(payload.value||[]));pages+=Number(payload.pages||1);truncated=truncated||!!payload.truncated;selectFallback=selectFallback||!!payload.selectFallback;
 }
 return{value:rows,rowCount:rows.length,pages,truncated,selectFallback};
}

export async function listExpectedPurchaseOrders(storeId,{businessDate=todayISO()}={}){
 const c=receiving(),warehouseId=clean(config.dynamics.stock?.storeWarehouses?.[storeId]);
 if(!isD365ReadLive('receiving'))return{mode:'SIMULATED',source:'STOREOPS',storeId,warehouseId:warehouseId||null,businessDate,items:[],diagnostics:{liveRequested:false}};
 if(!warehouseId)return{mode:'LIVE_UNMAPPED',source:'D365',storeId,warehouseId:null,businessDate,items:[],diagnostics:{liveRequested:true,code:'D365_STORE_WAREHOUSE_NOT_MAPPED'}};
 const linePayload=await purchaseOrderLinesForWarehouse(warehouseId),lines=linePayload.value||[];
 const poNumbers=unique(lines.map(row=>field(row,c.purchaseOrderField,['PurchaseOrderNumber']))),headerPayload=await purchaseOrderHeaders(poNumbers),headers=headerPayload.value||[];
 const headerByPo=new Map(headers.map(row=>[clean(field(row,c.purchaseOrderField,['PurchaseOrderNumber'])),row]));
 const items=poNumbers.map(poNumber=>{
  const poLines=lines.filter(row=>clean(field(row,c.purchaseOrderField,['PurchaseOrderNumber']))===poNumber),header=headerByPo.get(poNumber)||{};
  const dates=poLines.map(row=>dateOnly(field(row,c.lineDateField,['RequestedDeliveryDate','ExpectedDeliveryDate']))).filter(Boolean).sort();
  const eta=dateOnly(field(header,c.headerDateField,['RequestedDeliveryDate','ConfirmedDeliveryDate']))||dates[0]||businessDate;
  const sourceStatus=clean(field(header,c.headerStatusField,['PurchaseOrderStatus']))||'Open';
  const vendorAccount=clean(field(header,c.vendorField,['OrderVendorAccountNumber','InvoiceVendorAccountNumber']))||'Fournisseur';
  return{
   poNumber,
   vendor:vendorAccount,
   vendorAccount,
   eta,
   status:'EXPECTED',
   source:'D365',
   sourceStatus,
   warehouseId,
   lines:poLines.map(row=>{
    const productNumber=clean(field(row,c.productField,['ProductNumber','ItemNumber']));
    const ean=clean(field(row,c.barcodeField,['Barcode']));
    const category=clean(field(row,c.categoryField,['ProcurementProductCategoryName']))||'Autre';
    return{
     sourceLineNumber:clean(field(row,c.lineNumberField,['LineNumber','PurchaseOrderLineNumber']))||productNumber,
     productNumber,
     ean,
     productName:clean(field(row,c.descriptionField,['LineDescription','ProductName']))||productNumber||'Article',
     category,
     orderedQty:finite(field(row,c.orderedQtyField,['OrderedPurchaseQuantity']))??0,
     receivedQty:finite(field(row,c.receivedQtyField,['ReceivedPurchaseQuantity','ReceivedInventoryQuantity']))??0,
     remainingQty:remainingFor(row,c),
     unit:clean(field(row,c.unitField,['PurchaseUnitSymbol']))||null,
     requestedDeliveryDate:dateOnly(field(row,c.lineDateField,['RequestedDeliveryDate','ExpectedDeliveryDate']))||eta,
     warehouseId:clean(field(row,c.warehouseField,['ReceivingWarehouseId']))||warehouseId,
     temperatureRequired:temperatureRequired(category)
    };
   })
  };
 });
 return{mode:'LIVE',source:'D365',storeId,warehouseId,businessDate,items,diagnostics:{liveRequested:true,lineRows:linePayload.rowCount||0,linePages:linePayload.pages||0,headerRows:headerPayload.rowCount||0,headerPages:headerPayload.pages||0,lineSelectFallback:!!linePayload.selectFallback,headerSelectFallback:!!headerPayload.selectFallback,truncated:!!linePayload.truncated||!!headerPayload.truncated}};
}

function ensureColumn(table,column,definition){const cols=db.prepare(`PRAGMA table_info(${table})`).all();if(!cols.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)}
export function ensureReceivingStorage(){
 ensureColumn('receipts','source',"TEXT NOT NULL DEFAULT 'STOREOPS'");
 ensureColumn('receipts','source_status','TEXT NULL');
 ensureColumn('receipts','source_warehouse_id','TEXT NULL');
 ensureColumn('receipts','source_updated_at','TEXT NULL');
 ensureColumn('receipt_lines','product_number','TEXT NULL');
 ensureColumn('receipt_lines','source_line_number','TEXT NULL');
 ensureColumn('receipt_lines','remaining_qty','REAL NULL');
 ensureColumn('receipt_lines','purchase_unit','TEXT NULL');
 ensureColumn('receipt_lines','source_active','INTEGER NOT NULL DEFAULT 1');
}

export async function syncExpectedReceiptsFromDynamics(storeId,{businessDate=todayISO()}={}){
 ensureReceivingStorage();
 const snapshot=await listExpectedPurchaseOrders(storeId,{businessDate});
 if(snapshot.mode!=='LIVE')return{...snapshot,synced:false,created:0,updated:0,lineCreated:0,lineUpdated:0};
 let created=0,updated=0,lineCreated=0,lineUpdated=0;
 db.prepare(`UPDATE receipts SET source_status='NOT_OPEN',source_updated_at=CURRENT_TIMESTAMP WHERE store_id=? AND source='D365' AND status<>'POSTED'`).run(storeId);
 for(const po of snapshot.items){
  let receipt=db.prepare(`SELECT * FROM receipts WHERE po_number=?`).get(po.poNumber);
  if(receipt&&receipt.store_id!==storeId)continue;
  if(!receipt){
   const id=uid('receipt');
   db.prepare(`INSERT INTO receipts(id,store_id,po_number,vendor,eta,status,source,source_status,source_warehouse_id,source_updated_at) VALUES(?,?,?,?,?,'EXPECTED','D365',?,?,CURRENT_TIMESTAMP)`).run(id,storeId,po.poNumber,po.vendor,po.eta,po.sourceStatus,po.warehouseId);
   receipt=db.prepare(`SELECT * FROM receipts WHERE id=?`).get(id);created++;
  }else{
   db.prepare(`UPDATE receipts SET vendor=?,eta=?,source='D365',source_status=?,source_warehouse_id=?,source_updated_at=CURRENT_TIMESTAMP,status=CASE WHEN status='POSTED' THEN status ELSE 'EXPECTED' END WHERE id=?`).run(po.vendor,po.eta,po.sourceStatus,po.warehouseId,receipt.id);updated++;
  }
  db.prepare(`UPDATE receipt_lines SET source_active=0 WHERE receipt_id=? AND source_line_number IS NOT NULL`).run(receipt.id);
  for(const line of po.lines){
   let existing=line.sourceLineNumber?db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? AND source_line_number=?`).get(receipt.id,line.sourceLineNumber):null;
   if(!existing&&line.productNumber)existing=db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? AND product_number=? ORDER BY id LIMIT 1`).get(receipt.id,line.productNumber);
   const identifier=line.ean||existing?.ean||line.productNumber||line.sourceLineNumber;
   if(existing){
    db.prepare(`UPDATE receipt_lines SET ean=?,product_name=?,category=?,ordered_qty=?,temperature_required=?,product_number=?,source_line_number=?,remaining_qty=?,purchase_unit=?,source_active=1 WHERE id=?`).run(identifier,line.productName,line.category,line.orderedQty,line.temperatureRequired,line.productNumber||null,line.sourceLineNumber||null,line.remainingQty,line.unit||null,existing.id);lineUpdated++;
   }else{
    db.prepare(`INSERT INTO receipt_lines(id,receipt_id,ean,product_name,category,ordered_qty,temperature_required,product_number,source_line_number,remaining_qty,purchase_unit,source_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)`).run(uid('rline'),receipt.id,identifier,line.productName,line.category,line.orderedQty,line.temperatureRequired,line.productNumber||null,line.sourceLineNumber||null,line.remainingQty,line.unit||null);lineCreated++;
   }
  }
 }
 return{...snapshot,synced:true,created,updated,lineCreated,lineUpdated};
}

export function listReceiptsForStore(storeId){
 ensureReceivingStorage();
 const receipts=db.prepare(`SELECT * FROM receipts WHERE store_id=? AND (source<>'D365' OR source_status IS NULL OR source_status<>'NOT_OPEN' OR status='POSTED' OR EXISTS(SELECT 1 FROM receipt_lines rl WHERE rl.receipt_id=receipts.id AND rl.quality_control_id IS NOT NULL)) ORDER BY eta,po_number`).all(storeId);
 return receipts.map(r=>({...r,lines:db.prepare(`SELECT * FROM receipt_lines WHERE receipt_id=? AND (source_active=1 OR quality_control_id IS NOT NULL) ORDER BY COALESCE(source_line_number,''),id`).all(r.id)}));
}

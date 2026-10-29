import {randomUUID} from 'node:crypto';
import {storeOperationalSettings} from './store-settings.mjs';
import {config} from '../config.mjs';
import {probeDataEntity,odataGet} from './dynamics.mjs';
import {supplyWarehouseForStore} from './dynamics-stock.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
const clean=v=>String(v??'').trim(),esc=v=>clean(v).replaceAll("'","''");
const number=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const company=()=>config.dynamics.dataAreaId?`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`:'';
const key=(kind,warehouse)=>analyticsCacheKey('receipt-history-v1',[config.dynamics.dataAreaId,kind,warehouse]);
export function receiptEvidence(row,m){
 const productNumber=clean(row[m.product]);if(!productNumber)return null;
 const received=m.received?number(row[m.received]):null,status=m.status?clean(row[m.status]).split('.').pop().replaceAll("'",'').toUpperCase():'';
 // Only confirmed receipt evidence; ordered quantities and open orders alone do not qualify.
 const proven=received>0||received==null&&m.type==='PO'&&/^(RECEIVED|INVOICED)$/.test(status)&&number(row[m.ordered])>0;
 return proven?{productNumber,date:m.date&&/^\d{4}-\d{2}-\d{2}/.test(clean(row[m.date]))?clean(row[m.date]).slice(0,10):null}:null;
}
async function mapping(type){
 const c=type==='PO'?config.dynamics.receiving:config.dynamics.transferReceiving,entity=c.lineEntity,k=analyticsCacheKey('receipt-schema-v1',[type,entity]),hit=await readAnalyticsCache(k);if(hit)return hit;
 const sample=(await probeDataEntity(entity,{top:1,extra:'cross-company=true',filter:company()})).rows?.[0];if(!sample)throw Object.assign(new Error(`${entity} : schéma de réception non observable.`),{status:422});
 const pick=(...fields)=>fields.filter(Boolean).find(f=>Object.hasOwn(sample,f))||null;
 const m={type,entity,product:pick(c.productField,'ItemNumber'),document:pick(c.purchaseOrderField||c.numberField,'PurchaseOrderNumber','TransferOrderNumber'),line:pick(c.lineNumberField,'LineNumber'),warehouse:pick(c.warehouseField,c.toWarehouseField,'ReceivingWarehouseId','InventoryWarehouseId'),received:pick(c.receivedQtyField,'ReceivedPurchaseQuantity','ReceivedQuantity'),status:pick(c.lineStatusField,'PurchaseOrderLineStatus'),ordered:pick(c.orderedQtyField,'OrderedPurchaseQuantity'),date:pick('ActualReceiptDate','ReceiptDate')};
 if(!m.product||!m.document||!m.line||!m.received&&!(type==='PO'&&m.status&&m.ordered))throw Object.assign(new Error(`${entity} : quantité reçue ou état de réception définitif manquant. Les commandes ne constituent pas un historique de réception.`),{status:422});
 if(!m.warehouse){const header=c.headerEntity,h=(await probeDataEntity(header,{top:1,extra:'cross-company=true',filter:company()})).rows?.[0]||{},hp=(...fields)=>fields.filter(Boolean).find(f=>Object.hasOwn(h,f));m.header=header;m.headerDocument=hp(c.purchaseOrderField||c.numberField,'PurchaseOrderNumber','TransferOrderNumber');m.headerWarehouse=hp(c.headerWarehouseField,c.toWarehouseField,'DefaultReceivingWarehouseId','ReceivingWarehouseId');if(!m.headerDocument||!m.headerWarehouse)throw Object.assign(new Error(`${entity} : dépôt destinataire non prouvé.`),{status:422})}
 await writeAnalyticsCache(k,'receipt-schema-v1',m,86400);return m;
}
export async function readReceiptHistory(storeId,kind='store'){
 const warehouse=kind==='supply'?supplyWarehouseForStore(storeId):storeOperationalSettings(storeId).storeWarehouseId;if(!warehouse)return{status:'UNMAPPED',complete:false,products:[],reason:'Dépôt non configuré'};
 return await readAnalyticsCache(key(kind,warehouse))||{status:'NOT_PREPARED',complete:false,warehouseId:warehouse,products:[],reason:'Historique des réceptions à préparer'};
}
export async function prepareReceiptHistory(storeId,{kind='store',cursor=0,snapshot=null}={},deps={}){
 const read=deps.read||readAnalyticsCache,write=deps.write||writeAnalyticsCache,resolve=deps.resolve||mapping,get=deps.get||odataGet;
 const warehouse=deps.warehouse|| (kind==='supply'?supplyWarehouseForStore(storeId):storeOperationalSettings(storeId).storeWarehouseId);if(!warehouse)throw Object.assign(new Error('Dépôt non configuré.'),{status:422});
 const readyKey=key(kind,warehouse),ready=await read(readyKey);if(cursor===0&&!snapshot&&ready)return{...ready,products:undefined,nextCursor:null,cached:true};
 if(snapshot&&!/^[a-f0-9-]{36}$/.test(snapshot))throw Object.assign(new Error('Image historique invalide.'),{status:400});
 const prepKey=(token,page)=>analyticsCacheKey('receipt-prep-v2',[config.dynamics.dataAreaId,kind,warehouse,token,page]);let acc=snapshot?await read(prepKey(snapshot,cursor)):null;if(acc)acc=structuredClone(acc);
 if(!snapshot){if(cursor!==0)throw Object.assign(new Error('Relancer la préparation historique.'),{status:409});acc={snapshot:randomUUID(),startedAt:new Date().toISOString(),cursor:0,type:0,offset:0,products:{},sources:[],phase:'MAP',documentOffset:0,documents:[],batch:0,scanned:0,issues:[]}}
 if(!acc||snapshot&&acc.snapshot!==snapshot||cursor!==acc.cursor)throw Object.assign(new Error('Préparation historique expirée ou hors séquence.'),{status:409});
 const type=['PO','TO'][acc.type];
 try{
  if(acc.phase==='MAP'){acc.mapping=await resolve(type);acc.phase=acc.mapping.warehouse?'LINES':'HEADERS';acc.offset=0;acc.documents=[];acc.batch=0;acc.sources.push({type,entity:acc.mapping.entity,receiptField:acc.mapping.received,receiptStatusFallback:!acc.mapping.received,complete:false})}
  const m=acc.mapping,filter=[company()],select=[];
  if(acc.phase==='HEADERS'){
   filter.push(`${m.headerWarehouse} eq '${esc(warehouse)}'`);const payload=await get(m.header,{filter:filter.filter(Boolean).join(' and '),select:[m.headerDocument,m.headerWarehouse].join(','),top:1000,extra:`cross-company=true&$skip=${acc.offset}&$orderby=${m.headerDocument}`});const rows=payload.value||[];acc.documents.push(...rows.map(r=>clean(r[m.headerDocument])).filter(Boolean));acc.offset+=rows.length;acc.scanned+=rows.length;
   if(rows.length<1000){acc.documents=[...new Set(acc.documents)];acc.phase='LINES';acc.offset=0}
  }else{
   if(m.warehouse)filter.push(`${m.warehouse} eq '${esc(warehouse)}'`);else{const docs=acc.documents.slice(acc.batch,acc.batch+20);filter.push(docs.length?'('+docs.map(d=>`${m.document} eq '${esc(d)}'`).join(' or ')+')':`${m.document} eq '__NO_RECEIPT_DOCUMENT__'`)}
   select.push(...new Set([m.product,m.document,m.line,m.warehouse,m.received,m.status,m.ordered,m.date].filter(Boolean)));
   const payload=await get(m.entity,{filter:filter.filter(Boolean).join(' and '),select:select.join(','),top:1000,extra:`cross-company=true&$skip=${acc.offset}&$orderby=${m.document},${m.line}`}),rows=payload.value||[];acc.scanned+=rows.length;
   for(const row of rows){const evidence=receiptEvidence(row,m);if(evidence){const old=acc.products[evidence.productNumber];acc.products[evidence.productNumber]={productNumber:evidence.productNumber,firstReceiptDate:old?.firstReceiptDate&&evidence.date?[old.firstReceiptDate,evidence.date].sort()[0]:old?.firstReceiptDate||evidence.date||null}}}
   acc.offset+=rows.length;
   if(rows.length<1000){if(!m.warehouse&&acc.batch+20<acc.documents.length){acc.batch+=20;acc.offset=0}else{acc.sources[acc.sources.length-1].complete=true;acc.type++;acc.phase='MAP'}}
  }
 }catch(e){acc.issues.push({type,reason:e.status===422?e.message:`Lecture ${type} indisponible ou interrompue ; historique incomplet`});acc.type++;acc.phase='MAP'}
 if(acc.scanned>100000)throw Object.assign(new Error('Historique trop volumineux : taux non publié ; source agrégée requise.'),{status:422});
 acc.cursor++;
 if(acc.type>=2){const complete=!acc.issues.length,value={status:complete?'READY':'PARTIAL',complete,warehouseId:warehouse,products:Object.values(acc.products),sources:acc.sources,issues:acc.issues,checkedAt:new Date().toISOString(),startedAt:acc.startedAt,coverage:'Toutes les lignes accessibles, sans filtre de date. Archives supprimées et ouverture non certifiées ; dates demandées de livraison jamais utilisées comme dates de réception.'};await write(readyKey,'receipt-history-v1',value,86400);return{...value,products:undefined,nextCursor:null,snapshot:acc.snapshot,scanned:acc.scanned}}
 await write(prepKey(acc.snapshot,acc.cursor),'receipt-prep-v2',acc,3600);return{status:'PREPARING',nextCursor:acc.cursor,snapshot:acc.snapshot,scanned:acc.scanned,warehouseId:warehouse};
}

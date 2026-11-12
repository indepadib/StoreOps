import {calculateMinMax} from '../../frontend/analytics/replenishment-minmax.js';
import {db} from '../db.mjs';
import {readStoreSalesRange} from './dynamics-sales.mjs';
import {readStoreStockSnapshot,readWarehouseStockSnapshot} from './dynamics-stock.mjs';
import {listExpectedPurchaseOrders,listExpectedTransferOrders} from './dynamics-receiving.mjs';
import {assortmentIndex} from './assortment-resolver.mjs';
import {productTaxonomy} from './assortment.mjs';
import {releasedProductSourcingMany} from './released-product-sourcing.mjs';
import {listReplenishmentRules,resolveReplenishmentPolicy} from './replenishment-policy.mjs';
import {convertQuantity} from './unit-conversion.mjs';

const shift=(day,days)=>new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const clean=value=>String(value??'').trim().toUpperCase();
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const sourceError=message=>Object.assign(new Error(message),{code:'REPLENISHMENT_INCOMPLETE'});
const businessDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

function quantity(value,from,to){
 if(!finite(value)||value<0||!clean(from)||!clean(to))return null;
 if(clean(from)===clean(to))return value;
 return convertQuantity(value,from,to).quantity;
}

export function observedUnits(row,unit){
 const entries=Object.entries(row.quantityByUnit||{});
 if(!entries.length||!finite(row.units)||row.units<0)return null;
 const total=entries.reduce((sum,[,amount])=>sum+amount,0);
 if(!Number.isFinite(total)||Math.abs(total-row.units)>0.02)return null;
 const values=entries.map(([from,amount])=>quantity(amount,from,unit));
 return values.some(value=>value===null)?null:values.reduce((sum,value)=>sum+value,0);
}

export function datedInbound(lines,unit,day,leadDays,mode){
 const lastDay=shift(day,Math.ceil(leadDays));
 let amount=0;
 for(const line of lines){
  const remaining=mode==='PO'?line.remainingQty:line.planningRemaining;
  if(!finite(remaining)||remaining<0)return null;
  if(remaining===0)continue;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(line.planningDate||'')||!Number.isFinite(Date.parse(line.planningDate))||shift(line.planningDate,0)!==line.planningDate||line.planningDate<day)return null;
  if(line.planningDate>lastDay)continue;
  const converted=quantity(remaining,line.unit,unit);
  if(converted===null)return null;
  amount+=converted;
 }
 return amount;
}

function indexedStock(snapshot){
 if(!snapshot.complete||snapshot.status!=='READY')throw sourceError('Lecture du stock incomplète.');
 return new Map(snapshot.items.map(row=>[clean(row.productNumber),row.availableOnHandQuantity]));
}

async function fullStoreStock(storeId){
 for(let page=0;page<60;page++){
  const stock=await readStoreStockSnapshot(storeId);
  if(stock.status!=='PREPARING')return stock;
  const delay=Math.max(100,stock.progress?.retryAfterMs||0);
  await new Promise(resolve=>setTimeout(resolve,delay));
 }
 throw sourceError('Lecture du stock magasin trop longue.');
}

function observedSupplierLeadDays(warehouse,day){
 const rows=db.prepare(`SELECT source_vendor_account AS supplier,source_created_date AS created,posted_at AS received FROM receipts
  WHERE source='D365' AND document_type='PO' AND status='POSTED' AND source_warehouse_id=? AND posted_at>=? AND source_created_date IS NOT NULL`).all(warehouse,shift(day,-180));
 const samples=new Map();
 for(const row of rows){
  const supplier=clean(row.supplier),days=(Date.parse(String(row.received).slice(0,10))-Date.parse(String(row.created).slice(0,10)))/86400000;
  if(!supplier||!Number.isInteger(days)||days<0||days>180)continue;
  if(!samples.has(supplier))samples.set(supplier,[]);
  samples.get(supplier).push(days);
 }
 return new Map([...samples].filter(([,values])=>values.length>=3).map(([supplier,values])=>[supplier,values.sort((a,b)=>a-b)[Math.floor(values.length/2)]]));
}

export async function generateReplenishmentOrder(input,{progress=(_label,_completed,_total)=>{},readSales=readStoreSalesRange,readAssortment=assortmentIndex,readWarehouse=readWarehouseStockSnapshot,readStore=fullStoreStock,readPO=listExpectedPurchaseOrders,readTO=listExpectedTransferOrders,readReferences=releasedProductSourcingMany,readRules=listReplenishmentRules,readTaxonomy=productTaxonomy,readLeadDays=observedSupplierLeadDays}={}){
 const {mode,stores,warehouse}=input;
 const day=businessDay(),end=shift(day,-1),start=shift(end,-27),store=stores[0];
 const demand=new Map();
 const incoming=new Map();
 for(const [index,shop] of stores.entries()){
  await progress(`Lecture des ventes · ${shop.name}`,index,stores.length);
  const sales=await readSales(shop.id,{startDate:start,endDate:end,exportLean:true});
  if(sales.status!=='READY'||sales.diagnostics?.truncated||sales.days!==28)throw sourceError(`Historique de ventes incomplet pour ${shop.name}.`);
  const assortment=readAssortment(shop.id,{businessDate:day,maxAgeHours:36});
  if(assortment.status!=='READY'||!assortment.included?.size)throw sourceError(`Assortiment à synchroniser pour ${shop.name}.`);
  for(const row of sales.products){
   const sku=clean(row.key);
   if(!sku||!assortment.included.has(sku))continue;
   if(!demand.has(sku))demand.set(sku,[]);
   demand.get(sku).push(row);
  }
 }
 await progress('Lecture des stocks et commandes ouvertes',0,1);
 const [warehouseStock,storeStock,orders]=await Promise.all([
  readWarehouse(warehouse,{strict:true}),
  mode==='TO'?readStore(store.id):Promise.resolve(null),
  mode==='PO'?readPO(store.id,{businessDate:day,planningWarehouse:warehouse}):readTO(store.id,{businessDate:day,planning:true})
 ]);
 const central=indexedStock(warehouseStock),local=mode==='TO'?indexedStock(storeStock):central;
 if(orders.mode!=='LIVE'||orders.diagnostics?.authoritative!==true||orders.diagnostics?.truncated||orders.diagnostics?.hiddenOldPo||orders.diagnostics?.hiddenOldTo)throw sourceError('Commandes ouvertes incomplètes. Les arrivages ne peuvent pas être calculés.');
 if(orders.items.some(order=>!Array.isArray(order.lines)||!order.lines.length||order.lines.some(line=>!clean(line.productNumber))))throw sourceError('Des commandes ouvertes ont des lignes manquantes.');
 for(const order of orders.items)for(const line of order.lines){
  const sku=clean(line.productNumber);
  if(!incoming.has(sku))incoming.set(sku,[]);
  incoming.get(sku).push(line);
 }
 const rows=[],blocked=[],codes=[...demand.keys()];
 const rules=readRules({storeId:mode==='TO'?store.id:null});
 const observedLead=mode==='PO'?readLeadDays(warehouse,day):new Map();
 const reviewDays=mode==='PO'?3:2;
 for(let offset=0;offset<codes.length;offset+=120){
  await progress('Calcul des quantités par référence',offset,codes.length);
  const batch=codes.slice(offset,offset+120),references=await readReferences(batch);
  for(const sku of batch){
   const ref=references.get(sku),sales=demand.get(sku),name=ref?.productName||sales[0]?.label||sku;
   const reject=reason=>blocked.push({sku,name,reason});
   if(ref?.supplyMode==='DIRECT_SUPPLIER')continue;
   if(ref?.supplyMode!=='WAREHOUSE'){reject('Flux entrepôt non confirmé');continue;}
   const unit=mode==='PO'?ref.purchaseUnit:ref.inventoryUnit;
   const usages=sales.map(row=>observedUnits(row,unit));
   if(!unit||usages.some(value=>value===null)){reject('Unités de vente, de stock ou de commande à rapprocher');continue;}
   const usage=usages.reduce((sum,value)=>sum+value,0)/28;
   if(usage<=0)continue;
   const available=quantity(local.has(sku)?local.get(sku):0,ref.inventoryUnit,unit);
   const supply=quantity(central.has(sku)?central.get(sku):0,ref.inventoryUnit,unit);
   if(available===null||supply===null){reject('Stock indisponible ou négatif');continue;}
   const supplier=ref.primaryVendorAccount;
   if(mode==='PO'&&!supplier){reject('Fournisseur principal absent');continue;}
   const {policy,source}=resolveReplenishmentPolicy({storeId:mode==='TO'?store.id:null,productNumber:sku,taxonomy:readTaxonomy(sku),businessDate:day,rules});
   const leadDays=mode==='PO'&&!source.leadTimeDays.ruleId?observedLead.get(clean(supplier)):policy.leadTimeDays;
   if(!finite(leadDays)){reject('Délai fournisseur absent des règles et de l’historique');continue;}
   const inbound=datedInbound(incoming.get(sku)||[],unit,day,leadDays,mode);
   if(inbound===null){reject('Quantité, date ou unité d’un arrivage à confirmer');continue;}
   const calculated=calculateMinMax({mode,usage,leadDays,safetyDays:policy.safetyDays,reviewDays,available,inbound,sourceAvailable:supply,pack:policy.packSize,minimumOrder:mode==='PO'?policy.minOrderQty:0});
   if(!calculated.need)continue;
   if(!calculated.quantity){reject('Stock entrepôt insuffisant pour un colis');continue;}
   const leadSource=source.leadTimeDays.ruleId?source.leadTimeDays.label:mode==='PO'?'Historique réception':'Règle par défaut';
   rows.push({sku,name,supplier:mode==='PO'?supplier:null,warehouse,store:mode==='TO'?store.name:null,destination:mode==='TO'?store.destination:warehouse,unit,usage,available,inbound,leadDays,leadSource,pack:policy.packSize,...calculated});
  }
 }
 rows.sort((a,b)=>String(a.supplier||'').localeCompare(String(b.supplier||''))||a.sku.localeCompare(b.sku));
 return {mode,warehouse,store:mode==='TO'?store.name:null,stores:stores.map(s=>s.name),start,end,reviewDays,rows,blocked,examined:codes.length,demandBasis:mode==='PO'?'Consommation estimée par les ventes des magasins desservis':'Ventes magasin sur 28 jours clos'};
}

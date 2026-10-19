import { config } from '../config.mjs';
import { odataGetAll, probeDataEntity } from './dynamics.mjs';
import { productTaxonomy } from './assortment.mjs';
import { storeOperationalSettings } from './store-settings.mjs';
import { effectiveD365SalesMapping,salesStoreIdentifiers } from './d365-sales-mapping.mjs';
import { analyticsCacheKey, readAnalyticsCache, writeAnalyticsCache } from './analytics-persistent-cache.mjs';
import { releasedProductSourcingMany } from './released-product-sourcing.mjs';
import { inferTransactionCostKind, evaluateTransactionMarginRows, selectTransactionCostSemantics } from './sales-margin-engine.mjs';

const clean=v=>String(v??'').trim();
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const nullable=v=>v===null||v===undefined||v===''?null:Number(v);
const validField=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
const validEntity=v=>/^[A-Za-z0-9_]+$/.test(clean(v));
const esc=v=>String(v).replaceAll("'","''");
const round2=v=>Math.round((num(v)+Number.EPSILON)*100)/100;
const round3=v=>Math.round((num(v)+Number.EPSILON)*1000)/1000;
const velocityCache=new Map();
const salesActivityCache=new Map();
const marginFieldCache=new Map();
async function resolveMarginFields(cfg){
 const c={...cfg,fields:{...(cfg.fields||{})}},cacheKey=c.entity,explicitCost=clean(process.env.D365_SALES_COST_FIELD);
 const cached=marginFieldCache.get(cacheKey);
 if(cached&&Date.now()<cached.expiresAt){
   if(!explicitCost&&cached.preferredCost)c.fields.cost=cached.preferredCost;
   else if(explicitCost)c.fields.cost=explicitCost;
   if(cached.lineAmountField&&cached.unitCostField&&cached.unitCostField!==c.fields.cost)c.fields.costUnitPrice=cached.unitCostField;
   if(!c.fields.salesUnit&&cached.salesUnit)c.fields.salesUnit=cached.salesUnit;
   if(!c.fields.inventoryUnit&&cached.inventoryUnit)c.fields.inventoryUnit=cached.inventoryUnit;
   if(!c.fields.name&&cached.productName)c.fields.name=cached.productName;
   if((!c.fields.staff||c.fields.staff==='staffId')&&cached.staff)c.fields.staff=cached.staff;
   if(cached.marginNet)c.fields.marginNet=cached.marginNet;
   if(cached.taxAmount)c.fields.taxAmount=cached.taxAmount;
   return c
 }
 try{
   const probe=await probeDataEntity(c.entity,{top:3,extra:config.dynamics.dataAreaId?'cross-company=true':''});
   const row=(probe?.rows||[]).find(x=>Object.keys(x||{}).length)||null,keys=Object.keys(row||{});
   const pick=names=>{for(const name of names){const hit=keys.find(k=>k.toLowerCase()===name.toLowerCase());if(hit)return hit}return''};
   // Prefer CostAmount/COGS because RetailTransactionSalesTrans CostAmount is already
   // the historical line cost amount. CostPrice/UnitCost is only a fallback and then
   // needs unit-aware quantity conversion (e.g. kg sold vs g inventory).
   const lineAmountField=pick(['CostAmount','costAmount','CostValue','costValue','COGS','Cogs','TotalCost','LineCost']);
   const unitCostField=pick(['CostPrice','costPrice','UnitCost','unitCost','InventoryCostPrice']);
   const preferredCost=explicitCost||lineAmountField||c.fields.cost||unitCostField;
   const present=field=>field&&keys.some(k=>k.toLowerCase()===String(field).toLowerCase());
   const salesUnit=present(c.fields.salesUnit)?c.fields.salesUnit:pick(['SalesUnit','SalesUnitSymbol','salesUnit','Unit','UnitId','UnitOfMeasure']);
   const inventoryUnit=present(c.fields.inventoryUnit)?c.fields.inventoryUnit:pick(['InventoryUnit','InventoryUnitSymbol','InventUnit','InventoryUnitId','InventoryUnitOfMeasure']);
   const productName=present(c.fields.name)?c.fields.name:pick(['ProductName','productName','ItemName','itemName','Name','Description']);
   const staff=present(c.fields.staff)?c.fields.staff:pick(['StaffId','staffId','OperatorId','operatorId','PersonnelNumber','EmployeeId']);
   const marginNet=pick(['NetAmount','netAmount','NetAmountExclTax','NetAmountExcludingTax','NetAmountWithoutTax','AmountExclTax']);
   const taxAmount=pick(['TaxAmount','taxAmount','SalesTaxAmount','SalesTax','TaxValue']);
   marginFieldCache.set(cacheKey,{preferredCost,lineAmountField,unitCostField,salesUnit,inventoryUnit,productName,staff,marginNet,taxAmount,expiresAt:Date.now()+30*60*1000});
   if(preferredCost)c.fields.cost=preferredCost;
   if(lineAmountField&&unitCostField&&unitCostField!==preferredCost)c.fields.costUnitPrice=unitCostField;
   if(salesUnit)c.fields.salesUnit=salesUnit;
   if(inventoryUnit)c.fields.inventoryUnit=inventoryUnit;
   if(productName)c.fields.name=productName;
   if(staff)c.fields.staff=staff;
   if(marginNet&&marginNet!==c.fields.net)c.fields.marginNet=marginNet;
   if(taxAmount)c.fields.taxAmount=taxAmount
 }catch{if(explicitCost)c.fields.cost=explicitCost}
 return c
}


function parseMap(raw=''){
 const s=clean(raw);if(!s)return{};
 if(s.startsWith('{')){try{const x=JSON.parse(s);return x&&typeof x==='object'?x:{}}catch{return{}}}
 return Object.fromEntries(s.split(',').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i>0?[x.slice(0,i).trim(),x.slice(i+1).trim()]:null}).filter(Boolean));
}
function field(name,fallback=''){const v=clean(process.env[name]||fallback);return validField(v)?v:''}
function salesLive(saved=null){return config.dynamics.mode==='live'&&(saved?.state==='LIVE'||(config.dynamics.read?.sales||clean(process.env.D365_SALES_READ_MODE).toLowerCase())==='live')}
function nextDate(day,delta=1){const d=new Date(`${day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
function dateOnly(v){const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function dateFilter(f,day,configuredMode=null){
 const mode=clean(configuredMode||process.env.D365_SALES_DATE_FILTER_MODE||'datetime').toLowerCase();
 if(mode==='date')return `${f} eq ${day}`;
 return `${f} ge ${day}T00:00:00Z and ${f} lt ${nextDate(day)}T00:00:00Z`;
}
function dateRangeFilter(f,startDay,endDay,configuredMode=null){
 const mode=clean(configuredMode||process.env.D365_SALES_DATE_FILTER_MODE||'datetime').toLowerCase();
 if(mode==='date')return `${f} ge ${startDay} and ${f} le ${endDay}`;
 return `${f} ge ${startDay}T00:00:00Z and ${f} lt ${nextDate(endDay)}T00:00:00Z`;
}
export function minuteOfDay(v){
 if(v===null||v===undefined||v==='')return null;
 // D365 Finance & Operations timeOfDay / Commerce TransTime is an integer count of seconds since midnight.
 if(typeof v==='number'&&Number.isFinite(v)&&Number.isInteger(v)&&v>=0&&v<=86399)return Math.floor(v/60);
 const raw=String(v).trim();
 const iso=raw.match(/T(\d{2}):(\d{2})/);if(iso){const h=Number(iso[1]),m=Number(iso[2]);return h<=23&&m<=59?h*60+m:null}
 const colon=raw.match(/^(\d{1,2}):(\d{2})/);if(colon){const h=Number(colon[1]),m=Number(colon[2]);return h<=23&&m<=59?h*60+m:null}
 if(/^\d+$/.test(raw)){
  const digits=raw.replace(/^0+(?=\d)/,'');
  if(digits.length<=2){const h=Number(digits);return h<=23?h*60:null}
  const padded=digits.length===3?'0'+digits:digits;
  if(padded.length===4||padded.length===6){
   const h=Number(padded.slice(0,2)),m=Number(padded.slice(2,4));return h<=23&&m<=59?h*60+m:null
  }
  if(digits.length===5){
   const h=Number(digits.slice(0,1)),m=Number(digits.slice(1,3));if(h<=23&&m<=59)return h*60+m
  }
 }
 return null
}
export function transactionMinute(v,timeField=''){
 if(/^transtime$/i.test(timeField)&&typeof v==='string'&&/^\d+$/.test(v.trim())){const seconds=Number(v);return seconds>=0&&seconds<=86399?Math.floor(seconds/60):null}
 if(/modified|created|pickup|shipping/i.test(timeField))return null;
 return minuteOfDay(v);
}
function hourOf(v,timeField){const m=transactionMinute(v,timeField);return m===null?null:Math.floor(m/60)}
function zonedClock(now=new Date(),timeZone=process.env.STOREOPS_BUSINESS_TIME_ZONE||'Africa/Casablanca'){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return{date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour),minute:Number(parts.minute),timeZone}
}
export function salesComparisonCutoff(businessDate,{now=new Date(),timeZone=process.env.STOREOPS_BUSINESS_TIME_ZONE||'Africa/Casablanca'}={}){
 const clock=zonedClock(now,timeZone),day=dateOnly(businessDate);
 if(!day||day!==clock.date)return{mode:'FULL_DAY',cutoffMinute:null,cutoffLabel:null,timeZone:clock.timeZone};
 const cutoffMinute=clock.hour*60+clock.minute;
 return{mode:'SAME_TIME',cutoffMinute,cutoffLabel:`${String(clock.hour).padStart(2,'0')}:${String(clock.minute).padStart(2,'0')}`,timeZone:clock.timeZone}
}
export function applyCutoff(rows,timeField,cutoffMinute){
 const input=Array.isArray(rows)?rows:[];
 if(cutoffMinute===null||cutoffMinute===undefined)return{rows:input,meta:{requested:false,applied:false,complete:true,cutoffMinute:null,cutoffLabel:null,totalRows:input.length,parseableRows:input.length,unparseableRows:0,reason:null}};
 if(!timeField)return{rows:input,meta:{requested:true,applied:false,complete:false,cutoffMinute,cutoffLabel:`${String(Math.floor(cutoffMinute/60)).padStart(2,'0')}:${String(cutoffMinute%60).padStart(2,'0')}`,totalRows:input.length,parseableRows:0,unparseableRows:input.length,reason:'TIME_FIELD_UNMAPPED'}};
 const kept=[];let parseable=0,unparseable=0;
 for(const row of input){const minute=transactionMinute(row?.[timeField],timeField);if(minute===null){unparseable++;continue}parseable++;if(minute<=cutoffMinute)kept.push(row)}
 const complete=unparseable===0;
 return{rows:complete?kept:input,meta:{requested:true,applied:complete,complete,cutoffMinute,cutoffLabel:`${String(Math.floor(cutoffMinute/60)).padStart(2,'0')}:${String(cutoffMinute%60).padStart(2,'0')}`,totalRows:input.length,parseableRows:parseable,unparseableRows:unparseable,reason:complete?null:'TIME_PARSE_INCOMPLETE'}}
}

export function salesIntegrationConfig(storeId=null){
 const persisted=effectiveD365SalesMapping(),saved=persisted?.state==='LIVE'?persisted:null;
 const entity=clean(saved?.entity||process.env.D365_SALES_ENTITY||'RetailTransactionSalesTransBIEntities'),stores=parseMap(process.env.D365_STORE_RETAIL_IDS||''),storeSettings=storeId?storeOperationalSettings(storeId):null,retailId=storeId?(clean(stores[storeId])||clean(storeSettings?.d365?.retailChannelId)||null):null;
 const fields={
  store:clean(saved?.fields?.channel)||field('D365_SALES_STORE_FIELD','store'),
  date:clean(saved?.fields?.businessDate)||field('D365_SALES_DATE_FIELD','businessDate'),
  transaction:clean(saved?.fields?.transaction)||field('D365_SALES_TRANSACTION_FIELD','transactionId'),
  net:clean(saved?.fields?.net)||field('D365_SALES_NET_FIELD','netAmountInclTax'),
  quantity:clean(saved?.fields?.quantity)||field('D365_SALES_QTY_FIELD','qty'),
  salesUnit:clean(saved?.fields?.salesUnit)||field('D365_SALES_UNIT_FIELD',''),
  inventoryUnit:field('D365_SALES_INVENTORY_UNIT_FIELD',''),
  product:clean(saved?.fields?.product)||field('D365_SALES_PRODUCT_FIELD','itemId'),
  name:clean(saved?.fields?.productName)||field('D365_SALES_PRODUCT_NAME_FIELD',''),
  cost:clean(saved?.fields?.cost)||field('D365_SALES_COST_FIELD',''),
  time:entity==='RetailTransactionSalesTransBIEntities'?'transTime':clean(saved?.fields?.time)||field('D365_SALES_TIME_FIELD','time'),
  department:clean(saved?.fields?.department)||field('D365_SALES_DEPARTMENT_FIELD',''),
  category:clean(saved?.fields?.category)||field('D365_SALES_CATEGORY_FIELD',''),
  customer:clean(saved?.fields?.customer)||field('D365_SALES_CUSTOMER_FIELD','custAccount'),
  staff:clean(saved?.fields?.staff)||field('D365_SALES_STAFF_FIELD','staffId'),
  status:field('D365_SALES_STATUS_FIELD','transactionStatus'),
  returnNoSale:field('D365_SALES_RETURN_NO_SALE_FIELD',/^RetailTransactionSalesTransBIEntit/i.test(entity)?'returnNoSale':''),
  taxItemGroup:field('D365_SALES_TAX_ITEM_GROUP_FIELD',/^RetailTransactionSalesTransBIEntit/i.test(entity)?'TaxItemGroup':'')
 };
 const required=[['entity',validEntity(entity)],['store',!!fields.store],['date',!!fields.date],['transaction',!!fields.transaction],['net',!!fields.net]];
 const missing=required.filter(([,ok])=>!ok).map(([k])=>k);
 if(storeId&&!retailId)missing.push('storeMapping');
 const live=salesLive(saved);
 const storeFilterCandidates=storeId?salesStoreIdentifiers(storeId,fields.store):[];
 return{mode:live?'LIVE':'DISABLED',entity,storeId,retailId,retailIdSource:clean(stores[storeId])?'ENV_CONFIG':storeSettings?.d365?.retailChannelId?'STORE_SETTINGS':null,stores,fields,missing,ready:live&&missing.length===0,mappingSource:saved?'STOREOPS_VALIDATED_MAPPING':'ENV_CONFIG',mappingState:persisted?.state||null,dateFilterMode:saved?.dateFilterMode||clean(process.env.D365_SALES_DATE_FILTER_MODE||'datetime').toLowerCase(),pageSize:Math.max(100,Math.min(2000,Number(process.env.D365_SALES_PAGE_SIZE)||1000)),maxRows:Math.max(1000,Math.min(100000,Number(process.env.D365_SALES_MAX_ROWS)||50000)),sign:saved?.salesSign??(Number(process.env.D365_SALES_SIGN||-1)||-1),costSign:saved?.costSign??(Number(process.env.D365_SALES_COST_SIGN||-1)||-1),quantitySign:saved?.quantitySign??(Number(process.env.D365_SALES_QTY_SIGN||1)||1),storeFilterCandidates};
}

function taxonomyLabels(productNumber){
 const rows=productTaxonomy(productNumber)||[];if(!rows.length)return{department:null,category:null};
 const sorted=[...rows].sort((a,b)=>(Number(a.level)||999)-(Number(b.level)||999));
 return{department:sorted[0]?.category_name||null,category:sorted.at(-1)?.category_name||null};
}

function amountFieldLooksTaxInclusive(field=''){
 return /incltax|includingtax|gross|totalamount|ttc/i.test(clean(field))
}

/**
 * Business-facing CA is TTC. Some persisted/auto-discovered D365 mappings point at
 * NetAmount (HT) while RetailTransactionSalesTrans also exposes TaxAmount.
 * Reconstruct TTC deterministically instead of silently publishing HT as CA.
 */
export function retailDisplaySalesAmount(row,cfg={}){
 const f=cfg.fields||{},sign=Number(cfg.sign||-1),raw=Number(row?.[f.net]);
 if(!Number.isFinite(raw))return 0;
 const base=raw*sign;
 if(amountFieldLooksTaxInclusive(f.net))return round2(base);
 const taxRaw=f.taxAmount?Number(row?.[f.taxAmount]):NaN;
 if(Number.isFinite(taxRaw))return round2(base+Math.abs(taxRaw));
 return round2(base)
}

function excludedTaxItemGroups(){
 return new Set(clean(process.env.D365_SALES_EXCLUDED_TAX_ITEM_GROUPS||'ExoColl').split(',').map(x=>x.replace(/\s+/g,'').toUpperCase()).filter(Boolean))
}
function includedRetailSaleRow(row,cfg={}){
 const f=cfg.fields||{},sales=retailDisplaySalesAmount(row,cfg);
 if(!(sales>0&&sales<100000))return false;
 const status=clean(f.status?row?.[f.status]:'').toUpperCase();
 if(['VOIDED','CANCELLED','CANCELED'].includes(status))return false;
 const noSale=clean(f.returnNoSale?row?.[f.returnNoSale]:'').toUpperCase();
 if(['YES','Y','TRUE','1'].includes(noSale))return false;
 const tax=clean(f.taxItemGroup?row?.[f.taxItemGroup]:'').replace(/\s+/g,'').toUpperCase();
 if(tax&&excludedTaxItemGroups().has(tax))return false;
 return true
}

export function aggregateSalesRows(rows=[],cfg={}){
 const f=cfg.fields||{},sign=Number(cfg.sign||-1),tickets=new Set(),identifiedTickets=new Set(),products=new Map(),departments=new Map(),categories=new Map(),hours=new Map(),excludedTransactions=new Set();
 const directCostKind=inferTransactionCostKind(f.cost,process.env.D365_SALES_COST_KIND||process.env.RETAIL_MARGIN_COST_KIND||'');
 let netSales=0,identifiedNetSales=0,units=0,costValue=0,costMapped=!!f.cost&&directCostKind==='LINE_AMOUNT',excludedRows=0,excludedSalesValue=0,includedRows=0,lastSaleMinute=null,untimedRows=0,rawPositiveSales=0;
 const exclusionReasons={amount:{rows:0,sales:0},status:{rows:0,sales:0},returnNoSale:{rows:0,sales:0},taxItemGroup:{rows:0,sales:0}};
 const hourTickets=new Map();
 const identifiedCustomer=v=>{const s=clean(v).toUpperCase();return !!s&&!['ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN','0'].includes(s)};
 const add=(map,key,label,sales,qty,cost,unit=null)=>{if(!key)return;const cur=map.get(key)||{key:String(key),label:String(label||key),sales:0,units:0,costValue:0,quantityByUnit:new Map()};cur.sales+=sales;cur.units+=qty;cur.costValue+=cost;const u=clean(unit);if(u)cur.quantityByUnit.set(u,(cur.quantityByUnit.get(u)||0)+qty);map.set(key,cur)};
 for(const r of Array.isArray(rows)?rows:[]){
  const tx=clean(r[f.transaction]),sales=retailDisplaySalesAmount(r,cfg);
  if(sales>0&&sales<100000)rawPositiveSales+=sales;
  if(!includedRetailSaleRow(r,cfg)){
   excludedRows+=1;excludedSalesValue+=Math.abs(sales);if(tx)excludedTransactions.add(tx);
   if(!(sales>0&&sales<100000)){exclusionReasons.amount.rows++;exclusionReasons.amount.sales+=Math.abs(sales)}
   else{
    const status=clean(f.status?r?.[f.status]:'').toUpperCase(),noSale=clean(f.returnNoSale?r?.[f.returnNoSale]:'').toUpperCase(),tax=clean(f.taxItemGroup?r?.[f.taxItemGroup]:'').replace(/\s+/g,'').toUpperCase();
    if(['VOIDED','CANCELLED','CANCELED'].includes(status)){exclusionReasons.status.rows++;exclusionReasons.status.sales+=Math.abs(sales)}
    else if(['YES','Y','TRUE','1'].includes(noSale)){exclusionReasons.returnNoSale.rows++;exclusionReasons.returnNoSale.sales+=Math.abs(sales)}
    else if(tax&&excludedTaxItemGroups().has(tax)){exclusionReasons.taxItemGroup.rows++;exclusionReasons.taxItemGroup.sales+=Math.abs(sales)}
   }
   continue;
  }
  includedRows+=1;
  const rawQty=num(f.quantity?r[f.quantity]:0),qty=f.quantity?(rawQty===0?0:(sales===0?Math.abs(rawQty):Math.sign(sales)*Math.abs(rawQty))):0,cost=costMapped?round2(Math.abs(num(r[f.cost]))):0;
  netSales+=sales;units+=qty;costValue+=cost;if(tx)tickets.add(tx);
  const identified=identifiedCustomer(f.customer?r[f.customer]:'');if(identified){identifiedNetSales+=sales;if(tx)identifiedTickets.add(tx)}
  const productNumber=clean(f.product?r[f.product]:'')||'UNMAPPED',name=clean(f.name?r[f.name]:'')||productNumber,tax=taxonomyLabels(productNumber),salesUnit=clean(f.salesUnit?r[f.salesUnit]:'');
  add(products,productNumber,name,sales,qty,cost,salesUnit);
  const dep=clean(f.department?r[f.department]:'')||tax.department,cat=clean(f.category?r[f.category]:'')||tax.category;
  if(dep)add(departments,dep,dep,sales,qty,cost);if(cat)add(categories,cat,cat,sales,qty,cost);
  const minute=transactionMinute(f.time?r[f.time]:null,f.time),hour=hourOf(f.time?r[f.time]:null,f.time);if(hour!==null){lastSaleMinute=Math.max(lastSaleMinute??0,minute);add(hours,String(hour),`${String(hour).padStart(2,'0')}:00`,sales,qty,cost);if(!hourTickets.has(String(hour)))hourTickets.set(String(hour),new Set());if(tx)hourTickets.get(String(hour)).add(tx)}else untimedRows++;
 }
 const finish=map=>[...map.values()].map(x=>{const q=[...(x.quantityByUnit||new Map()).entries()].filter(([,v])=>Number(v)!==0);return{key:x.key,label:x.label,sales:round2(x.sales),units:round2(x.units),quantityUnit:q.length===1?q[0][0]:null,quantityByUnit:Object.fromEntries(q.map(([u,v])=>[u,round2(v)])),marginValue:costMapped?round2(x.sales-x.costValue):null,marginRate:costMapped&&x.sales?round2(((x.sales-x.costValue)/x.sales)*100):null}}).sort((a,b)=>b.sales-a.sales);
 netSales=round2(netSales);costValue=round2(costValue);
 const identifiedSales=round2(identifiedNetSales),identifiedTicketCount=identifiedTickets.size,nonLoyaltyTickets=Math.max(0,tickets.size-identifiedTicketCount);
 return{lastSaleMinute,untimedRows,sales:netSales,netSales,tickets:tickets.size,units:round2(units),marginValue:costMapped?round2(netSales-costValue):null,marginRate:costMapped&&netSales?round2(((netSales-costValue)/netSales)*100):null,loyalty:{identifiedSales,identifiedSalesShare:netSales?round2((identifiedSales/netSales)*100):null,identifiedTickets:identifiedTicketCount,nonLoyaltyTickets,identifiedTicketRate:tickets.size?round2((identifiedTicketCount/tickets.size)*100):null,recruitments:null,recruitmentRateNonLoyalty:null,recruitmentSource:'UNMAPPED'},departments:finish(departments),categories:finish(categories),products:finish(products),hourly:finish(hours).map(h=>({...h,tickets:hourTickets.get(h.key)?.size||0})),rowCount:Array.isArray(rows)?rows.length:0,includedRowCount:includedRows,dataQuality:{excludedRows,excludedTransactions:excludedTransactions.size,excludedSalesValue:round2(excludedSalesValue),rawPositiveSales:round2(rawPositiveSales),filteredSales:round2(netSales),filterGap:round2(rawPositiveSales-netSales),exclusionReasons:Object.fromEntries(Object.entries(exclusionReasons).map(([k,v])=>[k,{rows:v.rows,sales:round2(v.sales)}])),excludedTaxItemGroups:[...excludedTaxItemGroups()],reason:'STORE_SALES_PARITY_FILTERS'}};
}

function literalFilters(field,value){
 const raw=clean(value),escaped=esc(raw),out=[`${field} eq '${escaped}'`];
 if(/^-?\d+(?:\.\d+)?$/.test(raw))out.push(`${field} eq ${raw}`);
 return [...new Set(out)]
}
export async function readStoreSalesDay(storeId,businessDate,{cutoffMinute=null}={}){
 const c=salesIntegrationConfig(storeId);if(!c.ready)return{status:'UNAVAILABLE',source:'D365',storeId,businessDate,config:{mode:c.mode,entity:c.entity,retailId:c.retailId,retailIdSource:c.retailIdSource,missing:c.missing},data:null};
 const select=[...Object.values(c.fields),config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const identifiers=c.storeFilterCandidates?.length?c.storeFilterCandidates:[{kind:'RETAIL_CHANNEL',value:c.retailId}],dateModes=[c.dateFilterMode,c.dateFilterMode==='date'?'datetime':'date'];
 let firstEmpty=null,lastError=null;
 for(const identifier of identifiers){
  for(const storeFilter of literalFilters(c.fields.store,identifier.value)){
   for(const mode of [...new Set(dateModes)]){
    const filters=[storeFilter,dateFilter(c.fields.date,businessDate,mode)];
    if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
    try{
     const fetched=await odataGetAll(c.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize,maxRows:c.maxRows});
     const cutoff=applyCutoff(fetched.value,c.fields.time,cutoffMinute),result={status:'READY',source:`D365/${c.entity}`,storeId,businessDate,config:{entity:c.entity,retailId:c.retailId,retailIdSource:c.retailIdSource,storeIdentifierKind:identifier.kind,storeIdentifier:identifier.value,dateFilterMode:mode,timeField:c.fields.time||null},data:{...aggregateSalesRows(cutoff.rows,c),pages:fetched.pages,truncated:!!fetched.truncated,cutoff:cutoff.meta,rawRowCount:(fetched.value||[]).length}};
     if((fetched.value||[]).length)return result;
     firstEmpty=firstEmpty||result;
    }catch(error){lastError=error}
   }
  }
 }
 if(firstEmpty)return firstEmpty;
 throw lastError||Object.assign(new Error('Lecture ventes D365 impossible.'),{code:'D365_SALES_READ_FAILED'});
}


export async function readStoreSalesActivityWindow(storeId,{businessDate=new Date().toISOString().slice(0,10),days=30,force=false}={}){
 const c=salesIntegrationConfig(storeId),windowDays=Math.max(7,Math.min(90,Number(days)||30)),end=dateOnly(businessDate)||new Date().toISOString().slice(0,10),start=nextDate(end,-(windowDays-1));
 if(!c.ready||!c.fields.product)return{status:'UNAVAILABLE',source:'D365',storeId,businessDate:end,windowDays,startDay:start,endDay:end,products:[],missing:[...new Set([...(c.missing||[]),!c.fields.product?'productField':null].filter(Boolean))]};
 const cacheSeconds=Math.max(300,Math.min(86400,Number(process.env.STOREOPS_SALES_ACTIVITY_CACHE_SECONDS)||21600)),cacheKey=`${storeId}|${start}|${end}|${windowDays}`,persistentKey=analyticsCacheKey('sales-activity-v3',[storeId,start,end,windowDays]);
 const cached=salesActivityCache.get(cacheKey);if(!force&&cached&&Date.now()<cached.expiresAt)return cached.value;
 if(!force){const persistent=await readAnalyticsCache(persistentKey);if(persistent){salesActivityCache.set(cacheKey,{value:persistent,expiresAt:Date.now()+cacheSeconds*1000});return{...persistent,cache:{status:'PERSISTENT_HIT'}}}}
 const select=[c.fields.product,c.fields.name,c.fields.net,c.fields.quantity,c.fields.salesUnit,c.fields.date,c.fields.status,c.fields.store,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const identifiers=c.storeFilterCandidates?.length?c.storeFilterCandidates:[{kind:'RETAIL_CHANNEL',value:c.retailId}],dateModes=[c.dateFilterMode,c.dateFilterMode==='date'?'datetime':'date'];
 let firstEmpty=null,lastError=null;
 for(const identifier of identifiers){
  for(const storeFilter of literalFilters(c.fields.store,identifier.value)){
   for(const mode of [...new Set(dateModes)]){
    try{
     const chunkDays=Math.max(5,Math.min(15,Number(process.env.STOREOPS_SALES_ACTIVITY_CHUNK_DAYS)||10)),chunks=[];
     for(let chunkStart=start;chunkStart<=end;chunkStart=nextDate(chunkStart,chunkDays)){
      const chunkEndCandidate=nextDate(chunkStart,chunkDays-1),chunkEnd=chunkEndCandidate>end?end:chunkEndCandidate;
      chunks.push({start:chunkStart,end:chunkEnd});
     }
     const chunkResults=await Promise.all(chunks.map(async chunk=>{
      const filters=[storeFilter,dateRangeFilter(c.fields.date,chunk.start,chunk.end,mode)];
      if(c.fields.net)filters.push(`${c.fields.net} ${c.sign<0?'lt':'gt'} 0`);
      if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
      return odataGetAll(c.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize,maxRows:c.maxRows});
     }));
     const rows=chunkResults.flatMap(x=>x.value||[]),rowCount=chunkResults.reduce((s,x)=>s+Number(x.rowCount||0),0),pages=chunkResults.reduce((s,x)=>s+Number(x.pages||0),0),truncated=chunkResults.some(x=>x.truncated)||rowCount>c.maxRows;
     const byProduct=new Map();
     for(const row of rows){
      if(!includedRetailSaleRow(row,c))continue;
      const productNumber=clean(row[c.fields.product]);if(!productNumber)continue;
      const saleValue=num(row[c.fields.net])*c.sign;
      const current=byProduct.get(productNumber)||{productNumber,name:clean(c.fields.name?row[c.fields.name]:'')||productNumber,saleRows:0,salesValue:0,units:0,salesUnit:clean(c.fields.salesUnit?row[c.fields.salesUnit]:'')||null,lastSaleDate:null};
      current.saleRows+=1;current.salesValue+=saleValue;if(current.name===productNumber&&c.fields.name&&clean(row[c.fields.name]))current.name=clean(row[c.fields.name]);if(!current.salesUnit&&c.fields.salesUnit&&clean(row[c.fields.salesUnit]))current.salesUnit=clean(row[c.fields.salesUnit]);if(c.fields.quantity)current.units+=Math.abs(num(row[c.fields.quantity]));const saleDay=dateOnly(c.fields.date?row[c.fields.date]:null);if(saleDay&&(!current.lastSaleDate||saleDay>current.lastSaleDate))current.lastSaleDate=saleDay;
      byProduct.set(productNumber,current);
     }
     const products=[...byProduct.values()].map(x=>({...x,salesValue:round2(x.salesValue),units:round3(x.units)})).sort((a,b)=>b.salesValue-a.salesValue||a.productNumber.localeCompare(b.productNumber));
     const result={status:truncated?'TRUNCATED':'READY',source:`D365/${c.entity}`,storeId,businessDate:end,windowDays,startDay:start,endDay:end,products,rowCount,pages,truncated,chunkDays,chunks:chunks.length,config:{storeIdentifierKind:identifier.kind,storeIdentifier:identifier.value,dateFilterMode:mode}};
     if(rows.length||products.length){salesActivityCache.set(cacheKey,{value:result,expiresAt:Date.now()+cacheSeconds*1000});await writeAnalyticsCache(persistentKey,'sales-activity-v3',result,21600);return result}
     firstEmpty=firstEmpty||result;
    }catch(error){lastError=error}
   }
  }
 }
 if(firstEmpty){salesActivityCache.set(cacheKey,{value:firstEmpty,expiresAt:Date.now()+cacheSeconds*1000});await writeAnalyticsCache(persistentKey,'sales-activity-v3',firstEmpty,21600);return firstEmpty}
 throw lastError||Object.assign(new Error('Lecture activité ventes D365 impossible.'),{code:'D365_SALES_ACTIVITY_READ_FAILED'});
}

export async function readStoreProductSalesVelocity(storeId,productNumber,{businessDate=new Date().toISOString().slice(0,10),days=28}={}){
 const c=salesIntegrationConfig(storeId),windowDays=Math.max(7,Math.min(90,Number(days)||28)),sku=clean(productNumber),end=dateOnly(businessDate)||new Date().toISOString().slice(0,10);
 if(!c.ready||!sku||!c.fields.product||!c.fields.quantity)return{status:'UNAVAILABLE',source:'D365',storeId,productNumber:sku,businessDate:end,dailySales7:null,dailySales28:null,missing:[...new Set([...(c.missing||[]),!c.fields.product?'productField':null,!c.fields.quantity?'quantityField':null].filter(Boolean))]};
 const cacheSeconds=Math.max(30,Math.min(3600,Number(process.env.STOREOPS_SALES_VELOCITY_CACHE_SECONDS)||300)),cacheKey=`${storeId}|${sku}|${end}|${windowDays}`;const cached=velocityCache.get(cacheKey);if(cached&&Date.now()<cached.expiresAt)return cached.value;
 const start=nextDate(end,-(windowDays-1)),start7=nextDate(end,-6),identifiers=c.storeFilterCandidates?.length?c.storeFilterCandidates:[{kind:'RETAIL_CHANNEL',value:c.retailId}],dateModes=[...new Set([c.dateFilterMode,c.dateFilterMode==='date'?'datetime':'date'])],select=[c.fields.date,c.fields.quantity,c.fields.net,c.fields.status,c.fields.product,c.fields.store,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 let firstEmpty=null,lastError=null;
 for(const identifier of identifiers){
  for(const storeFilter of literalFilters(c.fields.store,identifier.value)){
   for(const mode of dateModes){
    const filters=[storeFilter,dateRangeFilter(c.fields.date,start,end,mode),`${c.fields.product} eq '${esc(sku)}'`];
    if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
    try{
     const fetched=await odataGetAll(c.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize,maxRows:c.maxRows});
     if(fetched.truncated){const value={status:'TRUNCATED',source:`D365/${c.entity}`,storeId,productNumber:sku,businessDate:end,dailySales7:null,dailySales28:null,rowCount:fetched.rowCount,pages:fetched.pages,storeIdentifierKind:identifier.kind,storeIdentifier:identifier.value,dateFilterMode:mode};velocityCache.set(cacheKey,{value,expiresAt:Date.now()+cacheSeconds*1000});return value}
     let units7=0,unitsWindow=0,sales7=0,salesWindow=0,lastSaleDate=null,saleRows=0;
     for(const row of fetched.value||[]){
      if(!includedRetailSaleRow(row,c))continue;
      const saleValue=num(row[c.fields.net])*c.sign;
      saleRows+=1;const day=dateOnly(row[c.fields.date]),qty=Math.abs(num(row[c.fields.quantity]));unitsWindow+=qty;salesWindow+=saleValue;
      if(day&&(!lastSaleDate||day>lastSaleDate))lastSaleDate=day;if(day&&day>=start7&&day<=end){units7+=qty;sales7+=saleValue}
     }
     const lastSaleDaysAgo=lastSaleDate?Math.max(0,Math.round((Date.parse(`${end}T00:00:00Z`)-Date.parse(`${lastSaleDate}T00:00:00Z`))/86400000)):null;
     const value={status:'READY',source:`D365/${c.entity}`,storeId,productNumber:sku,businessDate:end,windowDays,dailySales7:round3(Math.max(0,units7)/7),dailySales28:round3(Math.max(0,unitsWindow)/windowDays),dailySalesValue7:round2(Math.max(0,sales7)/7),dailySalesValue28:round2(Math.max(0,salesWindow)/windowDays),lastSaleDate,lastSaleDaysAgo,rowCount:fetched.rowCount,pages:fetched.pages,saleRows,quantitySign:c.quantitySign,storeIdentifierKind:identifier.kind,storeIdentifier:identifier.value,dateFilterMode:mode};
     if(saleRows>0){velocityCache.set(cacheKey,{value,expiresAt:Date.now()+cacheSeconds*1000});return value}
     firstEmpty=firstEmpty||value;
    }catch(error){lastError=error}
   }
  }
 }
 if(firstEmpty){velocityCache.set(cacheKey,{value:firstEmpty,expiresAt:Date.now()+cacheSeconds*1000});return firstEmpty}
 throw lastError||Object.assign(new Error('Lecture vitesse de vente D365 impossible.'),{code:'D365_SALES_VELOCITY_READ_FAILED'});
}

export function salesComparisonDate(day,days=7){return nextDate(day,-Math.abs(Number(days)||7))}


const salesRangeCache=new Map();
function daySpan(startDay,endDay){
 const start=Date.parse(`${startDay}T00:00:00Z`),end=Date.parse(`${endDay}T00:00:00Z`);
 return Number.isFinite(start)&&Number.isFinite(end)&&end>=start?Math.floor((end-start)/86400000)+1:null
}
function validatedMarginConfig(c){
 const raw=clean(process.env.D365_SALES_COST_RELIABILITY||process.env.RETAIL_MARGIN_COST_RELIABILITY).toUpperCase();
 const kind=clean(process.env.D365_SALES_COST_KIND||process.env.RETAIL_MARGIN_COST_KIND).toUpperCase();
 const reliabilityValidated=['VALIDATED','TRUSTED','POSTED','TRANSACTIONAL'].includes(raw);
 // We only aggregate a mapped transaction cost when it is explicitly certified as
 // the TOTAL COST AMOUNT OF THE SALE LINE. CostPrice / unit-cost fields must never
 // be summed as line amounts because weighted products (inventory unit = g) explode
 // the margin by factors such as 1,000.
 const semanticsValidated=kind==='LINE_AMOUNT'||kind==='TOTAL_LINE_COST'||kind==='COGS_LINE_AMOUNT'||kind==='UNIT_COST_INVENTORY'||kind==='UNIT_COST'||kind==='COST_PRICE'||kind==='INVENTORY_UNIT_COST';
 const validated=reliabilityValidated&&semanticsValidated;
 return{
  status:!c.fields.cost?'UNAVAILABLE':validated?'VALIDATED':'UNVALIDATED',
  costField:c.fields.cost||null,
  costKind:kind||null,
  source:c.fields.cost?`D365/${c.entity}.${c.fields.cost}`:null,
  reason:!c.fields.cost?'COST_FIELD_UNMAPPED':!reliabilityValidated?'TRANSACTION_COST_NOT_VALIDATED':!semanticsValidated?'TRANSACTION_COST_SEMANTICS_UNCONFIRMED':null
 }
}
function publicMarginRow(row,margin){
 if(!row)return row;
 if(margin.status==='VALIDATED')return row;
 return{...row,marginValue:null,marginRate:null}
}
function mergeMetricRows(target,rows=[]){
 for(const row of rows){
  const key=String(row.key||''),cur=target.get(key)||{key,label:row.label||key,sales:0,units:0,marginValue:0,marginKnown:true,quantityByUnit:new Map()};
  cur.sales+=num(row.sales);cur.units+=num(row.units);
  const breakdown=row.quantityByUnit&&typeof row.quantityByUnit==='object'?Object.entries(row.quantityByUnit):row.quantityUnit?[[row.quantityUnit,row.units]]:[];
  for(const [unit,value] of breakdown){const u=clean(unit);if(u)cur.quantityByUnit.set(u,(cur.quantityByUnit.get(u)||0)+num(value))}
  if(row.marginValue===null||row.marginValue===undefined)cur.marginKnown=false;
  else cur.marginValue+=num(row.marginValue);
  if((!cur.label||cur.label===key)&&row.label)cur.label=row.label;
  target.set(key,cur)
 }
}
function finishMetricRows(map,margin){
 return[...map.values()].map(x=>{
  const sales=round2(x.sales),marginValue=margin.status==='VALIDATED'&&x.marginKnown?round2(x.marginValue):null,q=[...(x.quantityByUnit||new Map()).entries()].filter(([,v])=>num(v)!==0);
  return{key:x.key,label:x.label,sales,units:round2(x.units),quantityUnit:q.length===1?q[0][0]:null,quantityByUnit:Object.fromEntries(q.map(([u,v])=>[u,round2(v)])),marginValue,marginRate:marginValue!==null&&sales?round2(marginValue/sales*100):null}
 }).sort((a,b)=>b.sales-a.sales||a.key.localeCompare(b.key,'fr'))
}
export async function readStoreSalesRange(storeId,{startDate,endDate,force=false}={}){
 let c=salesIntegrationConfig(storeId);const end=dateOnly(endDate)||new Date().toISOString().slice(0,10),start=dateOnly(startDate)||end,days=daySpan(start,end);
 if(!days||days<1||days>366)return{status:'INVALID_RANGE',storeId,startDate:start,endDate:end,days:null,error:{code:'INVALID_RANGE',message:'La période doit contenir entre 1 et 366 jours.'}};
 if(!c.ready)return{status:'UNAVAILABLE',source:'D365',storeId,startDate:start,endDate:end,days,config:{mode:c.mode,entity:c.entity,missing:c.missing},summary:null};
 const cacheSeconds=Math.max(60,Math.min(3600,Number(process.env.RETAIL_ANALYTICS_RANGE_CACHE_SECONDS)||300)),cacheKey=`v29|${storeId}|${start}|${end}`,persistentKey=analyticsCacheKey('sales-range-v29',[storeId,start,end]);
 const hit=salesRangeCache.get(cacheKey);if(!force&&hit&&Date.now()<hit.expiresAt)return{...hit.value,cache:{status:'MEMORY_HIT'}};
 if(!force){
  const persistent=await readAnalyticsCache(persistentKey);
  if(persistent){salesRangeCache.set(cacheKey,{value:persistent,expiresAt:Date.now()+cacheSeconds*1000});return{...persistent,cache:{status:'PERSISTENT_HIT'}}}
 }

 c=await resolveMarginFields(c);
 const marginConfig=validatedMarginConfig(c);
 const select=[...Object.values(c.fields),config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const identifiers=c.storeFilterCandidates?.length?c.storeFilterCandidates:[{kind:'RETAIL_CHANNEL',value:c.retailId}],dateModes=[...new Set([c.dateFilterMode,c.dateFilterMode==='date'?'datetime':'date'])];
 let selected=null,lastError=null,firstEmpty=null;

 outer:for(const identifier of identifiers){
  for(const storeFilter of literalFilters(c.fields.store,identifier.value)){
   for(const mode of dateModes){
    try{
     const chunkDays=Math.max(5,Math.min(31,Number(process.env.RETAIL_ANALYTICS_RANGE_CHUNK_DAYS)||10)),chunks=[];
     for(let chunkStart=start;chunkStart<=end;chunkStart=nextDate(chunkStart,chunkDays)){
      const candidate=nextDate(chunkStart,chunkDays-1);chunks.push({start:chunkStart,end:candidate>end?end:candidate})
     }
     const rows=[];let pages=0,truncated=false,rowCount=0;
     const concurrency=Math.max(1,Math.min(4,Number(process.env.RETAIL_ANALYTICS_RANGE_CONCURRENCY)||2));
     for(let i=0;i<chunks.length;i+=concurrency){
      const batch=chunks.slice(i,i+concurrency);
      const fetchedBatch=await Promise.all(batch.map(async chunk=>{
       const filters=[storeFilter,dateRangeFilter(c.fields.date,chunk.start,chunk.end,mode)];
       if(c.fields.net)filters.push(c.sign<0?`${c.fields.net} lt 0 and ${c.fields.net} gt -100000`:`${c.fields.net} gt 0 and ${c.fields.net} lt 100000`);
       if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
       return odataGetAll(c.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize,maxRows:c.maxRows});
      }));
      for(const fetched of fetchedBatch){
       rows.push(...(fetched.value||[]));pages+=Number(fetched.pages||0);rowCount+=Number(fetched.rowCount||0);truncated=truncated||!!fetched.truncated
      }
     }
     const candidate={rows,pages,rowCount,truncated,identifier,mode,chunks:chunks.length};
     if(rows.length){selected=candidate;break outer}
     firstEmpty=firstEmpty||candidate;
    }catch(error){lastError=error}
   }
  }
 }
 selected=selected||firstEmpty;
 if(!selected)throw lastError||Object.assign(new Error('Lecture période ventes D365 impossible.'),{code:'D365_SALES_RANGE_FAILED'});

 const totalRaw=aggregateSalesRows(selected.rows,c);
 const includedRows=selected.rows.filter(row=>includedRetailSaleRow(row,c));
 const configuredCostKind=clean(process.env.D365_SALES_COST_KIND||process.env.RETAIL_MARGIN_COST_KIND||'').toUpperCase();
 let evaluationFields=c.fields;
 let detectedCostKind=inferTransactionCostKind(c.fields.cost,configuredCostKind);
 // Franprix-confirmed semantics: the transaction "cost" is a unit cost expressed
 // in the inventory UOM. For weighted items sold in KG while inventory is in G,
 // COGS = quantity_kg * 1000 * cost_per_g. For pieces, factor = 1.
 // When a dedicated CostPrice/UnitCost field is present, never reinterpret
 // CostAmount as a unit cost.
 if(configuredCostKind==='UNIT_COST_INVENTORY'){
   // Business-confirmed Franprix semantics: the transaction cost represents a
   // UNIT COST in the inventory UOM. Field naming is not authoritative here:
   // weighted products can expose a generic/cost-amount-looking field while the
   // numeric value is still cost per inventory unit (often g). Prefer an explicit
   // CostPrice/UnitCost field when present, otherwise use the mapped transaction
   // cost and convert sold quantity from sales UOM to inventory UOM.
   evaluationFields=c.fields.costUnitPrice
     ? {...c.fields,cost:c.fields.costUnitPrice,costUnitPrice:null}
     : c.fields;
   detectedCostKind='UNIT_COST_INVENTORY';
 }
 let marginRefs=new Map();
 // CostAmount is semantically ambiguous in this environment: on weighted / multi-qty
 // lines it can behave like an inventory-unit cost rather than a line-total COGS.
 // Load only product UOM metadata (not product-master cost) so both interpretations
 // can be tested against the same transaction values.
 const needsUnitRefs=!!c.fields.cost&&(detectedCostKind==='UNIT_COST_INVENTORY'||detectedCostKind==='LINE_AMOUNT'||detectedCostKind==='UNKNOWN'||(c.fields.costUnitPrice&&includedRows.some(row=>{const primary=Number(row[c.fields.cost]),fallback=Number(row[c.fields.costUnitPrice]);return(!Number.isFinite(primary)||primary===0)&&Number.isFinite(fallback)&&fallback!==0})));
 if(needsUnitRefs&&c.fields.product){
   const marginSkus=[...new Set(includedRows.filter(row=>{
     const saleUnit=clean(c.fields.salesUnit?row[c.fields.salesUnit]:'');
     const inventoryUnit=clean(c.fields.inventoryUnit?row[c.fields.inventoryUnit]:'');
     const rawCost=Number(evaluationFields.cost?row[evaluationFields.cost]:NaN);
     const needsCostFallback=detectedCostKind==='UNIT_COST_INVENTORY'&&(!Number.isFinite(rawCost)||rawCost===0);
     return !saleUnit||!inventoryUnit||needsCostFallback
   }).map(row=>clean(row[c.fields.product])).filter(Boolean))];
   if(marginSkus.length)marginRefs=await releasedProductSourcingMany(marginSkus);
 }
 const maxProductMasterFallbackPct=Number.isFinite(Number(process.env.RETAIL_MARGIN_MASTER_FALLBACK_MAX_PCT))?Number(process.env.RETAIL_MARGIN_MASTER_FALLBACK_MAX_PCT):5;
 const primaryEval=evaluateTransactionMarginRows({rows:includedRows,fields:evaluationFields,salesSign:c.sign,productRefs:marginRefs,costKind:detectedCostKind,maxProductMasterFallbackPct});
 let marginEval=primaryEval,costKind=detectedCostKind,semanticValidation=null,unitEvalDiagnostic=null;
 if((detectedCostKind==='LINE_AMOUNT'&&configuredCostKind!=='UNIT_COST_INVENTORY')||detectedCostKind==='UNKNOWN'){
   // If the field name does not establish semantics, evaluate BOTH interpretations
   // against the same real transaction rows. This is deliberately strict: only one
   // model may be published unless both models agree within tolerance. It prevents
   // the historic 1,000x g/kg failure mode from ever surfacing as a margin KPI.
   const lineFields=c.fields;
   const lineEval=detectedCostKind==='LINE_AMOUNT'
     ? primaryEval
     : evaluateTransactionMarginRows({rows:includedRows,fields:lineFields,salesSign:c.sign,productRefs:marginRefs,costKind:'LINE_AMOUNT',maxProductMasterFallbackPct});
   const unitFields=c.fields.costUnitPrice?{...c.fields,cost:c.fields.costUnitPrice,costUnitPrice:null}:c.fields;
   const unitEval=evaluateTransactionMarginRows({rows:includedRows,fields:unitFields,salesSign:c.sign,productRefs:marginRefs,costKind:'UNIT_COST_INVENTORY',maxProductMasterFallbackPct});unitEvalDiagnostic=unitEval;
   semanticValidation=selectTransactionCostSemantics({
     lineAmountEval:lineEval,
     unitCostEval:unitEval,
     min:Number.isFinite(Number(process.env.RETAIL_MARGIN_SANITY_MIN))?Number(process.env.RETAIL_MARGIN_SANITY_MIN):0,
     max:Number.isFinite(Number(process.env.RETAIL_MARGIN_SANITY_MAX))?Number(process.env.RETAIL_MARGIN_SANITY_MAX):30,
     tolerancePctPoints:Number.isFinite(Number(process.env.RETAIL_MARGIN_MODEL_TOLERANCE_PCT_POINTS))?Number(process.env.RETAIL_MARGIN_MODEL_TOLERANCE_PCT_POINTS):3
   });
   if(semanticValidation.status==='VALIDATED'&&semanticValidation.evaluation){
     marginEval=semanticValidation.evaluation;
     costKind=semanticValidation.selected;
     evaluationFields=costKind==='UNIT_COST_INVENTORY'?unitFields:lineFields;
   }else{
     const diagnostic=unitEval?.diagnosticMarginRate!=null?unitEval:lineEval;
     marginEval={...diagnostic,status:'UNVALIDATED',available:false,reason:semanticValidation.reason,marginValue:null,marginRate:null};
   }
 }
 const businessMarginMin=Number.isFinite(Number(process.env.RETAIL_MARGIN_SANITY_MIN))?Number(process.env.RETAIL_MARGIN_SANITY_MIN):0;
 const businessMarginMax=Number.isFinite(Number(process.env.RETAIL_MARGIN_SANITY_MAX))?Number(process.env.RETAIL_MARGIN_SANITY_MAX):30;
 if(marginEval.available===true&&Number.isFinite(Number(marginEval.marginRate))&&(Number(marginEval.marginRate)<businessMarginMin||Number(marginEval.marginRate)>businessMarginMax)){
   marginEval={...marginEval,status:'UNVALIDATED',available:false,reason:'BUSINESS_MARGIN_SANITY_FAILED',marginValue:null,marginRate:null}
 }
 const margin={
   status:marginEval.status,
   available:marginEval.available===true,
   source:evaluationFields.cost?('D365/'+c.entity+'.'+evaluationFields.cost):null,
   costField:evaluationFields.cost||null,
   fallbackCostField:c.fields.costUnitPrice||null,
   costKind,
   detectedCostKind,
   configuredCostKind:configuredCostKind||null,
   semanticValidation:semanticValidation?{status:semanticValidation.status,selected:semanticValidation.selected,reason:semanticValidation.reason,rateGapPctPoints:semanticValidation.rateGapPctPoints??null,lineAmountRate:primaryEval?.diagnosticMarginRate??null,unitCostRate:unitEvalDiagnostic?.diagnosticMarginRate??null}:null,
   method:marginEval.method||null,
   basisCoveragePct:marginEval.basisCoveragePct??null,
   coveragePct:marginEval.coveragePct??null,
   salesBasis:marginEval.salesBasis||null,
   salesBasisField:marginEval.salesBasisField||null,
   taxField:marginEval.taxField||null,
   marginSalesBase:marginEval.valuedMarginSales??null,
   valuedMarginSales:marginEval.valuedMarginSales??null,
   totalCost:marginEval.totalCost??null,
   costCrossCheckPct:marginEval.costCrossCheckPct??null,
   reason:marginEval.reason||marginConfig.reason||null,
   diagnosticMarginValue:marginEval.diagnosticMarginValue??null,
   diagnosticMarginRate:marginEval.diagnosticMarginRate??null,
   weightedConversions:marginEval.weightedConversions||0,
   fallbackUnitCostLines:marginEval.fallbackUnitCostLines||0,
   productMasterFallbackLines:marginEval.productMasterFallbackLines||0,
   productMasterFallbackMarginSales:marginEval.productMasterFallbackMarginSales??null,
   productMasterFallbackPct:marginEval.productMasterFallbackPct??null,
   eligibleLines:marginEval.eligibleLines||0,
   valuedLines:marginEval.valuedLines||0,
   missingCostLines:marginEval.missingCostLines||0,
   unknownUnitLines:marginEval.unknownUnitLines||0,
   implausibleLines:marginEval.implausibleLines||0,
   validationMethod:marginEval.available?(marginEval.status==='ESTIMATED'?'HYBRID_TRANSACTION_PLUS_PRODUCT_MASTER_COST':'AUTOMATIC_COVERAGE_AND_PLAUSIBILITY_GATE'):null
 };
 const marginProductMap=marginEval.byProduct||{},marginDateMap=marginEval.byDate||{};
 const productRowsWithMargin=totalRaw.products.map(row=>{
   const m=marginProductMap[row.key],ref=marginRefs.get(row.key),label=ref?.productName||row.label;
   return{...row,label,marginSalesBase:m?.marginSalesBase??null,marginValue:margin.status==='VALIDATED'&&m?.coveragePct>=95&&m?.basisCoveragePct>=99?m.marginValue:null,marginRate:margin.status==='VALIDATED'&&m?.coveragePct>=95&&m?.basisCoveragePct>=99?m.marginRate:null,marginCoveragePct:m?.coveragePct??null,marginBasisCoveragePct:m?.basisCoveragePct??null}
 });
 const dailyMap=new Map(),customerMap=new Map(),identifiedBasketMap=new Map(),staffMap=new Map();
 const weekdayNames=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
 const favourite=map=>{let key=null,value=-1;for(const [k,v] of map||[]){if(v>value){key=k;value=v}}return key};
 for(const row of selected.rows){
  const day=dateOnly(c.fields.date?row[c.fields.date]:null);if(day){if(!dailyMap.has(day))dailyMap.set(day,[]);dailyMap.get(day).push(row)}
  if(c.fields.customer){
   const customer=clean(row[c.fields.customer]),upper=customer.toUpperCase();
   if(customer&&!['ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN','0'].includes(upper)){
    if(!includedRetailSaleRow(row,c))continue;
    const sales=retailDisplaySalesAmount(row,c),tx=clean(row[c.fields.transaction]),product=clean(c.fields.product?row[c.fields.product]:''),qty=c.fields.quantity?Math.abs(num(row[c.fields.quantity])):0,hour=hourOf(c.fields.time?row[c.fields.time]:null,c.fields.time);
    const cur=customerMap.get(customer)||{customerAccount:customer,sales:0,units:0,transactions:new Set(),products:new Map(),dates:new Set(),weekdays:new Map(),hours:new Map(),firstDate:null,lastDate:null};
    cur.sales+=sales;cur.units+=qty;if(tx)cur.transactions.add(tx);
    if(product){const cp=cur.products.get(product)||{sales:0,units:0};cp.sales+=sales;cp.units+=qty;cur.products.set(product,cp)}
    if(day){
      cur.dates.add(day);if(!cur.firstDate||day<cur.firstDate)cur.firstDate=day;if(!cur.lastDate||day>cur.lastDate)cur.lastDate=day;
      const weekday=weekdayNames[new Date(day+'T12:00:00Z').getUTCDay()];cur.weekdays.set(weekday,(cur.weekdays.get(weekday)||0)+1)
    }
    if(hour!==null)cur.hours.set(String(hour),(cur.hours.get(String(hour))||0)+1);
    customerMap.set(customer,cur);
    if(tx){
      const basketKey=`${customer}|${tx}`,basket=identifiedBasketMap.get(basketKey)||{customerAccount:customer,transactionId:tx,date:day,sales:0,units:0,products:new Map()};
      basket.sales+=sales;basket.units+=qty;if(product)basket.products.set(product,(basket.products.get(product)||0)+sales);identifiedBasketMap.set(basketKey,basket)
    }
   }
  }
  if(c.fields.staff){
    const staffId=clean(row[c.fields.staff]);
    if(staffId){
      if(includedRetailSaleRow(row,c)){
        const sales=retailDisplaySalesAmount(row,c),tx=clean(row[c.fields.transaction]),customer=clean(c.fields.customer?row[c.fields.customer]:'').toUpperCase();
        const identified=!!customer&&!['ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN','0'].includes(customer);
        const cur=staffMap.get(staffId)||{staffId,sales:0,transactions:new Set(),identifiedTransactions:new Set(),identifiedSales:0};
        cur.sales+=sales;if(tx)cur.transactions.add(tx);if(identified){cur.identifiedSales+=sales;if(tx)cur.identifiedTransactions.add(tx)}
        staffMap.set(staffId,cur)
      }
    }
  }
 }
 const daily=[...dailyMap.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>{
  const x=aggregateSalesRows(rows,c),m=marginDateMap[date];return{date,sales:x.sales,tickets:x.tickets,units:x.units,marginSalesBase:m?.marginSalesBase??null,marginValue:['VALIDATED','ESTIMATED'].includes(margin.status)&&m?.coveragePct>=95&&m?.basisCoveragePct>=99?m.marginValue:null,marginRate:['VALIDATED','ESTIMATED'].includes(margin.status)&&m?.coveragePct>=95&&m?.basisCoveragePct>=99?m.marginRate:null,identifiedSales:x.loyalty?.identifiedSales??null,identifiedTickets:x.loyalty?.identifiedTickets??null}
 });
 const customers=[...customerMap.values()].map(x=>({
  customerAccount:x.customerAccount,sales:round2(x.sales),units:round2(x.units),tickets:x.transactions.size,averageBasket:x.transactions.size?round2(x.sales/x.transactions.size):null,
  averageUnitsPerBasket:x.transactions.size?round2(x.units/x.transactions.size):null,activeDays:x.dates.size,distinctProducts:x.products.size,firstDate:x.firstDate,lastDate:x.lastDate,
  favouriteWeekday:favourite(x.weekdays),favouriteHour:favourite(x.hours),
  topProducts:[...x.products.entries()].sort((a,b)=>b[1].sales-a[1].sales).slice(0,20).map(([productNumber,v])=>({productNumber,sales:round2(v.sales),units:round2(v.units)}))
 })).sort((a,b)=>b.sales-a.sales);
 const staff=[...staffMap.values()].map(x=>({staffId:x.staffId,sales:round2(x.sales),tickets:x.transactions.size,identifiedTickets:x.identifiedTransactions.size,identifiedTicketRate:x.transactions.size?round2(x.identifiedTransactions.size/x.transactions.size*100):null,identifiedSales:round2(x.identifiedSales),identifiedSalesShare:x.sales?round2(x.identifiedSales/x.sales*100):null,nonLoyaltyTickets:Math.max(0,x.transactions.size-x.identifiedTransactions.size),recruitments:null,recruitmentRateNonLoyalty:null})).sort((a,b)=>b.sales-a.sales||b.tickets-a.tickets);
 const identifiedBaskets=[...identifiedBasketMap.values()],pairMap=new Map(),basketProductSales=new Map(),basketProductOccurrences=new Map();
 let totalBasketUnits=0,totalDistinctProducts=0,singleItemBaskets=0,basketValueSum=0;
 const basketValues=[];
 for(const basket of identifiedBaskets){
  totalBasketUnits+=basket.units;
  const products=[...basket.products.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30);
  totalDistinctProducts+=products.length;if(products.length===1)singleItemBaskets++;
  const basketValue=round2(basket.sales);basketValueSum+=basketValue;basketValues.push(basketValue);
  for(const [sku,sales] of products){
    basketProductSales.set(sku,(basketProductSales.get(sku)||0)+sales);
    basketProductOccurrences.set(sku,(basketProductOccurrences.get(sku)||0)+1)
  }
  for(let i=0;i<products.length;i++)for(let j=i+1;j<products.length;j++){
    const a=products[i][0],b=products[j][0],key=a<b?`${a}|${b}`:`${b}|${a}`,cur=pairMap.get(key)||{productA:a<b?a:b,productB:a<b?b:a,tickets:0};
    cur.tickets++;pairMap.set(key,cur)
  }
 }
 const sortedBasketValues=[...basketValues].sort((a,b)=>a-b),percentile=p=>sortedBasketValues.length?sortedBasketValues[Math.min(sortedBasketValues.length-1,Math.max(0,Math.floor((sortedBasketValues.length-1)*p)))]:null;
 const topProductsByPenetration=[...basketProductOccurrences.entries()].map(([productNumber,tickets])=>({productNumber,tickets,sharePct:identifiedBaskets.length?round2(tickets/identifiedBaskets.length*100):null,sales:round2(basketProductSales.get(productNumber)||0)})).sort((a,b)=>b.tickets-a.tickets||b.sales-a.sales).slice(0,30);
 const basketAnalysis={
  identifiedBaskets:identifiedBaskets.length,
  averageBasketValue:identifiedBaskets.length?round2(basketValueSum/identifiedBaskets.length):null,
  medianBasketValue:round2(percentile(.5)),
  p90BasketValue:round2(percentile(.9)),
  averageUnits:identifiedBaskets.length?round2(totalBasketUnits/identifiedBaskets.length):null,
  averageDistinctProducts:identifiedBaskets.length?round2(totalDistinctProducts/identifiedBaskets.length):null,
  singleItemBasketRate:identifiedBaskets.length?round2(singleItemBaskets/identifiedBaskets.length*100):null,
  multiProductBasketRate:identifiedBaskets.length?round2((identifiedBaskets.length-singleItemBaskets)/identifiedBaskets.length*100):null,
  topProducts:[...basketProductSales.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([productNumber,sales])=>({productNumber,sales:round2(sales)})),
  topProductsByPenetration,
  topProductPairs:[...pairMap.values()].sort((a,b)=>b.tickets-a.tickets).slice(0,50).map(x=>({...x,sharePct:identifiedBaskets.length?round2(x.tickets/identifiedBaskets.length*100):null}))
 };
 const value={
  status:selected.truncated?'TRUNCATED':'READY',source:`D365/${c.entity}`,storeId,startDate:start,endDate:end,days,
  summary:{sales:totalRaw.sales,tickets:totalRaw.tickets,units:totalRaw.units,averageBasket:totalRaw.tickets?round2(totalRaw.sales/totalRaw.tickets):null,marginSalesBase:['VALIDATED','ESTIMATED'].includes(margin.status)?marginEval.valuedMarginSales:null,marginValue:['VALIDATED','ESTIMATED'].includes(margin.status)?marginEval.marginValue:null,marginRate:['VALIDATED','ESTIMATED'].includes(margin.status)?marginEval.marginRate:null,identifiedSales:totalRaw.loyalty?.identifiedSales??null,identifiedSalesShare:totalRaw.loyalty?.identifiedSalesShare??null,identifiedTickets:totalRaw.loyalty?.identifiedTickets??null,identifiedTicketRate:totalRaw.loyalty?.identifiedTicketRate??null},
  margin,
  daily,
  products:productRowsWithMargin,
  departments:totalRaw.departments.map(x=>({...x,marginValue:null,marginRate:null})),
  categories:totalRaw.categories.map(x=>({...x,marginValue:null,marginRate:null})),
  customers,
  staff,
  basketAnalysis,
  diagnostics:{
    rowCount:selected.rowCount||selected.rows.length,pages:selected.pages||0,truncated:selected.truncated,chunks:selected.chunks,
    storeIdentifierKind:selected.identifier?.kind||null,storeIdentifier:selected.identifier?.value||null,dateFilterMode:selected.mode,
    filterCoverage:{
      amountBounds:true,
      transactionStatus:!!c.fields.status,
      returnNoSale:!!c.fields.returnNoSale,
      taxItemGroupMapped:!!c.fields.taxItemGroup,
      taxItemGroupExclusionConfigured:excludedTaxItemGroups().size>0
    },
    mappedFields:{
      product:!!c.fields.product,productName:!!c.fields.name,quantity:!!c.fields.quantity,salesUnit:!!c.fields.salesUnit,inventoryUnit:!!c.fields.inventoryUnit,
      customer:!!c.fields.customer,staff:!!c.fields.staff,cost:!!c.fields.cost,time:!!c.fields.time,marginNet:!!c.fields.marginNet,taxAmount:!!c.fields.taxAmount
    }
  }
 };
 salesRangeCache.set(cacheKey,{value,expiresAt:Date.now()+cacheSeconds*1000});
 const today=new Date().toISOString().slice(0,10),persistentTtl=end>=today?900:24*3600;
 await writeAnalyticsCache(persistentKey,'sales-range-v29',value,persistentTtl);
 return{...value,cache:{status:'MISS'}}
}

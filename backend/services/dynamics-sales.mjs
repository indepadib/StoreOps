import { config } from '../config.mjs';
import { odataGetAll } from './dynamics.mjs';
import { productTaxonomy } from './assortment.mjs';
import { storeOperationalSettings } from './store-settings.mjs';
import { effectiveD365SalesMapping,salesStoreIdentifiers } from './d365-sales-mapping.mjs';

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
function hourOf(v){const m=minuteOfDay(v);return m===null?null:Math.floor(m/60)}
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
function applyCutoff(rows,timeField,cutoffMinute){
 const input=Array.isArray(rows)?rows:[];
 if(cutoffMinute===null||cutoffMinute===undefined)return{rows:input,meta:{requested:false,applied:false,complete:true,cutoffMinute:null,cutoffLabel:null,totalRows:input.length,parseableRows:input.length,unparseableRows:0,reason:null}};
 if(!timeField)return{rows:input,meta:{requested:true,applied:false,complete:false,cutoffMinute,cutoffLabel:`${String(Math.floor(cutoffMinute/60)).padStart(2,'0')}:${String(cutoffMinute%60).padStart(2,'0')}`,totalRows:input.length,parseableRows:0,unparseableRows:input.length,reason:'TIME_FIELD_UNMAPPED'}};
 const kept=[];let parseable=0,unparseable=0;
 for(const row of input){const minute=minuteOfDay(row?.[timeField]);if(minute===null){unparseable++;continue}parseable++;if(minute<=cutoffMinute)kept.push(row)}
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
  product:clean(saved?.fields?.product)||field('D365_SALES_PRODUCT_FIELD','itemId'),
  name:clean(saved?.fields?.productName)||field('D365_SALES_PRODUCT_NAME_FIELD',''),
  cost:clean(saved?.fields?.cost)||field('D365_SALES_COST_FIELD',''),
  time:clean(saved?.fields?.time)||field('D365_SALES_TIME_FIELD','time'),
  department:clean(saved?.fields?.department)||field('D365_SALES_DEPARTMENT_FIELD',''),
  category:clean(saved?.fields?.category)||field('D365_SALES_CATEGORY_FIELD',''),
  customer:clean(saved?.fields?.customer)||field('D365_SALES_CUSTOMER_FIELD','custAccount'),
  staff:clean(saved?.fields?.staff)||field('D365_SALES_STAFF_FIELD',''),
  status:field('D365_SALES_STATUS_FIELD','transactionStatus')
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

export function aggregateSalesRows(rows=[],cfg={}){
 const f=cfg.fields||{},sign=Number(cfg.sign||-1),costSign=Number(cfg.costSign||-1),tickets=new Set(),identifiedTickets=new Set(),products=new Map(),departments=new Map(),categories=new Map(),hours=new Map(),excludedTransactions=new Set();
 let netSales=0,identifiedNetSales=0,units=0,costValue=0,costMapped=!!f.cost,excludedRows=0,excludedSalesValue=0,includedRows=0;
 const identifiedCustomer=v=>{const s=clean(v).toUpperCase();return !!s&&!['ANONYMOUS','ANONYME','CASH','CASH CUSTOMER','WALK-IN','WALK IN','0'].includes(s)};
 const add=(map,key,label,sales,qty,cost)=>{if(!key)return;const cur=map.get(key)||{key:String(key),label:String(label||key),sales:0,units:0,costValue:0};cur.sales+=sales;cur.units+=qty;cur.costValue+=cost;map.set(key,cur)};
 for(const r of Array.isArray(rows)?rows:[]){
  const tx=clean(r[f.transaction]),status=clean(f.status?r[f.status]:'').toUpperCase(),rawSales=num(r[f.net]),sales=round2(rawSales*sign);
  if(['VOIDED','CANCELLED','CANCELED'].includes(status)){
   excludedRows+=1;excludedSalesValue+=Math.abs(sales);if(tx)excludedTransactions.add(tx);continue;
  }
  includedRows+=1;
  const rawQty=num(f.quantity?r[f.quantity]:0),qty=f.quantity?(rawQty===0?0:(sales===0?Math.abs(rawQty):Math.sign(sales)*Math.abs(rawQty))):0,cost=f.cost?round2(num(r[f.cost])*costSign):0;
  netSales+=sales;units+=qty;costValue+=cost;if(tx)tickets.add(tx);
  const identified=identifiedCustomer(f.customer?r[f.customer]:'');if(identified){identifiedNetSales+=sales;if(tx)identifiedTickets.add(tx)}
  const productNumber=clean(f.product?r[f.product]:'')||'UNMAPPED',name=clean(f.name?r[f.name]:'')||productNumber,tax=taxonomyLabels(productNumber);
  add(products,productNumber,name,sales,qty,cost);
  const dep=clean(f.department?r[f.department]:'')||tax.department,cat=clean(f.category?r[f.category]:'')||tax.category;
  if(dep)add(departments,dep,dep,sales,qty,cost);if(cat)add(categories,cat,cat,sales,qty,cost);
  const hour=hourOf(f.time?r[f.time]:null);if(hour!==null)add(hours,String(hour),`${String(hour).padStart(2,'0')}:00`,sales,qty,cost);
 }
 const finish=map=>[...map.values()].map(x=>({key:x.key,label:x.label,sales:round2(x.sales),units:round2(x.units),marginValue:costMapped?round2(x.sales-x.costValue):null,marginRate:costMapped&&x.sales?round2(((x.sales-x.costValue)/x.sales)*100):null})).sort((a,b)=>b.sales-a.sales);
 netSales=round2(netSales);costValue=round2(costValue);
 const identifiedSales=round2(identifiedNetSales),identifiedTicketCount=identifiedTickets.size,nonLoyaltyTickets=Math.max(0,tickets.size-identifiedTicketCount);
 return{sales:netSales,netSales,tickets:tickets.size,units:round2(units),marginValue:costMapped?round2(netSales-costValue):null,marginRate:costMapped&&netSales?round2(((netSales-costValue)/netSales)*100):null,loyalty:{identifiedSales,identifiedSalesShare:netSales?round2((identifiedSales/netSales)*100):null,identifiedTickets:identifiedTicketCount,nonLoyaltyTickets,identifiedTicketRate:tickets.size?round2((identifiedTicketCount/tickets.size)*100):null,recruitments:null,recruitmentRateNonLoyalty:null,recruitmentSource:'UNMAPPED'},departments:finish(departments),categories:finish(categories),products:finish(products),hourly:finish(hours),rowCount:Array.isArray(rows)?rows.length:0,includedRowCount:includedRows,dataQuality:{excludedRows,excludedTransactions:excludedTransactions.size,excludedSalesValue:round2(excludedSalesValue),reason:'VOIDED_OR_CANCELLED'}};
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
 const cacheSeconds=Math.max(300,Math.min(86400,Number(process.env.STOREOPS_SALES_ACTIVITY_CACHE_SECONDS)||21600)),cacheKey=`${storeId}|${start}|${end}|${windowDays}`;
 const cached=salesActivityCache.get(cacheKey);if(!force&&cached&&Date.now()<cached.expiresAt)return cached.value;
 const select=[c.fields.product,c.fields.name,c.fields.net,c.fields.quantity,c.fields.salesUnit,c.fields.date,c.fields.status,c.fields.store,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const identifiers=c.storeFilterCandidates?.length?c.storeFilterCandidates:[{kind:'RETAIL_CHANNEL',value:c.retailId}],dateModes=[c.dateFilterMode,c.dateFilterMode==='date'?'datetime':'date'];
 let firstEmpty=null,lastError=null;
 for(const identifier of identifiers){
  for(const storeFilter of literalFilters(c.fields.store,identifier.value)){
   for(const mode of [...new Set(dateModes)]){
    try{
     const chunkDays=Math.max(3,Math.min(10,Number(process.env.STOREOPS_SALES_ACTIVITY_CHUNK_DAYS)||5)),chunks=[];
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
      const rowStatus=clean(c.fields.status?row[c.fields.status]:'').toUpperCase();if(['VOIDED','CANCELLED','CANCELED'].includes(rowStatus))continue;
      const productNumber=clean(row[c.fields.product]);if(!productNumber)continue;
      const saleValue=num(row[c.fields.net])*c.sign;if(!(saleValue>0))continue;
      const current=byProduct.get(productNumber)||{productNumber,name:clean(c.fields.name?row[c.fields.name]:'')||productNumber,saleRows:0,salesValue:0,units:0,salesUnit:clean(c.fields.salesUnit?row[c.fields.salesUnit]:'')||null,lastSaleDate:null};
      current.saleRows+=1;current.salesValue+=saleValue;if(current.name===productNumber&&c.fields.name&&clean(row[c.fields.name]))current.name=clean(row[c.fields.name]);if(!current.salesUnit&&c.fields.salesUnit&&clean(row[c.fields.salesUnit]))current.salesUnit=clean(row[c.fields.salesUnit]);if(c.fields.quantity)current.units+=Math.abs(num(row[c.fields.quantity]));const saleDay=dateOnly(c.fields.date?row[c.fields.date]:null);if(saleDay&&(!current.lastSaleDate||saleDay>current.lastSaleDate))current.lastSaleDate=saleDay;
      byProduct.set(productNumber,current);
     }
     const products=[...byProduct.values()].map(x=>({...x,salesValue:round2(x.salesValue),units:round3(x.units)})).sort((a,b)=>b.salesValue-a.salesValue||a.productNumber.localeCompare(b.productNumber));
     const result={status:truncated?'TRUNCATED':'READY',source:`D365/${c.entity}`,storeId,businessDate:end,windowDays,startDay:start,endDay:end,products,rowCount,pages,truncated,chunkDays,chunks:chunks.length,config:{storeIdentifierKind:identifier.kind,storeIdentifier:identifier.value,dateFilterMode:mode}};
     if(rows.length||products.length){salesActivityCache.set(cacheKey,{value:result,expiresAt:Date.now()+cacheSeconds*1000});return result}
     firstEmpty=firstEmpty||result;
    }catch(error){lastError=error}
   }
  }
 }
 if(firstEmpty){salesActivityCache.set(cacheKey,{value:firstEmpty,expiresAt:Date.now()+cacheSeconds*1000});return firstEmpty}
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
      const rowStatus=clean(c.fields.status?row[c.fields.status]:'').toUpperCase();if(['VOIDED','CANCELLED','CANCELED'].includes(rowStatus))continue;
      const saleValue=num(row[c.fields.net])*c.sign;if(!(saleValue>0))continue;
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

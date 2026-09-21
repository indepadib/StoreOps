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
function hourOf(v){
 if(v===null||v===undefined||v==='')return null;
 const s=String(v).trim();
 const iso=s.match(/T(\d{2}):/);if(iso)return Number(iso[1]);
 const hhmm=s.match(/^(\d{1,2}):/);if(hhmm)return Number(hhmm[1]);
 const n=Number(v);if(Number.isFinite(n)){
  if(n>=0&&n<=23)return Math.floor(n);
  const four=String(Math.trunc(n)).padStart(4,'0');const h=Number(four.slice(0,2));return h>=0&&h<=23?h:null;
 }
 return null;
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
  product:clean(saved?.fields?.product)||field('D365_SALES_PRODUCT_FIELD','itemId'),
  name:clean(saved?.fields?.productName)||field('D365_SALES_PRODUCT_NAME_FIELD',''),
  cost:clean(saved?.fields?.cost)||field('D365_SALES_COST_FIELD',''),
  time:clean(saved?.fields?.time)||field('D365_SALES_TIME_FIELD','time'),
  department:clean(saved?.fields?.department)||field('D365_SALES_DEPARTMENT_FIELD',''),
  category:clean(saved?.fields?.category)||field('D365_SALES_CATEGORY_FIELD','')
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
 const f=cfg.fields||{},sign=Number(cfg.sign||-1),costSign=Number(cfg.costSign||-1),quantitySign=Number(cfg.quantitySign||1),tickets=new Set(),products=new Map(),departments=new Map(),categories=new Map(),hours=new Map();
 let netSales=0,units=0,costValue=0,costMapped=!!f.cost;
 const add=(map,key,label,sales,qty,cost)=>{if(!key)return;const cur=map.get(key)||{key:String(key),label:String(label||key),sales:0,units:0,costValue:0};cur.sales+=sales;cur.units+=qty;cur.costValue+=cost;map.set(key,cur)};
 for(const r of Array.isArray(rows)?rows:[]){
  const sales=round2(num(r[f.net])*sign),qty=num(f.quantity?r[f.quantity]:0)*quantitySign,cost=f.cost?round2(num(r[f.cost])*costSign):0,tx=clean(r[f.transaction]);
  netSales+=sales;units+=qty;costValue+=cost;if(tx)tickets.add(tx);
  const productNumber=clean(f.product?r[f.product]:'')||'UNMAPPED',name=clean(f.name?r[f.name]:'')||productNumber,tax=taxonomyLabels(productNumber);
  add(products,productNumber,name,sales,qty,cost);
  const dep=clean(f.department?r[f.department]:'')||tax.department,cat=clean(f.category?r[f.category]:'')||tax.category;
  if(dep)add(departments,dep,dep,sales,qty,cost);if(cat)add(categories,cat,cat,sales,qty,cost);
  const hour=hourOf(f.time?r[f.time]:null);if(hour!==null)add(hours,String(hour),`${String(hour).padStart(2,'0')}:00`,sales,qty,cost);
 }
 const finish=map=>[...map.values()].map(x=>({key:x.key,label:x.label,sales:round2(x.sales),units:round2(x.units),marginValue:costMapped?round2(x.sales-x.costValue):null,marginRate:costMapped&&x.sales?round2(((x.sales-x.costValue)/x.sales)*100):null})).sort((a,b)=>b.sales-a.sales);
 netSales=round2(netSales);costValue=round2(costValue);
 return{sales:netSales,netSales,tickets:tickets.size,units:round2(units),marginValue:costMapped?round2(netSales-costValue):null,marginRate:costMapped&&netSales?round2(((netSales-costValue)/netSales)*100):null,departments:finish(departments),categories:finish(categories),products:finish(products),hourly:finish(hours),rowCount:Array.isArray(rows)?rows.length:0};
}

function literalFilters(field,value){
 const raw=clean(value),escaped=esc(raw),out=[`${field} eq '${escaped}'`];
 if(/^-?\d+(?:\.\d+)?$/.test(raw))out.push(`${field} eq ${raw}`);
 return [...new Set(out)]
}
export async function readStoreSalesDay(storeId,businessDate){
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
     const result={status:'READY',source:`D365/${c.entity}`,storeId,businessDate,config:{entity:c.entity,retailId:c.retailId,retailIdSource:c.retailIdSource,storeIdentifierKind:identifier.kind,storeIdentifier:identifier.value,dateFilterMode:mode},data:{...aggregateSalesRows(fetched.value,c),pages:fetched.pages,truncated:!!fetched.truncated}};
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
 const cacheSeconds=Math.max(30,Math.min(1800,Number(process.env.STOREOPS_SALES_ACTIVITY_CACHE_SECONDS)||180)),cacheKey=`${storeId}|${start}|${end}|${windowDays}`;
 const cached=salesActivityCache.get(cacheKey);if(!force&&cached&&Date.now()<cached.expiresAt)return cached.value;
 const select=[c.fields.product,c.fields.name,c.fields.quantity,c.fields.date,c.fields.store,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const identifiers=c.storeFilterCandidates?.length?c.storeFilterCandidates:[{kind:'RETAIL_CHANNEL',value:c.retailId}],dateModes=[c.dateFilterMode,c.dateFilterMode==='date'?'datetime':'date'];
 let firstEmpty=null,lastError=null;
 for(const identifier of identifiers){
  for(const storeFilter of literalFilters(c.fields.store,identifier.value)){
   for(const mode of [...new Set(dateModes)]){
    const filters=[storeFilter,dateRangeFilter(c.fields.date,start,end,mode)];
    if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
    try{
     const fetched=await odataGetAll(c.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize,maxRows:c.maxRows});
     const byProduct=new Map();
     for(const row of fetched.value||[]){
      const productNumber=clean(row[c.fields.product]);if(!productNumber)continue;
      const qty=c.fields.quantity?num(row[c.fields.quantity])*c.quantitySign:1;
      if(c.fields.quantity&&!(qty>0))continue;
      const current=byProduct.get(productNumber)||{productNumber,name:clean(c.fields.name?row[c.fields.name]:'')||productNumber,saleRows:0,units:0,lastSaleDate:null};
      current.saleRows+=1;current.units+=c.fields.quantity?qty:1;
      const day=dateOnly(row[c.fields.date]);if(day&&(!current.lastSaleDate||day>current.lastSaleDate))current.lastSaleDate=day;
      if((!current.name||current.name===productNumber)&&c.fields.name)current.name=clean(row[c.fields.name])||productNumber;
      byProduct.set(productNumber,current);
     }
     const products=[...byProduct.values()].map(x=>({...x,units:round3(x.units)})).sort((a,b)=>b.units-a.units||a.productNumber.localeCompare(b.productNumber));
     const result={status:fetched.truncated?'TRUNCATED':'READY',source:`D365/${c.entity}`,storeId,businessDate:end,windowDays,startDay:start,endDay:end,products,rowCount:fetched.rowCount,pages:fetched.pages,truncated:!!fetched.truncated,config:{storeIdentifierKind:identifier.kind,storeIdentifier:identifier.value,dateFilterMode:mode}};
     if((fetched.value||[]).length||products.length){salesActivityCache.set(cacheKey,{value:result,expiresAt:Date.now()+cacheSeconds*1000});return result}
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
 const start=nextDate(end,-(windowDays-1)),start7=nextDate(end,-6),filters=[`${c.fields.store} eq '${esc(c.retailId)}'`,dateRangeFilter(c.fields.date,start,end,c.dateFilterMode),`${c.fields.product} eq '${esc(sku)}'`];
 if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
 const select=[c.fields.date,c.fields.quantity,c.fields.product,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const fetched=await odataGetAll(c.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize,maxRows:c.maxRows});
 if(fetched.truncated){const value={status:'TRUNCATED',source:`D365/${c.entity}`,storeId,productNumber:sku,businessDate:end,dailySales7:null,dailySales28:null,rowCount:fetched.rowCount,pages:fetched.pages};velocityCache.set(cacheKey,{value,expiresAt:Date.now()+cacheSeconds*1000});return value}
 let units7=0,unitsWindow=0;for(const row of fetched.value||[]){const day=dateOnly(row[c.fields.date]);const qty=num(row[c.fields.quantity])*c.quantitySign;unitsWindow+=qty;if(day&&day>=start7&&day<=end)units7+=qty}
 const value={status:'READY',source:`D365/${c.entity}`,storeId,productNumber:sku,businessDate:end,windowDays,dailySales7:round3(Math.max(0,units7)/7),dailySales28:round3(Math.max(0,unitsWindow)/windowDays),rowCount:fetched.rowCount,pages:fetched.pages,quantitySign:c.quantitySign};
 velocityCache.set(cacheKey,{value,expiresAt:Date.now()+cacheSeconds*1000});return value
}

export function salesComparisonDate(day,days=7){return nextDate(day,-Math.abs(Number(days)||7))}

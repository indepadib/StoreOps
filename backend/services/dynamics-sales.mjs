import { config } from '../config.mjs';
import { odataGetAll } from './dynamics.mjs';
import { productTaxonomy } from './assortment.mjs';

const clean=v=>String(v??'').trim();
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const nullable=v=>v===null||v===undefined||v===''?null:Number(v);
const validField=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
const validEntity=v=>/^[A-Za-z0-9_]+$/.test(clean(v));
const esc=v=>String(v).replaceAll("'","''");
const round2=v=>Math.round((num(v)+Number.EPSILON)*100)/100;

function parseMap(raw=''){
 const s=clean(raw);if(!s)return{};
 if(s.startsWith('{')){try{const x=JSON.parse(s);return x&&typeof x==='object'?x:{}}catch{return{}}}
 return Object.fromEntries(s.split(',').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i>0?[x.slice(0,i).trim(),x.slice(i+1).trim()]:null}).filter(Boolean));
}
function field(name,fallback=''){const v=clean(process.env[name]||fallback);return validField(v)?v:''}
function salesLive(){return config.dynamics.mode==='live'&&clean(process.env.D365_SALES_READ_MODE).toLowerCase()==='live'}
function nextDate(day,delta=1){const d=new Date(`${day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
function dateFilter(f,day){
 const mode=clean(process.env.D365_SALES_DATE_FILTER_MODE||'datetime').toLowerCase();
 if(mode==='date')return `${f} eq ${day}`;
 return `${f} ge ${day}T00:00:00Z and ${f} lt ${nextDate(day)}T00:00:00Z`;
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
 const entity=clean(process.env.D365_SALES_ENTITY||'RetailTransactionSalesTransBIEntities'),stores=parseMap(process.env.D365_STORE_RETAIL_IDS||''),retailId=storeId?clean(stores[storeId]):null;
 const fields={
  store:field('D365_SALES_STORE_FIELD','store'),date:field('D365_SALES_DATE_FIELD','businessDate'),transaction:field('D365_SALES_TRANSACTION_FIELD','transactionId'),
  net:field('D365_SALES_NET_FIELD','netAmountInclTax'),quantity:field('D365_SALES_QTY_FIELD','qty'),product:field('D365_SALES_PRODUCT_FIELD','itemId'),
  name:field('D365_SALES_PRODUCT_NAME_FIELD',''),cost:field('D365_SALES_COST_FIELD',''),time:field('D365_SALES_TIME_FIELD','time'),department:field('D365_SALES_DEPARTMENT_FIELD',''),category:field('D365_SALES_CATEGORY_FIELD','')
 };
 const required=[['entity',validEntity(entity)],['store',!!fields.store],['date',!!fields.date],['transaction',!!fields.transaction],['net',!!fields.net]];
 const missing=required.filter(([,ok])=>!ok).map(([k])=>k);
 if(storeId&&!retailId)missing.push('storeMapping');
 return{mode:salesLive()?'LIVE':'DISABLED',entity,storeId,retailId,stores,fields,missing,ready:salesLive()&&missing.length===0,pageSize:Math.max(100,Math.min(2000,Number(process.env.D365_SALES_PAGE_SIZE)||1000)),maxRows:Math.max(1000,Math.min(100000,Number(process.env.D365_SALES_MAX_ROWS)||50000)),sign:Number(process.env.D365_SALES_SIGN||-1)||-1,costSign:Number(process.env.D365_SALES_COST_SIGN||-1)||-1};
}

function taxonomyLabels(productNumber){
 const rows=productTaxonomy(productNumber)||[];if(!rows.length)return{department:null,category:null};
 const sorted=[...rows].sort((a,b)=>(Number(a.level)||999)-(Number(b.level)||999));
 return{department:sorted[0]?.category_name||null,category:sorted.at(-1)?.category_name||null};
}

export function aggregateSalesRows(rows=[],cfg={}){
 const f=cfg.fields||{},sign=Number(cfg.sign||-1),costSign=Number(cfg.costSign||-1),tickets=new Set(),products=new Map(),departments=new Map(),categories=new Map(),hours=new Map();
 let netSales=0,units=0,costValue=0,costMapped=!!f.cost;
 const add=(map,key,label,sales,qty,cost)=>{if(!key)return;const cur=map.get(key)||{key:String(key),label:String(label||key),sales:0,units:0,costValue:0};cur.sales+=sales;cur.units+=qty;cur.costValue+=cost;map.set(key,cur)};
 for(const r of Array.isArray(rows)?rows:[]){
  const sales=round2(num(r[f.net])*sign),qty=num(f.quantity?r[f.quantity]:0),cost=f.cost?round2(num(r[f.cost])*costSign):0,tx=clean(r[f.transaction]);
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

export async function readStoreSalesDay(storeId,businessDate){
 const c=salesIntegrationConfig(storeId);if(!c.ready)return{status:'UNAVAILABLE',source:'D365',storeId,businessDate,config:{mode:c.mode,entity:c.entity,retailId:c.retailId,missing:c.missing},data:null};
 const filters=[`${c.fields.store} eq '${esc(c.retailId)}'`,dateFilter(c.fields.date,businessDate)];
 if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
 const select=[...Object.values(c.fields),config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const fetched=await odataGetAll(c.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize,maxRows:c.maxRows});
 return{status:'READY',source:`D365/${c.entity}`,storeId,businessDate,config:{entity:c.entity,retailId:c.retailId},data:{...aggregateSalesRows(fetched.value,c),pages:fetched.pages,truncated:!!fetched.truncated}};
}

export function salesComparisonDate(day,days=7){return nextDate(day,-Math.abs(Number(days)||7))}

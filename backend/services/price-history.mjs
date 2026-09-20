import { config } from '../config.mjs';
import { odataGetAll } from './dynamics.mjs';
import { getSalesPriceAgreementsByItem } from './dynamics-price.mjs';
import { salesIntegrationConfig } from './dynamics-sales.mjs';

const clean=v=>String(v??'').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const round2=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;
const esc=v=>String(v).replaceAll("'","''");
function dateOnly(v){const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function shift(day,delta){const d=new Date(`${day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
function dateRangeFilter(field,start,end){const mode=clean(process.env.D365_SALES_DATE_FILTER_MODE||'datetime').toLowerCase();if(mode==='date')return `${field} ge ${start} and ${field} le ${end}`;return `${field} ge ${start}T00:00:00Z and ${field} lt ${shift(end,1)}T00:00:00Z`}

export function normalizeAgreementHistory(payload){
 const rows=Array.isArray(payload?.rows)?payload.rows:[];
 return rows.map(r=>({
  type:'TRADE_AGREEMENT',price:Number.isFinite(Number(r.Price))?Number(r.Price):null,currency:clean(r.PriceCurrencyCode)||null,
  from:dateOnly(r.PriceApplicableFromDate),to:dateOnly(r.PriceApplicableToDate),priceGroup:clean(r.PriceCustomerGroupCode)||null,
  customer:clean(r.CustomerAccountNumber)||null,warehouse:clean(r.PriceWarehouseId)||null,site:clean(r.PriceSiteId)||null,
  quantity:Number.isFinite(Number(r.SalesPriceQuantity))?Number(r.SalesPriceQuantity):null,unit:clean(r.QuantityUnitySymbol)||null,recordId:r.RecordId??null
 })).filter(x=>x.price!==null).sort((a,b)=>String(b.from||'').localeCompare(String(a.from||'')))
}

async function observedStorePrices(storeId,productNumber,{businessDate,days}){
 const c=salesIntegrationConfig(storeId),end=dateOnly(businessDate)||new Date().toISOString().slice(0,10),windowDays=Math.max(7,Math.min(365,Number(days)||90)),start=shift(end,-(windowDays-1));
 if(!c.ready||!c.fields.product||!c.fields.quantity||!c.fields.net)return{status:'UNAVAILABLE',source:'D365',items:[],missing:[...new Set([...(c.missing||[]),!c.fields.product?'productField':null,!c.fields.quantity?'quantityField':null,!c.fields.net?'netField':null].filter(Boolean))]};
 const filters=[`${c.fields.store} eq '${esc(c.retailId)}'`,dateRangeFilter(c.fields.date,start,end),`${c.fields.product} eq '${esc(productNumber)}'`];
 if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`);
 const select=[c.fields.date,c.fields.net,c.fields.quantity,c.fields.product,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(',');
 const fetched=await odataGetAll(c.entity,{filter:filters.join(' and '),select,extra:config.dynamics.dataAreaId?'cross-company=true':'',pageSize:c.pageSize,maxRows:c.maxRows});
 const byDay=new Map();
 for(const r of fetched.value||[]){const day=dateOnly(r[c.fields.date]);if(!day)continue;const qty=num(r[c.fields.quantity])*c.quantitySign,net=num(r[c.fields.net])*c.sign;if(qty<=0)continue;const unit=net/qty;if(!Number.isFinite(unit)||unit<0)continue;const cur=byDay.get(day)||{date:day,net:0,qty:0,min:null,max:null,lines:0};cur.net+=net;cur.qty+=qty;cur.lines+=1;cur.min=cur.min===null?unit:Math.min(cur.min,unit);cur.max=cur.max===null?unit:Math.max(cur.max,unit);byDay.set(day,cur)}
 const items=[...byDay.values()].map(x=>({date:x.date,weightedUnitPrice:x.qty?round2(x.net/x.qty):null,minUnitPrice:x.min===null?null:round2(x.min),maxUnitPrice:x.max===null?null:round2(x.max),units:round2(x.qty),lines:x.lines})).sort((a,b)=>b.date.localeCompare(a.date));
 return{status:fetched.truncated?'TRUNCATED':'READY',source:`D365/${c.entity}`,storeId,productNumber,startDate:start,endDate:end,windowDays,rowCount:fetched.rowCount,items,truncated:!!fetched.truncated}
}

export async function itemPriceHistory({storeId,productNumber,businessDate=null,days=90}){
 const sku=clean(productNumber);if(!sku)throw Object.assign(new Error('Article requis.'),{status:400,code:'PRICE_HISTORY_ITEM_REQUIRED'});
 let agreements={mode:'UNAVAILABLE',rows:[],basePrice:null},agreementError=null;
 try{agreements=await getSalesPriceAgreementsByItem(sku)}catch(error){agreementError={message:error.message,code:error.code||'PRICE_AGREEMENTS_FAILED'}}
 let observed={status:'UNAVAILABLE',items:[]},observedError=null;
 try{observed=await observedStorePrices(storeId,sku,{businessDate,days})}catch(error){observedError={message:error.message,code:error.code||'OBSERVED_PRICE_HISTORY_FAILED'}}
 const base=agreements?.basePrice?.row||null,currentBasePrice=base&&Number.isFinite(Number(base.SalesPrice))?Number(base.SalesPrice):null;
 return{
  storeId,productNumber:sku,businessDate:dateOnly(businessDate)||new Date().toISOString().slice(0,10),
  currentBase:{price:currentBasePrice,unit:clean(base?.SalesUnitSymbol)||null,priceQuantity:Number.isFinite(Number(base?.SalesPriceQuantity))?Number(base.SalesPriceQuantity):null,source:agreements?.basePrice?.mode==='LIVE'?`D365/${agreements.basePrice.entity}`:agreements?.basePrice?.mode||'UNAVAILABLE'},
  tradeAgreements:{status:agreements?.mode||'UNAVAILABLE',source:agreements?.entity?`D365/${agreements.entity}`:null,items:normalizeAgreementHistory(agreements),error:agreementError},
  observedSales:{...observed,error:observedError},
  semantics:{tradeAgreements:'Prix paramétrés avec période de validité.',observedSales:'Prix unitaire réellement observé en caisse, calculé à partir des ventes TTC / quantité. Peut inclure promotions et remises.',priceReport:'Dynamics 365 Commerce propose aussi un Price report historique par canal; son exposition API doit être validée dans votre environnement.'}
 }
}

import { config } from '../config.mjs';
import { probeDataEntity } from './dynamics.mjs';
import { salesIntegrationConfig } from './dynamics-sales.mjs';
import { storeOperationalSettings } from './store-settings.mjs';
import { d365SalesMappingSettings } from './d365-sales-mapping.mjs';

const clean=v=>String(v??'').trim();
const keyScore=(key,patterns=[])=>{const k=clean(key).toLowerCase();let score=0;for(const p of patterns){if(p instanceof RegExp){if(p.test(k))score+=3}else if(k===String(p).toLowerCase())score+=6;else if(k.includes(String(p).toLowerCase()))score+=2}return score};
const unique=a=>[...new Set(a.filter(Boolean))];

const SALES_ROLES={
 channel:['store','storeid','retailchannel','retailchannelid','channel','channelid','terminalstore'],
 businessDate:['businessdate','transactiondate','transdate','date'],
 transaction:['transactionid','transactionnumber','receiptid','receipt','ticket','transid'],
 product:['itemid','itemnumber','productnumber','product','sku'],
 net:['netamountincltax','netamount','amountincltax','grossamount','salesamount','amount'],
 quantity:['qty','quantity','salesqty'],
 cost:['costamount','costprice','costvalue','cost','cogs'],
 time:['time','transactiontime','createddatetime','datetime'],
 productName:['productname','itemname','name','description'],
 department:['department','departmentname','rayon'],
 category:['category','categoryname','family','famille']
};
const PRICE_ROLES={
 product:['itemid','itemnumber','productnumber','product','sku'],
 price:['amount','price','salesprice','offerprice','priceamount'],
 validFrom:['validfrom','fromdate','startdate','effectivefrom','priceapplicablefromdate'],
 validTo:['validto','todate','enddate','effectiveto','priceapplicabletodate'],
 priceGroup:['pricegroup','pricegroupid','pricecustomergroupcode','accountrelation'],
 currency:['currency','currencycode','pricecurrencycode'],
 customer:['customeraccountnumber','customeraccount','customer','accountrelation'],
 warehouse:['pricewarehouseid','warehouseid','warehouse'],
 site:['pricesiteid','siteid','site'],
 quantity:['salespricequantity','pricequantity','quantity','qty'],
 unit:['quantityunitysymbol','unitid','unit','unitofmeasure'],
 recordId:['recordid','recid','record']
};

function infer(rows,roles){
 const keys=unique((rows||[]).flatMap(r=>Object.keys(r||{})));
 const fields={};
 for(const [role,patterns] of Object.entries(roles)){
  const ranked=keys.map(key=>({key,score:keyScore(key,patterns)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
  fields[role]={candidate:ranked[0]?.key||null,confidence:ranked[0]?.score>=6?'HIGH':ranked[0]?.score>=3?'MEDIUM':ranked[0]?.score>0?'LOW':'NONE',alternatives:ranked.slice(1,4)};
 }
 return{keys,fields};
}
function maskedRows(rows=[]){return rows.slice(0,3).map(row=>Object.fromEntries(Object.entries(row||{}).map(([k,v])=>[k,typeof v==='string'&&v.length>80?`${v.slice(0,77)}…`:v])))}
async function safeProbe(entity,{filter=''}={}){
 try{const r=await probeDataEntity(entity,{top:3,filter});return{ok:!!r.ok,entity,latencyMs:r.latencyMs||null,rowCount:r.rowCount||0,rows:maskedRows(r.rows||[]),error:null}}
 catch(e){return{ok:false,entity,latencyMs:null,rowCount:0,rows:[],error:e.message,code:e.code||'D365_PROBE_FAILED'}}
}

export function d365MappingDiagnosticReadiness(storeId='val-fleuri'){
 const store=storeOperationalSettings(storeId),sales=salesIntegrationConfig(storeId),savedSalesMapping=d365SalesMappingSettings();
 return{
  mode:config.dynamics.mode,
  storeId,
  retailChannelId:store?.d365?.retailChannelId||null,
  sales:{entity:sales.entity,configuredFields:sales.fields,retailId:sales.retailId,retailIdSource:sales.retailIdSource,ready:sales.ready,missing:sales.missing||[],mappingSource:sales.mappingSource||null,mappingState:sales.mappingState||savedSalesMapping?.state||null},
  savedSalesMapping,
  candidates:{
   sales:unique([clean(process.env.D365_SALES_ENTITY)||'RetailTransactionSalesTransBIEntities','RetailTransactionSalesTransBIEntities','RetailTransactionSalesLines']),
   price:unique([clean(process.env.D365_BASE_PRICE_ENTITY),clean(process.env.D365_SALES_PRICE_ENTITY),'SalesPriceAgreements','SalesTradeAgreementLines']),
   priceHistory:['RetailTransactionSalesTransBIEntities']
  }
 }
}

export async function discoverD365SalesMapping(storeId='val-fleuri'){
 const ready=d365MappingDiagnosticReadiness(storeId),attempts=[];
 if(config.dynamics.mode!=='live')return{status:'DISABLED',checkedAt:new Date().toISOString(),...ready,recommendation:null,attempts,message:'D365_MODE n’est pas LIVE.'};
 for(const entity of ready.candidates.sales){
  const probe=await safeProbe(entity),inference=infer(probe.rows,SALES_ROLES);
  const fields=Object.fromEntries(Object.entries(inference.fields).map(([role,x])=>[role,x.candidate]));
  const missing=['channel','businessDate','transaction','net'].filter(role=>!fields[role]);
  attempts.push({entity,ok:probe.ok,rowCount:probe.rowCount,latencyMs:probe.latencyMs,error:probe.error||null,code:probe.code||null,missing,fields});
  if(!probe.ok||!probe.rows.length||missing.length)continue;
  return{status:'READY',checkedAt:new Date().toISOString(),...ready,probe:{entity:probe.entity,rowCount:probe.rowCount,latencyMs:probe.latencyMs},attempts,recommendation:{salesEntity:entity,fields,dateFilterMode:'datetime',salesSign:-1,quantitySign:1,costSign:-1,costDetected:!!fields.cost,marginReady:!!fields.cost&&!!fields.net},missing:[]};
 }
 return{status:'NO_ENTITY_RESPONDED',checkedAt:new Date().toISOString(),...ready,recommendation:null,attempts,message:'Aucune entité ventes exploitable n’a été détectée automatiquement.'}
}

export function inferD365PriceHistoryMappingRows(rows=[]){
 const inference=infer(rows,PRICE_ROLES),f=inference.fields,fields={item:f.product?.candidate||null,price:f.price?.candidate||null,validFrom:f.validFrom?.candidate||null,validTo:f.validTo?.candidate||null,currency:f.currency?.candidate||null,priceGroup:f.priceGroup?.candidate||null,customer:f.customer?.candidate||null,warehouse:f.warehouse?.candidate||null,site:f.site?.candidate||null,quantity:f.quantity?.candidate||null,unit:f.unit?.candidate||null,recordId:f.recordId?.candidate||null},missing=['item','price','validFrom'].filter(k=>!fields[k]),sampleRow=(rows||[]).find(r=>fields.item&&clean(r?.[fields.item]))||null;
 return{inference,fields,missing,sampleProductNumber:sampleRow&&fields.item?clean(sampleRow[fields.item]):null}
}

export async function discoverD365PriceHistoryMapping(){
 const ready=d365MappingDiagnosticReadiness('val-fleuri');
 if(config.dynamics.mode!=='live')return{status:'DISABLED',checkedAt:new Date().toISOString(),recommendation:null,sampleProductNumber:null,message:'D365_MODE n’est pas LIVE.'};
 for(const entity of ready.candidates.price){
  const probe=await safeProbe(entity);if(!probe.ok||!probe.rows.length)continue;
  const mapped=inferD365PriceHistoryMappingRows(probe.rows);if(mapped.missing.length)continue;
  return{status:'READY',checkedAt:new Date().toISOString(),probe:{entity:probe.entity,rowCount:probe.rowCount,latencyMs:probe.latencyMs},recommendation:{entity,fields:mapped.fields},sampleProductNumber:mapped.sampleProductNumber,missing:[]};
 }
 return{status:'NO_ENTITY_RESPONDED',checkedAt:new Date().toISOString(),recommendation:null,sampleProductNumber:null,message:'Aucune source Trade Agreements datée exploitable n’a été détectée automatiquement.'}
}

export async function diagnoseD365Mappings(storeId='val-fleuri'){
 const ready=d365MappingDiagnosticReadiness(storeId);
 if(config.dynamics.mode!=='live')return{status:'DISABLED',checkedAt:new Date().toISOString(),...ready,domains:{sales:[],price:[]},message:'D365_MODE n’est pas LIVE : aucun probe externe effectué.'};
 const channel=clean(ready.retailChannelId),salesResults=[];
 for(const entity of ready.candidates.sales){
  const configuredStoreField=clean(process.env.D365_SALES_STORE_FIELD||'store');
  let probe=await safeProbe(entity,{filter:channel&&configuredStoreField?`${configuredStoreField} eq '${channel.replaceAll("'","''")}'`:''});
  if(!probe.ok||!probe.rows.length)probe=await safeProbe(entity);
  salesResults.push({...probe,inference:infer(probe.rows,SALES_ROLES)});
 }
 const priceResults=[];
 for(const entity of ready.candidates.price){const probe=await safeProbe(entity);priceResults.push({...probe,inference:infer(probe.rows,PRICE_ROLES)})}
 const bestSales=[...salesResults].sort((a,b)=>Number(b.ok)-Number(a.ok)||b.rowCount-a.rowCount)[0]||null;
 const recommended=bestSales?.ok?Object.fromEntries(Object.entries(bestSales.inference.fields).map(([role,x])=>[role,x.candidate])):{};
 const costDetected=!!recommended.cost;
 return{
  status:salesResults.some(x=>x.ok)||priceResults.some(x=>x.ok)?'READY':'NO_ENTITY_RESPONDED',
  checkedAt:new Date().toISOString(),...ready,
  domains:{sales:salesResults,price:priceResults},
  recommendation:{salesEntity:bestSales?.ok?bestSales.entity:null,fields:recommended,costDetected,marginReady:costDetected&&!!recommended.net,dateFilterMode:'datetime',salesSign:-1,quantitySign:1,costSign:-1},
  safeguards:{writes:false,configurationChanged:false,unknownCostBecomesZero:false}
 }
}

import { config } from '../config.mjs';
import { probeDataEntity } from './dynamics.mjs';
import { salesIntegrationConfig } from './dynamics-sales.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

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
 product:['itemid','itemnumber','productnumber','product'],
 price:['amount','price','salesprice','offerprice','priceamount'],
 validFrom:['validfrom','fromdate','startdate','effectivefrom'],
 validTo:['validto','todate','enddate','effectiveto'],
 priceGroup:['pricegroup','pricegroupid','accountrelation'],
 currency:['currency','currencycode']
};
const ASSORTMENT_CHANNEL_ROLES={
 channel:['retailchannelid','retailchannel','channelid','channel','retailstoreid','storeid','store','operatingunitnumber','operatingunit'],
 assortment:['assortmentid','assortmentkey','assortment','retailassortmentid'],
 assortmentName:['assortmentname','name','description'],
 included:['included','isincluded','include','isactive','active','enabled'],
 validFrom:['validfrom','fromdate','startdate','effectivefrom'],
 validTo:['validto','todate','enddate','effectiveto'],
 product:['productnumber','itemnumber','itemid','product','sku']
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
function bestResult(rows=[]){return [...rows].sort((a,b)=>Number(b.ok)-Number(a.ok)||Number(!!b.rows?.length)-Number(!!a.rows?.length)||b.rowCount-a.rowCount)[0]||null}
function candidatesFromEnv(){
 return unique([
  clean(process.env.D365_ASSORTMENT_ENTITY),
  clean(process.env.D365_STORE_ASSORTMENT_ENTITY),
  'RetailAssortmentLookupChannelGroup',
  'RetailAssortmentChannelLine',
  'RetailChannelAssortedProductView',
  'RetailAssortmentLookup'
 ])
}

export function d365MappingDiagnosticReadiness(storeId='val-fleuri'){
 const store=storeOperationalSettings(storeId),sales=salesIntegrationConfig(storeId);
 return{
  mode:config.dynamics.mode,
  storeId,
  retailChannelId:store?.d365?.retailChannelId||null,
  storeNumber:store?.d365?.storeNumber||store?.storeWarehouseId||null,
  operatingUnitNumber:store?.d365?.operatingUnitNumber||null,
  sales:{entity:sales.entity,configuredFields:sales.fields,retailId:sales.retailId,retailIdSource:sales.retailIdSource,ready:sales.ready,missing:sales.missing||[]},
  assortmentStore:{configuredEntity:clean(process.env.D365_ASSORTMENT_ENTITY)||null,configuredChannelField:clean(process.env.D365_ASSORTMENT_STORE_FIELD)||null,automatic:false,source:'DIAGNOSTIC_ONLY'},
  candidates:{
   sales:unique([clean(process.env.D365_SALES_ENTITY)||'RetailTransactionSalesTransBIEntities','RetailTransactionSalesTransBIEntities','RetailTransactionSalesLines']),
   price:unique([clean(process.env.D365_BASE_PRICE_ENTITY),clean(process.env.D365_SALES_PRICE_ENTITY),'SalesPriceAgreements','SalesTradeAgreementLines']),
   priceHistory:['RetailTransactionSalesTransBIEntities'],
   assortmentChannel:candidatesFromEnv()
  }
 }
}

export async function diagnoseD365Mappings(storeId='val-fleuri'){
 const ready=d365MappingDiagnosticReadiness(storeId);
 if(config.dynamics.mode!=='live')return{status:'DISABLED',checkedAt:new Date().toISOString(),...ready,domains:{sales:[],price:[],assortmentChannel:[]},message:'D365_MODE n’est pas LIVE : aucun probe externe effectué.'};
 const channel=clean(ready.retailChannelId),salesResults=[];
 for(const entity of ready.candidates.sales){
  const configuredStoreField=clean(process.env.D365_SALES_STORE_FIELD||'store');
  let probe=await safeProbe(entity,{filter:channel&&configuredStoreField?`${configuredStoreField} eq '${channel.replaceAll("'","''")}'`:''});
  if(!probe.ok||!probe.rows.length)probe=await safeProbe(entity);
  salesResults.push({...probe,inference:infer(probe.rows,SALES_ROLES)});
 }
 const priceResults=[];
 for(const entity of ready.candidates.price){const probe=await safeProbe(entity);priceResults.push({...probe,inference:infer(probe.rows,PRICE_ROLES)})}
 const assortmentResults=[];
 for(const entity of ready.candidates.assortmentChannel){
  const configuredChannelField=clean(process.env.D365_ASSORTMENT_STORE_FIELD||process.env.D365_ASSORTMENT_CHANNEL_FIELD||'');
  let probe=await safeProbe(entity,{filter:channel&&configuredChannelField?`${configuredChannelField} eq '${channel.replaceAll("'","''")}'`:''});
  if(!probe.ok||!probe.rows.length)probe=await safeProbe(entity);
  const inference=infer(probe.rows,ASSORTMENT_CHANNEL_ROLES),channelField=inference.fields.channel?.candidate,assortmentField=inference.fields.assortment?.candidate;
  assortmentResults.push({...probe,inference,storeLinkCandidate:!!channelField&&!!assortmentField,probeOnly:true})
 }
 const bestSales=bestResult(salesResults),recommended=bestSales?.ok?Object.fromEntries(Object.entries(bestSales.inference.fields).map(([role,x])=>[role,x.candidate])):{},costDetected=!!recommended.cost;
 const bestAssortment=bestResult(assortmentResults.filter(x=>x.storeLinkCandidate)),assortmentFields=bestAssortment?.ok?Object.fromEntries(Object.entries(bestAssortment.inference.fields).map(([role,x])=>[role,x.candidate])):{};
 return{
  status:salesResults.some(x=>x.ok)||priceResults.some(x=>x.ok)||assortmentResults.some(x=>x.ok)?'READY':'NO_ENTITY_RESPONDED',
  checkedAt:new Date().toISOString(),...ready,
  domains:{sales:salesResults,price:priceResults,assortmentChannel:assortmentResults},
  recommendation:{
   salesEntity:bestSales?.ok?bestSales.entity:null,
   fields:recommended,costDetected,marginReady:costDetected&&!!recommended.net,
   assortmentChannelEntity:bestAssortment?.ok?bestAssortment.entity:null,
   assortmentChannelFields:assortmentFields,
   storeAssortmentAutomationReady:!!(bestAssortment?.ok&&assortmentFields.channel&&assortmentFields.assortment),
   assortmentProbeOnly:true
  },
  safeguards:{writes:false,configurationChanged:false,unknownCostBecomesZero:false,assortmentAssignmentChanged:false}
 }
}

import { getProductCost } from './dynamics-cost.mjs';
import { valueByBasis } from './unit-conversion.mjs';

const clean=v=>String(v??'').trim();
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
const round2=v=>v==null?null:Math.round((Number(v)+Number.EPSILON)*100)/100;

function dateOnly(v){const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function excludedStatus(v){return ['VOIDED','CANCELLED','CANCELED'].includes(clean(v).toUpperCase())}

export async function probeUnitAwareTransactionMargin({storeId,rows=[],mapping={},costResolver=getProductCost}={}){
 const list=Array.isArray(rows)?rows:[],f=mapping.fields||{},salesSign=Number(mapping.salesSign||-1);
 if(!f.transaction||!f.product||!f.net||!f.quantity)return{status:'UNAVAILABLE',displaySafe:false,reason:'TRANSACTION_PRODUCT_NET_QUANTITY_REQUIRED'};
 const active=list.filter(r=>!excludedStatus(f.status?r?.[f.status]:null));
 const skus=[...new Set(active.map(r=>clean(r?.[f.product])).filter(Boolean))];
 const costMap=new Map();
 const chunks=[];for(let i=0;i<skus.length;i+=10)chunks.push(skus.slice(i,i+10));
 for(const chunk of chunks){
  const settled=await Promise.allSettled(chunk.map(async sku=>{
   const row=active.find(r=>clean(r?.[f.product])===sku),day=dateOnly(f.businessDate?row?.[f.businessDate]:null)||new Date().toISOString().slice(0,10);
   return [sku,await costResolver(storeId,sku,{businessDate:day})]
  }));
  for(const x of settled)if(x.status==='fulfilled')costMap.set(x.value[0],x.value[1]);
 }
 const tx=new Map();let eligibleLines=0,valuedLines=0,weightedConversions=0,unknownUnits=0,costUnavailable=0;
 for(const row of active){
  const transactionId=clean(row?.[f.transaction]),sku=clean(row?.[f.product]),rawSales=finite(row?.[f.net]),rawQty=finite(row?.[f.quantity]);
  if(!transactionId||!sku||rawSales===null||rawQty===null)continue;
  const sales=rawSales*salesSign;if(!(sales>0))continue;
  eligibleLines++;
  const qty=Math.abs(rawQty),cost=costMap.get(sku),saleUnit=clean(f.salesUnit?row?.[f.salesUnit]:'')||clean(cost?.salesUnit),costUnit=clean(cost?.inventoryUnit||cost?.unit);
  const cur=tx.get(transactionId)||{transactionId,sales:0,cost:0,lines:0,valuedLines:0,conversionLines:0,unvaluedLines:0};
  cur.sales+=sales;cur.lines++;
  if(cost?.status!=='READY'||cost?.unitCost==null){costUnavailable++;cur.unvaluedLines++;tx.set(transactionId,cur);continue}
  const valuation=valueByBasis({quantity:qty,quantityUnit:saleUnit,amount:cost.unitCost,basisUnit:costUnit,basisQuantity:1});
  if(valuation.status!=='READY'){unknownUnits++;cur.unvaluedLines++;tx.set(transactionId,cur);continue}
  valuedLines++;if(valuation.conversionFactor!==1)weightedConversions++;
  cur.cost+=Number(valuation.total||0);cur.valuedLines++;if(valuation.conversionFactor!==1)cur.conversionLines++;tx.set(transactionId,cur)
 }
 const tickets=[...tx.values()].map(x=>({...x,coverage:x.lines?x.valuedLines/x.lines:0,margin:x.sales-x.cost,marginRate:x.sales?((x.sales-x.cost)/x.sales)*100:null}));
 const complete=tickets.filter(x=>x.lines>0&&x.valuedLines===x.lines),sales=complete.reduce((a,x)=>a+x.sales,0),cost=complete.reduce((a,x)=>a+x.cost,0),coverage=eligibleLines?valuedLines/eligibleLines:0;
 return{
  status:eligibleLines&&valuedLines?'CANDIDATE':'UNAVAILABLE',
  displaySafe:false,
  reason:'BUSINESS_VALIDATION_REQUIRED',
  method:'TRANSACTION_LINE_UNIT_AWARE_COST_V1',
  eligibleLines,valuedLines,costUnavailable,unknownUnits,weightedConversions,
  lineCoverage:round2(coverage*100),
  completeTransactions:complete.length,
  transactionCount:tickets.length,
  aggregateCompleteTransactions:{sales:round2(sales),cost:round2(cost),margin:round2(sales-cost),marginRate:sales?round2(((sales-cost)/sales)*100):null},
  sample:complete.slice(0,5).map(x=>({transactionId:x.transactionId,sales:round2(x.sales),cost:round2(x.cost),margin:round2(x.margin),marginRate:round2(x.marginRate),lines:x.lines,convertedLines:x.conversionLines})),
  unitPolicy:'SALE_UNIT_TO_INVENTORY_COST_UNIT'
 }
}

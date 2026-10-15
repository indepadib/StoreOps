import { valueByBasis } from './unit-conversion.mjs';

const clean=v=>String(v??'').trim();
const finite=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const round2=v=>v==null?null:Math.round((Number(v)+Number.EPSILON)*100)/100;

export function inferTransactionCostKind(fieldName='',explicit=''){
  const configured=clean(explicit).toUpperCase();
  if(['UNIT_COST_INVENTORY','UNIT_COST','COST_PRICE','INVENTORY_UNIT_COST'].includes(configured))return'UNIT_COST_INVENTORY';
  if(['LINE_AMOUNT','TOTAL_LINE_COST','COGS_LINE_AMOUNT','COST_AMOUNT'].includes(configured))return'LINE_AMOUNT';
  const f=clean(fieldName).toLowerCase();
  if(/costprice|unitcost|costunit|inventorycostprice/.test(f))return'UNIT_COST_INVENTORY';
  if(/costamount|costvalue|cogs|totalcost|linecost/.test(f))return'LINE_AMOUNT';
  return'UNKNOWN';
}

function bucketAdd(map,key,{sales,cost,valued,converted=false}){
  if(!key)return;
  const cur=map.get(key)||{sales:0,cost:0,eligibleSales:0,valuedSales:0,eligibleLines:0,valuedLines:0,convertedLines:0};
  cur.sales+=sales;cur.eligibleSales+=sales;cur.eligibleLines++;
  if(valued){cur.cost+=cost;cur.valuedSales+=sales;cur.valuedLines++;if(converted)cur.convertedLines++}
  map.set(key,cur)
}

function bucketPublic(map){
  return Object.fromEntries([...map.entries()].map(([key,x])=>{
    const coverage=x.eligibleSales?x.valuedSales/x.eligibleSales*100:null;
    const marginValue=x.valuedSales?x.valuedSales-x.cost:null;
    return[key,{sales:round2(x.sales),cost:round2(x.cost),eligibleSales:round2(x.eligibleSales),valuedSales:round2(x.valuedSales),coveragePct:round2(coverage),marginValue:round2(marginValue),marginRate:x.valuedSales?round2(marginValue/x.valuedSales*100):null,eligibleLines:x.eligibleLines,valuedLines:x.valuedLines,convertedLines:x.convertedLines}]
  }))
}

export function evaluateTransactionMarginRows({rows=[],fields={},salesSign=-1,productRefs=new Map(),costKind='UNKNOWN'}={}){
  const list=Array.isArray(rows)?rows:[];
  const byProduct=new Map(),byDate=new Map();
  let totalSales=0,valuedSales=0,totalCost=0,eligibleLines=0,valuedLines=0,unknownUnitLines=0,missingCostLines=0,missingProductLines=0,implausibleLines=0,weightedConversions=0,fallbackUnitCostLines=0;
  const examples=[];

  if(!fields.cost)return{status:'UNAVAILABLE',available:false,reason:'TRANSACTION_COST_FIELD_UNMAPPED',costKind:'UNKNOWN',coveragePct:0,marginValue:null,marginRate:null,byProduct:{},byDate:{}};
  if(costKind==='UNKNOWN')return{status:'UNVALIDATED',available:false,reason:'TRANSACTION_COST_SEMANTICS_UNKNOWN',costKind,coveragePct:0,marginValue:null,marginRate:null,byProduct:{},byDate:{}};

  for(const row of list){
    const rawSales=finite(row?.[fields.net]),sales=rawSales===null?null:rawSales*Number(salesSign||-1);
    if(!(sales>0))continue;
    const product=clean(fields.product?row?.[fields.product]:'')||null;
    const day=clean(fields.date?row?.[fields.date]:'').slice(0,10)||null;
    const qty=Math.abs(finite(fields.quantity?row?.[fields.quantity]:null)??0);
    const rawCost=finite(row?.[fields.cost]),rawFallbackCost=finite(fields.costUnitPrice?row?.[fields.costUnitPrice]:null);
    totalSales+=sales;eligibleLines++;

    let lineCost=null,converted=false,reason=null,saleUnit=null,costUnit=null,conversionFactor=null,usedFallback=false;
    const unitAwareCost=(unitPrice)=>{
      const ref=product?productRefs.get(product):null;
      if(!product){missingProductLines++;reason='PRODUCT_MISSING';return}
      saleUnit=clean(fields.salesUnit?row?.[fields.salesUnit]:'')||clean(ref?.salesUnit)||clean(ref?.inventoryUnit);
      costUnit=clean(ref?.inventoryUnit)||saleUnit;
      if(!saleUnit||!costUnit||!(qty>0)){unknownUnitLines++;reason='UNIT_OR_QUANTITY_MISSING';return}
      const valuation=valueByBasis({quantity:qty,quantityUnit:saleUnit,amount:Math.abs(unitPrice),basisUnit:costUnit,basisQuantity:1});
      if(valuation.status==='READY'){
        lineCost=Number(valuation.total);conversionFactor=valuation.conversionFactor;converted=valuation.conversionFactor!==1;if(converted)weightedConversions++;
      }else{unknownUnitLines++;reason=valuation.status}
    };

    if(costKind==='LINE_AMOUNT'){
      if(rawCost!==null&&rawCost!==0)lineCost=Math.abs(rawCost);
      else if(rawFallbackCost!==null&&rawFallbackCost!==0){usedFallback=true;fallbackUnitCostLines++;unitAwareCost(rawFallbackCost)}
      else{missingCostLines++;reason='COST_MISSING'}
    }else{
      if(rawCost===null||rawCost===0){missingCostLines++;reason='COST_MISSING'}
      else unitAwareCost(rawCost)
    }

    let valued=Number.isFinite(lineCost)&&lineCost>=0;
    if(valued){
      const ratio=lineCost/Math.max(sales,.01);
      if(!Number.isFinite(ratio)||ratio>4){
        valued=false;implausibleLines++;reason='LINE_COST_TO_SALES_IMPLAUSIBLE';
      }
    }

    if(valued){valuedSales+=sales;totalCost+=lineCost;valuedLines++}
    if(examples.length<20&&(!valued||converted||usedFallback))examples.push({product,sales:round2(sales),quantity:qty,saleUnit:saleUnit||null,costFieldValue:rawCost,fallbackCostFieldValue:rawFallbackCost,usedFallback,costUnit:costUnit||null,conversionFactor,computedCost:round2(lineCost),valued,reason});

    bucketAdd(byProduct,product,{sales,cost:lineCost||0,valued,converted});
    bucketAdd(byDate,day,{sales,cost:lineCost||0,valued,converted});
  }

  const coveragePct=totalSales?valuedSales/totalSales*100:0;
  const marginValue=valuedSales?valuedSales-totalCost:null;
  const marginRate=valuedSales?marginValue/valuedSales*100:null;
  // Strong publication guard: no aggregate margin unless almost all CA is valued and
  // the result is economically plausible. We never clamp a bad margin to a target.
  const plausible=marginRate!==null&&marginRate>=-10&&marginRate<=70;
  const available=coveragePct>=95&&plausible&&valuedLines>0;
  const reason=available?null:coveragePct<95?'COST_COVERAGE_BELOW_95':!plausible?'AGGREGATE_MARGIN_IMPLAUSIBLE':'NO_VALUED_LINES';

  return{
    status:available?'VALIDATED':'UNVALIDATED',
    available,
    reason,
    method:costKind==='UNIT_COST_INVENTORY'?'TRANSACTION_COST_PRICE_X_INVENTORY_QUANTITY':fallbackUnitCostLines?'TRANSACTION_COST_AMOUNT_WITH_UNIT_COST_FALLBACK':'TRANSACTION_LINE_COST_AMOUNT',
    costKind,
    coveragePct:round2(coveragePct),
    totalSales:round2(totalSales),
    valuedSales:round2(valuedSales),
    totalCost:round2(totalCost),
    marginValue:available?round2(marginValue):null,
    marginRate:available?round2(marginRate):null,
    diagnosticMarginValue:round2(marginValue),
    diagnosticMarginRate:round2(marginRate),
    eligibleLines,valuedLines,missingCostLines,missingProductLines,unknownUnitLines,implausibleLines,weightedConversions,fallbackUnitCostLines,
    byProduct:bucketPublic(byProduct),
    byDate:bucketPublic(byDate),
    examples
  }
}

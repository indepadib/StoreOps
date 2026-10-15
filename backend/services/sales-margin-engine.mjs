import { valueByBasis } from './unit-conversion.mjs';

const clean=v=>String(v??'').trim();
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
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

function mainSalesFieldLooksTaxInclusive(field=''){
  return /incltax|includingtax|gross/i.test(clean(field));
}

function marginSalesBasis(row,fields,salesSign){
  const displayRaw=finite(row?.[fields.net]),displaySales=displayRaw===null?null:displayRaw*Number(salesSign||-1);
  if(!(displaySales>0))return{status:'INVALID_SALE',displaySales:null,marginSales:null,source:null};

  if(fields.marginNet){
    const raw=finite(row?.[fields.marginNet]),amount=raw===null?null:raw*Number(salesSign||-1);
    if(amount>0&&amount<=displaySales*1.05){
      return{status:'READY',displaySales,marginSales:amount,source:'EXCL_TAX_FIELD',field:fields.marginNet,taxAmount:round2(displaySales-amount)}
    }
  }

  // If the mapped sales field is already NetAmount / HT, it is the correct
  // gross-margin denominator. TaxAmount must NOT be subtracted a second time.
  if(!mainSalesFieldLooksTaxInclusive(fields.net)){
    return{status:'READY',displaySales,marginSales:displaySales,source:'MAIN_FIELD_EXCL_TAX',field:fields.net,taxAmount:fields.taxAmount?Math.abs(finite(row?.[fields.taxAmount])??0):null}
  }

  if(fields.taxAmount){
    const taxRaw=finite(row?.[fields.taxAmount]),tax=taxRaw===null?null:Math.abs(taxRaw);
    const amount=tax===null?null:displaySales-tax;
    if(amount>0&&amount<=displaySales*1.001){
      return{status:'READY',displaySales,marginSales:amount,source:'DERIVED_TTC_MINUS_TAX',field:fields.net,taxField:fields.taxAmount,taxAmount:tax}
    }
  }

  return{status:'MARGIN_NET_EXCL_TAX_UNAVAILABLE',displaySales,marginSales:null,source:null}
}

function bucketAdd(map,key,{displaySales,marginSales,cost,valued,converted=false,basisReady=false}){
  if(!key)return;
  const cur=map.get(key)||{sales:0,marginSalesBase:0,cost:0,basisCoveredDisplaySales:0,eligibleMarginSales:0,valuedMarginSales:0,eligibleLines:0,basisLines:0,valuedLines:0,convertedLines:0};
  cur.sales+=displaySales;
  cur.eligibleLines++;
  if(basisReady){
    cur.marginSalesBase+=marginSales;
    cur.eligibleMarginSales+=marginSales;
    cur.basisCoveredDisplaySales+=displaySales;
    cur.basisLines++;
  }
  if(valued){
    cur.cost+=cost;
    cur.valuedMarginSales+=marginSales;
    cur.valuedLines++;
    if(converted)cur.convertedLines++
  }
  map.set(key,cur)
}

function bucketPublic(map){
  return Object.fromEntries([...map.entries()].map(([key,x])=>{
    const basisCoverage=x.sales?x.basisCoveredDisplaySales/x.sales*100:null;
    const costCoverage=x.eligibleMarginSales?x.valuedMarginSales/x.eligibleMarginSales*100:null;
    const marginValue=x.valuedMarginSales?x.valuedMarginSales-x.cost:null;
    return[key,{
      sales:round2(x.sales),
      marginSalesBase:round2(x.valuedMarginSales),
      eligibleMarginSales:round2(x.marginSalesBase),
      cost:round2(x.cost),
      basisCoveragePct:round2(basisCoverage),
      coveragePct:round2(costCoverage),
      marginValue:round2(marginValue),
      marginRate:x.valuedMarginSales?round2(marginValue/x.valuedMarginSales*100):null,
      eligibleLines:x.eligibleLines,basisLines:x.basisLines,valuedLines:x.valuedLines,convertedLines:x.convertedLines
    }]
  }))
}

export function selectTransactionCostSemantics({lineAmountEval=null,unitCostEval=null,min=0,max=30,tolerancePctPoints=3}={}){
  const rateOk=e=>e?.available===true&&Number.isFinite(Number(e.marginRate))&&Number(e.marginRate)>=min&&Number(e.marginRate)<=max;
  const lineOk=rateOk(lineAmountEval),unitOk=rateOk(unitCostEval);
  if(lineOk&&!unitOk)return{status:'VALIDATED',selected:'LINE_AMOUNT',evaluation:lineAmountEval,reason:'ONLY_LINE_AMOUNT_MODEL_PASSES_BUSINESS_SANITY'};
  if(unitOk&&!lineOk)return{status:'VALIDATED',selected:'UNIT_COST_INVENTORY',evaluation:unitCostEval,reason:'ONLY_UNIT_COST_MODEL_PASSES_BUSINESS_SANITY'};
  if(lineOk&&unitOk){
    const gap=Math.abs(Number(lineAmountEval.marginRate)-Number(unitCostEval.marginRate));
    if(gap<=tolerancePctPoints)return{status:'VALIDATED',selected:'LINE_AMOUNT',evaluation:lineAmountEval,reason:'COST_MODELS_AGREE',rateGapPctPoints:round2(gap)};
    return{status:'UNVALIDATED',selected:null,evaluation:null,reason:'COST_SEMANTICS_AMBIGUOUS',rateGapPctPoints:round2(gap)};
  }
  return{status:'UNVALIDATED',selected:null,evaluation:null,reason:'NO_COST_MODEL_PASSES_BUSINESS_SANITY'};
}

export function evaluateTransactionMarginRows({rows=[],fields={},salesSign=-1,productRefs=new Map(),costKind='UNKNOWN'}={}){
  const list=Array.isArray(rows)?rows:[];
  const byProduct=new Map(),byDate=new Map();
  let totalDisplaySales=0,basisCoveredDisplaySales=0,totalMarginSales=0,valuedMarginSales=0,totalCost=0;
  let eligibleLines=0,basisLines=0,valuedLines=0,unknownUnitLines=0,missingCostLines=0,missingProductLines=0,implausibleLines=0,weightedConversions=0,fallbackUnitCostLines=0,basisMissingLines=0;
  let lineCostCrossCheckLines=0,lineCostCrossCheckAgree=0;
  const examples=[],basisSources=new Set();

  if(!fields.cost)return{status:'UNAVAILABLE',available:false,reason:'TRANSACTION_COST_FIELD_UNMAPPED',costKind:'UNKNOWN',coveragePct:0,basisCoveragePct:0,marginValue:null,marginRate:null,byProduct:{},byDate:{}};
  if(costKind==='UNKNOWN')return{status:'UNVALIDATED',available:false,reason:'TRANSACTION_COST_SEMANTICS_UNKNOWN',costKind,coveragePct:0,basisCoveragePct:0,marginValue:null,marginRate:null,byProduct:{},byDate:{}};

  for(const row of list){
    const basis=marginSalesBasis(row,fields,salesSign);
    if(!(basis.displaySales>0))continue;
    totalDisplaySales+=basis.displaySales;eligibleLines++;
    const product=clean(fields.product?row?.[fields.product]:'')||null;
    const day=clean(fields.date?row?.[fields.date]:'').slice(0,10)||null;
    const qty=Math.abs(finite(fields.quantity?row?.[fields.quantity]:null)??0);
    const rawCost=finite(row?.[fields.cost]),rawFallbackCost=finite(fields.costUnitPrice?row?.[fields.costUnitPrice]:null);

    const basisReady=basis.status==='READY'&&basis.marginSales>0;
    if(basisReady){basisLines++;basisCoveredDisplaySales+=basis.displaySales;totalMarginSales+=basis.marginSales;basisSources.add(basis.source)}
    else basisMissingLines++;

    let lineCost=null,converted=false,reason=basisReady?null:basis.status,saleUnit=null,costUnit=null,conversionFactor=null,usedFallback=false;
    const computeUnitAwareCost=(unitPrice)=>{
      const ref=product?productRefs.get(product):null;
      if(!product){missingProductLines++;return{status:'PRODUCT_MISSING',total:null}}
      saleUnit=clean(fields.salesUnit?row?.[fields.salesUnit]:'')||clean(ref?.salesUnit)||clean(fields.inventoryUnit?row?.[fields.inventoryUnit]:'')||clean(ref?.inventoryUnit);
      costUnit=clean(fields.inventoryUnit?row?.[fields.inventoryUnit]:'')||clean(ref?.inventoryUnit)||saleUnit;
      if(!saleUnit||!costUnit||!(qty>0)){unknownUnitLines++;return{status:'UNIT_OR_QUANTITY_MISSING',total:null}}
      const valuation=valueByBasis({quantity:qty,quantityUnit:saleUnit,amount:Math.abs(unitPrice),basisUnit:costUnit,basisQuantity:1});
      if(valuation.status!=='READY'){unknownUnitLines++;return{status:valuation.status,total:null}}
      conversionFactor=valuation.conversionFactor;converted=valuation.conversionFactor!==1;
      return{status:'READY',total:Number(valuation.total),conversionFactor:valuation.conversionFactor}
    };

    if(basisReady){
      if(costKind==='LINE_AMOUNT'){
        if(rawCost!==null&&rawCost!==0){
          lineCost=Math.abs(rawCost);
          if(rawFallbackCost!==null&&rawFallbackCost!==0){
            const alt=computeUnitAwareCost(rawFallbackCost);
            if(alt.status==='READY'&&alt.total>0){
              lineCostCrossCheckLines++;
              const ratio=lineCost/alt.total;
              if(ratio>=0.8&&ratio<=1.2)lineCostCrossCheckAgree++;
            }
          }
        }else if(rawFallbackCost!==null&&rawFallbackCost!==0){
          usedFallback=true;fallbackUnitCostLines++;
          const alt=computeUnitAwareCost(rawFallbackCost);
          if(alt.status==='READY')lineCost=alt.total;else reason=alt.status
        }else{missingCostLines++;reason='COST_MISSING'}
      }else{
        if(rawCost===null||rawCost===0){missingCostLines++;reason='COST_MISSING'}
        else{
          const alt=computeUnitAwareCost(rawCost);
          if(alt.status==='READY')lineCost=alt.total;else reason=alt.status
        }
      }
    }

    let valued=basisReady&&Number.isFinite(lineCost)&&lineCost>=0;
    if(valued){
      const ratio=lineCost/Math.max(basis.marginSales,.01);
      if(!Number.isFinite(ratio)||ratio>2){
        valued=false;implausibleLines++;reason='LINE_COST_TO_NET_SALES_IMPLAUSIBLE'
      }
    }

    if(valued){
      valuedMarginSales+=basis.marginSales;
      totalCost+=lineCost;
      valuedLines++;
      if(converted)weightedConversions++
    }

    if(examples.length<30&&(!valued||converted||usedFallback)){
      examples.push({
        product,displaySales:round2(basis.displaySales),marginSales:round2(basis.marginSales),salesBasis:basis.source||null,taxAmount:round2(basis.taxAmount),
        quantity:qty,saleUnit:saleUnit||null,costFieldValue:rawCost,fallbackCostFieldValue:rawFallbackCost,usedFallback,costUnit:costUnit||null,
        conversionFactor,computedCost:round2(lineCost),valued,reason
      })
    }

    bucketAdd(byProduct,product,{displaySales:basis.displaySales,marginSales:basis.marginSales||0,cost:lineCost||0,valued,converted,basisReady});
    bucketAdd(byDate,day,{displaySales:basis.displaySales,marginSales:basis.marginSales||0,cost:lineCost||0,valued,converted,basisReady})
  }

  const basisCoveragePct=totalDisplaySales?basisCoveredDisplaySales/totalDisplaySales*100:0;
  const coveragePct=totalMarginSales?valuedMarginSales/totalMarginSales*100:0;
  const marginValue=valuedMarginSales?valuedMarginSales-totalCost:null;
  const marginRate=valuedMarginSales?marginValue/valuedMarginSales*100:null;
  const crossCheckPct=lineCostCrossCheckLines?lineCostCrossCheckAgree/lineCostCrossCheckLines*100:null;

  const plausible=marginRate!==null&&marginRate>=-10&&marginRate<=60;
  const basisComplete=basisCoveragePct>=99;
  const costComplete=coveragePct>=99;
  const crossCheckOk=crossCheckPct===null||lineCostCrossCheckLines<10||crossCheckPct>=80;
  const available=basisComplete&&costComplete&&plausible&&crossCheckOk&&valuedLines>0;
  const reason=available?null:
    !basisComplete?'MARGIN_NET_EXCL_TAX_COVERAGE_BELOW_99':
    !costComplete?'COST_COVERAGE_BELOW_99':
    !crossCheckOk?'COST_AMOUNT_VS_UNIT_COST_MISMATCH':
    !plausible?'AGGREGATE_MARGIN_IMPLAUSIBLE':'NO_VALUED_LINES';

  return{
    status:available?'VALIDATED':'UNVALIDATED',
    available,
    reason,
    method:costKind==='UNIT_COST_INVENTORY'?'TRANSACTION_COST_PRICE_X_INVENTORY_QUANTITY':fallbackUnitCostLines?'TRANSACTION_COST_AMOUNT_WITH_UNIT_COST_FALLBACK':'TRANSACTION_LINE_COST_AMOUNT',
    costKind,
    salesBasis:basisSources.size===1?[...basisSources][0]:basisSources.size?'MIXED':null,
    salesBasisField:fields.marginNet||(!mainSalesFieldLooksTaxInclusive(fields.net)?fields.net:null)||null,
    taxField:fields.taxAmount||null,
    basisCoveragePct:round2(basisCoveragePct),
    coveragePct:round2(coveragePct),
    totalDisplaySales:round2(totalDisplaySales),
    totalMarginSales:round2(totalMarginSales),
    valuedMarginSales:round2(valuedMarginSales),
    totalCost:round2(totalCost),
    marginValue:available?round2(marginValue):null,
    marginRate:available?round2(marginRate):null,
    diagnosticMarginValue:round2(marginValue),
    diagnosticMarginRate:round2(marginRate),
    eligibleLines,basisLines,basisMissingLines,valuedLines,missingCostLines,missingProductLines,unknownUnitLines,implausibleLines,weightedConversions,fallbackUnitCostLines,
    lineCostCrossCheckLines,lineCostCrossCheckAgree,costCrossCheckPct:round2(crossCheckPct),
    byProduct:bucketPublic(byProduct),
    byDate:bucketPublic(byDate),
    examples
  }
}

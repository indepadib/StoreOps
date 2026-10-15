import {productDataMany} from './product-data.mjs';
import {readRetailHierarchyContext} from './retail-hierarchy-data.mjs';
import {resolveRetailHierarchy} from './retail-hierarchy.mjs';
import {valueByBasis} from './unit-conversion.mjs';

const clean=v=>String(v??'').trim();
const round4=v=>v==null?null:Math.round((Number(v)+Number.EPSILON)*10000)/10000;

function salesUnitCost(ref={}){
  const cost=Number(ref.unitCost);
  if(!Number.isFinite(cost)||cost<0)return{status:'UNAVAILABLE',unitCost:null,reason:'UNIT_COST_UNAVAILABLE'};
  const salesUnit=clean(ref.salesUnit),inventoryUnit=clean(ref.inventoryUnit);
  if(!salesUnit||!inventoryUnit)return{status:'UNAVAILABLE',unitCost:null,reason:'UNIT_MAPPING_UNAVAILABLE'};
  const valuation=valueByBasis({quantity:1,quantityUnit:salesUnit,amount:cost,basisUnit:inventoryUnit,basisQuantity:1});
  if(valuation.status!=='READY')return{status:'UNAVAILABLE',unitCost:null,reason:valuation.reason||'UNIT_CONVERSION_UNAVAILABLE'};
  return{status:'READY',unitCost:round4(valuation.total),conversionFactor:valuation.conversionFactor,salesUnit,inventoryUnit}
}

export async function readAnalyticsCatalog(productNumbers=[]){
  const skus=[...new Set((productNumbers||[]).map(clean).filter(Boolean))].slice(0,240);
  if(!skus.length)return{status:'READY',items:[],diagnostics:{requested:0,resolvedNames:0,resolvedHierarchy:0,costReady:0}};
  const [refs,context]=await Promise.all([productDataMany(skus),readRetailHierarchyContext(skus)]);
  const items=skus.map(productNumber=>{
    const ref=refs.get(productNumber)||{productNumber},hierarchy=resolveRetailHierarchy(productNumber,context,{rayonLabel:ref.rayonLabel}),cost=salesUnitCost(ref);
    return{
      productNumber,
      productName:ref.productName||null,
      productNameSource:ref.productNameSource||ref.source||null,
      nameStatus:ref.productName?'RESOLVED':'MISSING',
      hierarchyStatus:hierarchy.status,
      ub:hierarchy.ub||null,
      hierarchy:hierarchy.levels||{},
      retailScope:ref.retailScope||null,
      rayonCode:ref.rayonCode||null,
      rayonLabel:ref.rayonLabel||null,
      salesUnit:ref.salesUnit||null,
      inventoryUnit:ref.inventoryUnit||null,
      rawUnitCost:Number.isFinite(Number(ref.unitCost))?Number(ref.unitCost):null,
      rawCostBasisUnit:ref.inventoryUnit||null,
      currentUnitCost:cost.unitCost,
      currentCostBasisUnit:cost.status==='READY'?cost.salesUnit||null:null,
      currentCostStatus:cost.status,
      costReason:cost.reason||null,
      costSource:ref.unitCost!=null?'D365/ReleasedProductsV2.UnitCost':null,
      costMethod:cost.status==='READY'?'CURRENT_UNIT_COST_CONVERTED_TO_SALES_UNIT':null
    }
  });
  return{
    status:'READY',
    items,
    diagnostics:{
      requested:skus.length,
      resolvedNames:items.filter(x=>x.productName).length,
      resolvedHierarchy:items.filter(x=>x.hierarchyStatus==='RESOLVED').length,
      costReady:items.filter(x=>x.currentCostStatus==='READY').length,
      hierarchySource:context?.diagnostics?.source||null,
      hierarchyStatus:context?.diagnostics?.status||null
    }
  }
}
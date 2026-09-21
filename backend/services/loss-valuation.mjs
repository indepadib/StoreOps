import { valueByBasis } from './unit-conversion.mjs';

const clean=v=>String(v??'').trim();
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
const round2=v=>v==null?null:Math.round((Number(v)+Number.EPSILON)*100)/100;
const round6=v=>v==null?null:Math.round((Number(v)+Number.EPSILON)*1e6)/1e6;

export const LOSS_VALUATION_VERSION='UNIT_AWARE_V1';

export function calculateLossValuation({quantity,unit,product}={}){
 const qty=Number(quantity),lossUnit=clean(unit)||null;
 const retailAmount=finite(product?.price);
 const retailUnit=clean(product?.retailUnit||product?.unit)||null;
 const retailPriceQuantity=finite(product?.retailPriceQuantity)??1;
 const retail=valueByBasis({quantity:qty,quantityUnit:lossUnit,amount:retailAmount,basisUnit:retailUnit,basisQuantity:retailPriceQuantity});

 const costAmount=finite(product?.unitCost);
 const costUnit=clean(product?.costUnit)||null;
 const costBasisQuantity=finite(product?.costBasisQuantity)??1;
 const cost=valueByBasis({quantity:qty,quantityUnit:lossUnit,amount:costAmount,basisUnit:costUnit,basisQuantity:costBasisQuantity});

 return{
  version:LOSS_VALUATION_VERSION,
  retail:{
   state:retail.status,
   amount:retailAmount,
   unit:retailUnit,
   basisQuantity:retailPriceQuantity,
   equivalentQuantity:round6(retail.equivalentQuantity),
   conversionFactor:round6(retail.conversionFactor),
   total:round2(retail.total)
  },
  cost:{
   state:cost.status,
   amount:costAmount,
   unit:costUnit,
   basisQuantity:costBasisQuantity,
   equivalentQuantity:round6(cost.equivalentQuantity),
   conversionFactor:round6(cost.conversionFactor),
   total:round2(cost.total),
   source:product?.costSource||null,
   sourceState:product?.costState||'UNAVAILABLE'
  }
 }
}

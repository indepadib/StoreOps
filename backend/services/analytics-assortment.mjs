import {readStoreSalesRange} from './dynamics-sales.mjs';
const date=value=>{const text=String(value||''),n=Date.parse(text+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(text)&&Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===text?text:null};
export async function readAssortmentSalesSlice(storeId,{start,end},{read=readStoreSalesRange}={}){
 const startDate=date(start),endDate=date(end),days=(Date.parse(endDate)-Date.parse(startDate))/86400000+1;
 if(!startDate||!endDate||days<1||days>2)throw Object.assign(Error('Une tranche de ventes de un à deux jours est requise.'),{status:400});
 const data=await read(storeId,{startDate,endDate,exportLean:true});
 if(data?.status!=='READY'||data.diagnostics?.truncated||data.days!==days||!Array.isArray(data.products))throw Object.assign(Error('Ventes incomplètes : aucune absence de vente ne peut être conclue.'),{status:409,code:'ASSORTMENT_SALES_INCOMPLETE'});
 const products=data.products.map(row=>{
  if(!row.key||typeof row.sales!=='number'||!Number.isFinite(row.sales))throw Object.assign(Error('Code ou montant article manquant dans les ventes.'),{status:409});
  return{productNumber:String(row.key),sales:row.sales,quantityByUnit:row.quantityByUnit||{}};
 });
 return{status:'READY',storeId,startDate,endDate,days,source:data.source,products};
}

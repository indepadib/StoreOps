import {analyticalProductCode} from './product-history.js';
import {origin} from './detention-metrics.js';
const code=value=>analyticalProductCode(String(value||'').trim());
export function mergeAssortmentSales(parts){
 const products=new Map(),dates=new Set();let storeId=null,days=0;
 for(const part of parts){
  if(part.status!=='READY'||!Array.isArray(part.products)||!part.storeId||storeId&&storeId!==part.storeId)throw Error('Périmètre de ventes incomplet ou mélangé.');
  storeId=part.storeId;
  const start=Date.parse(part.startDate),end=Date.parse(part.endDate),count=(end-start)/86400000+1;
  if(!Number.isInteger(count)||count<1||count!==part.days)throw Error('Dates de ventes incohérentes.');
  for(let n=start;n<=end;n+=86400000){if(dates.has(n))throw Error('Tranches de ventes en double.');dates.add(n);days++}
  for(const row of part.products){
   const sku=code(row.productNumber);if(!sku||!Number.isFinite(row.sales))throw Error('Montant article manquant.');
   const item=products.get(sku)||{productNumber:sku,sales:0,quantityByUnit:{},codes:new Set()};
   item.sales+=row.sales;item.codes.add(row.productNumber);
   for(const [unit,quantity] of Object.entries(row.quantityByUnit||{})){if(!unit||!Number.isFinite(quantity))throw Error('Quantité ou unité de vente invalide.');item.quantityByUnit[unit]=(item.quantityByUnit[unit]||0)+quantity}
   products.set(sku,item);
  }
 }
 const ordered=[...dates].sort((a,b)=>a-b);if(ordered.some((n,i)=>i&&n-ordered[i-1]!==86400000))throw Error('Jour de ventes manquant.');
 return{complete:parts.length>0,storeId,days,startDate:ordered.length?new Date(ordered[0]).toISOString().slice(0,10):null,endDate:ordered.length?new Date(ordered.at(-1)).toISOString().slice(0,10):null,products:[...products.values()].map(p=>({...p,codes:[...p.codes]}))};
}
const quantityText=row=>row?Object.entries(row.quantityByUnit||{}).map(([unit,value])=>`${value} ${unit}`).join(' · ')||'Unité non exposée':null;
export function buildAssortmentOpportunities({sourceSales,targetSales=null,history,catalog=new Map()}){
 if(!sourceSales?.complete||!sourceSales.days)throw Error('Ventes source incomplètes.');
 if(targetSales&&(!targetSales.complete||targetSales.days!==sourceSales.days||targetSales.startDate!==sourceSales.startDate||targetSales.endDate!==sourceSales.endDate))throw Error('Les deux magasins doivent couvrir la même période.');
 const source=new Map(sourceSales.products.map(p=>[code(p.productNumber),p])),target=new Map((targetSales?.products||[]).map(p=>[code(p.productNumber),p]));
 const receipts=new Map();for(const receipt of history?.products||[]){const sku=code(receipt.productNumber),old=receipts.get(sku);receipts.set(sku,{...receipt,firstReceiptDate:[old?.firstReceiptDate,receipt.firstReceiptDate].filter(Boolean).sort()[0]||null})}
 const keys=new Set([...source.keys(),...target.keys(),...receipts.keys()]);
 return [...keys].map(sku=>{
  const sale=source.get(sku),other=target.get(sku),receipt=receipts.get(sku),ref=catalog.get(sku)||{};
  const sourceAmount=sale?.sales??0,targetAmount=targetSales?(other?.sales??0):null;
  const targetActivity=!!other; // A zero-net product row can still contain sales and returns.
  const historyStatus=receipt?'RECEIVED':history?.complete===true?'NO_RECEIPT':'UNKNOWN';
  let reading,action;
  if(historyStatus==='UNKNOWN'){reading='Historique cible incomplet';action='Compléter la preuve de réception';}
  else if(historyStatus==='NO_RECEIPT'&&targetAmount>0){reading='Vendu cible sans réception retrouvée';action='Réconcilier ventes et mouvements avant toute décision';}
  else if(historyStatus==='NO_RECEIPT'){reading='Sans réception dans l’historique cible';action=sourceAmount>0?'Étudier le référencement, les contraintes et la demande locale':'Aucun signal de demande source';}
  else if(targetAmount==null){reading='Reçu cible · ventes non lues';action='Lire les ventes cible pour qualifier la rotation';}
  else if(targetAmount>0){reading='Vendu dans le magasin cible';action='Examiner la couverture et les arrivages avant réassort';}
  else if(targetActivity){reading='Activité nette nulle ou retours';action='Vérifier ventes et retours, ne pas classer comme invendu';}
  else{reading='Reçu cible · aucune vente sur la période';action='Diagnostiquer disponibilité, prix et demande locale';}
  return{productNumber:sku,codes:(sale?.codes||[sku]).join(' · '),productName:ref.productName||null,department:ref.hierarchy?.department?.label||null,rayon:ref.hierarchy?.rayon?.label||null,family:ref.hierarchy?.family?.label||null,subfamily:ref.hierarchy?.subfamily?.label||null,subsubfamily:ref.hierarchy?.subsubfamily?.label||null,vendor:ref.vendorName||null,origin:origin(ref),sourceSales:sourceAmount,sourceDaily:sourceAmount/sourceSales.days,sourceQuantities:quantityText(sale),targetSales:targetAmount,targetDaily:targetAmount==null?null:targetAmount/sourceSales.days,targetQuantities:quantityText(other),historyStatus,historyReading:historyStatus==='RECEIVED'?'Réception prouvée':historyStatus==='NO_RECEIPT'?'Absence dans l’historique accessible':'Historique incomplet',firstReceiptDate:receipt?.firstReceiptDate||null,reading,action,sourceSeller:sourceAmount>0,targetActivity};
 }).sort((a,b)=>b.sourceSales-a.sourceSales||a.productNumber.localeCompare(b.productNumber));
}
export function assortmentMode(row,mode){
 if(mode==='NO_RECEIPT')return row.sourceSeller&&row.historyStatus==='NO_RECEIPT';
 if(mode==='RECEIVED_NO_SALES')return row.historyStatus==='RECEIVED'&&row.targetSales===0&&!row.targetActivity;
 if(mode==='BOTH_SELL')return row.sourceSeller&&row.targetSales>0;
 if(mode==='CONTRADICTION')return row.historyStatus==='NO_RECEIPT'&&row.targetSales>0;
 if(mode==='UNKNOWN')return row.historyStatus==='UNKNOWN';
 return true;
}

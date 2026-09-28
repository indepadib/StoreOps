import {readStoreStockSnapshot} from './dynamics-stock.mjs';
import {readStoreSalesActivityWindow} from './dynamics-sales.mjs';
import {assortmentIndex,productTaxonomy} from './assortment.mjs';
import {releasedProductSourcingMany} from './released-product-sourcing.mjs';

const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const clean=v=>String(v??'').trim();
const round=(v,d=2)=>{const p=10**d;return Math.round((Number(v||0)+Number.EPSILON)*p)/p};
const DEAD_DAYS=()=>Math.max(7,Math.min(180,Number(process.env.STOREOPS_DEAD_STOCK_DAYS)||30));
const SLOW_COVERAGE=()=>Math.max(7,Math.min(365,Number(process.env.STOREOPS_SLOW_COVERAGE_DAYS)||30));
const MIN_STOCK=()=>Math.max(0,Number(process.env.STOREOPS_SELLTHROUGH_MIN_STOCK)||0);

function taxonomyLabel(productNumber){
 const rows=productTaxonomy(productNumber)||[],path=rows.find(x=>x.path)?.path,leaf=[...rows].sort((a,b)=>(b.level??-1)-(a.level??-1))[0]?.category_name;
 return path||leaf||null
}

export async function sellThroughSnapshot(storeId,{businessDate=new Date().toISOString().slice(0,10),force=false}={}){
 const days=DEAD_DAYS(),[stock,sales]=await Promise.all([
  readStoreStockSnapshot(storeId),
  readStoreSalesActivityWindow(storeId,{businessDate,days,force})
 ]);
 const complete=stock.status==='READY'&&sales.status==='READY'&&!stock.truncated&&!sales.truncated;
 if(!complete)return{status:'PARTIAL',storeId,businessDate,items:[],summary:{dead:0,slow:0,overstockUnits:0},diagnostics:{stockStatus:stock.status,salesStatus:sales.status,stockComplete:!!stock.complete,salesTruncated:!!sales.truncated}};
 const assortment=assortmentIndex(storeId,{businessDate}),salesMap=new Map((sales.products||[]).map(x=>[clean(x.productNumber),x])),items=[];
 for(const row of stock.items||[]){
  const productNumber=clean(row.productNumber),available=round(row.availableOnHandQuantity,3);if(!productNumber||!(available>MIN_STOCK()))continue;
  if(assortment.status==='READY'&&!assortment.included.has(productNumber))continue;
  const sale=salesMap.get(productNumber)||null,salesUnits=n(sale?.units),salesValue=n(sale?.salesValue),daily=salesUnits>0?round(salesUnits/days,3):0,coverage=daily>0?round(available/daily,1):null,category=taxonomyLabel(productNumber);
  if(!sale||salesUnits<=0){
   items.push({id:`dead-${productNumber}`,type:'DEAD',priority:'HIGH',productNumber,name:(sale?.name&&sale.name!==productNumber?sale.name:row.name)||productNumber,ean:row.ean||null,category,availableStock:available,salesUnit:sale?.salesUnit||null,salesUnitsWindow:0,salesValueWindow:0,dailySales:0,coverageDays:null,noSaleDays:days,reason:`Aucune vente sur les ${days} derniers jours malgré un stock disponible.`,suggestedActions:['CHECK_FACING','MERCHANDISE','COOL_SAVE','TRANSFER']});
   continue
  }
  if(coverage!==null&&coverage>=SLOW_COVERAGE()){
   items.push({id:`slow-${productNumber}`,type:'SLOW',priority:coverage>=SLOW_COVERAGE()*2?'HIGH':'MEDIUM',productNumber,name:(sale?.name&&sale.name!==productNumber?sale.name:row.name)||productNumber,ean:row.ean||null,category,availableStock:available,salesUnit:sale?.salesUnit||null,salesUnitsWindow:round(salesUnits,3),salesValueWindow:round(salesValue,2),dailySales:daily,coverageDays:coverage,noSaleDays:null,reason:`Stock estimé à ${coverage} jours de couverture au rythme récent.`,suggestedActions:['MERCHANDISE','COOL_SAVE','TRANSFER','REDUCE_TARGET']})
  }
 }
 const unresolved=items.filter(x=>!x.name||x.name===x.productNumber).map(x=>x.productNumber);
 if(unresolved.length){
  const released=await releasedProductSourcingMany(unresolved);
  for(const item of items){const name=released.get(item.productNumber)?.productName;if(name)item.name=name}
 }
 items.sort((a,b)=>(a.type==='DEAD'?0:1)-(b.type==='DEAD'?0:1)||(Number(b.coverageDays||999)-Number(a.coverageDays||999))||Number(b.availableStock)-Number(a.availableStock));
 const dead=items.filter(x=>x.type==='DEAD'),slow=items.filter(x=>x.type==='SLOW');
 return{status:'READY',storeId,businessDate,windowDays:days,thresholds:{deadNoSaleDays:days,slowCoverageDays:SLOW_COVERAGE()},items,summary:{dead:dead.length,slow:slow.length,total:items.length,deadStockUnits:round(dead.reduce((s,x)=>s+n(x.availableStock),0),3),slowStockUnits:round(slow.reduce((s,x)=>s+n(x.availableStock),0),3)},diagnostics:{stockSource:stock.source,salesSource:sales.source,assortmentState:assortment.status,warehouseId:stock.warehouseId,rowsRead:stock.rowCount,salesProducts:(sales.products||[]).length}}
}

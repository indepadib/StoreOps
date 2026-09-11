import { buildPriceCheckContext } from './price-check.mjs';
import { assortmentIndex,assortmentMembership,productTaxonomy,classifyAvailability } from './assortment.mjs';
import { getSupplyStockByProductNumber,supplyWarehouseForStore } from './dynamics-stock.mjs';
import { readStoreProductSalesVelocity } from './dynamics-sales.mjs';
import { recommendReplenishment,decisionPresentation } from './replenishment-engine.mjs';

const maxAgeHours=()=>Math.max(1,Math.min(24*30,Number(process.env.STOREOPS_ASSORTMENT_MAX_AGE_HOURS)||36));
const finiteOrNull=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
const positiveEnv=(name,fallback)=>{const n=Number(process.env[name]);return Number.isFinite(n)&&n>=0?n:fallback};

function replenishmentPolicy(hasPromotion=false){return{
 leadTimeDays:positiveEnv('STOREOPS_REPLENISHMENT_LEAD_TIME_DAYS',1),
 safetyDays:positiveEnv('STOREOPS_REPLENISHMENT_SAFETY_DAYS',1),
 packSize:Math.max(.001,positiveEnv('STOREOPS_REPLENISHMENT_PACK_SIZE',1)||1),
 minOrderQty:positiveEnv('STOREOPS_REPLENISHMENT_MIN_ORDER_QTY',0),
 promoFactor:hasPromotion?Math.max(.1,positiveEnv('STOREOPS_REPLENISHMENT_PROMO_FACTOR',1)||1):1,
 dayOfWeekFactor:Math.max(.1,positiveEnv('STOREOPS_REPLENISHMENT_DAY_FACTOR',1)||1)
}}

function primaryAction({availability,ctx,membership,replenishment}){
 if(ctx.openIncident)return{code:'CORRECT_PRICE',label:'Corriger le prix / promo',page:'commercial',tone:'danger'};
 if(availability.state==='STOCK_ANOMALY')return{code:'CHECK_STOCK',label:'Contrôler le stock',page:'inventory',tone:'danger'};
 if(availability.state==='RESIDUAL_STOCK_OUTSIDE_ASSORTMENT')return{code:'TREAT_RESIDUAL',label:'Traiter le stock hors assortiment',page:'inventory',tone:'warn'};
 if(membership.status==='UNKNOWN')return{code:'ASSORTMENT_UNKNOWN',label:'Référentiel assortiment à synchroniser',page:'managerMore',tone:'neutral'};
 if(membership.status==='NOT_ASSORTED')return{code:'NOT_ASSORTED',label:'Article hors assortiment',page:'managerMore',tone:'neutral'};
 if(replenishment?.decision==='REPLENISH')return{code:'REPLENISH',label:`Commander ${replenishment.actionQty}`,page:'inventory',tone:'brand'};
 if(replenishment?.decision==='PARTIAL')return{code:'REPLENISH_PARTIAL',label:`Commander ${replenishment.actionQty}`,page:'inventory',tone:'warn'};
 if(replenishment?.decision==='WAREHOUSE_OUT')return{code:'WAREHOUSE_OUT',label:'Signaler la rupture entrepôt',page:'incidents',tone:'danger'};
 if(replenishment?.decision==='NEED_SUPPLY_DATA')return{code:'SUPPLY_UNMAPPED',label:'Connecter le stock entrepôt',page:'managerMore',tone:'neutral'};
 if(replenishment?.decision==='NEED_STOCK_DATA')return{code:'STOCK_UNMAPPED',label:'Connecter le stock magasin',page:'managerMore',tone:'neutral'};
 if(availability.state==='OUT_OF_STOCK')return{code:'CHECK_OOS',label:'Contrôler la rupture',page:'inventory',tone:'warn'};
 if(ctx.promoLabel)return{code:'VERIFY_PROMO',label:'Vérifier la promo en rayon',page:'commercial',tone:'brand'};
 return{code:'PRICE_CHECK',label:'Contrôler prix & rayon',page:'commercial',tone:'brand'}
}

function secondaryActions(){return[
 {code:'PRICE_PROMO',label:'Prix & promo',page:'commercial'},
 {code:'INVENTORY',label:'Stock / inventaire',page:'inventory'},
 {code:'DLC',label:'DLC / DDM',page:'dlc'},
 {code:'LOSS',label:'Déclarer une perte',page:'losses'},
 {code:'INCIDENT',label:'Ouvrir un incident',page:'incidents'}
]}

function missingInputsForDecision(decision){const map={NEED_SALES_DATA:['sales.velocity'],NEED_SUPPLY_DATA:['stock.supply'],NEED_STOCK_DATA:['stock.store']};return map[decision]||[]}

export async function buildItemAssistant({storeId,ean,businessDate=null}){
 const ctx=await buildPriceCheckContext({storeId,ean,businessDate:businessDate||undefined}),p=ctx.product,age=maxAgeHours(),index=assortmentIndex(storeId,{businessDate:ctx.businessDate,maxAgeHours:age}),membership=assortmentMembership(storeId,p.productNumber,{index}),taxonomy=productTaxonomy(p.productNumber),available=finiteOrNull(p.availableStock),availability=classifyAvailability({storeId,productNumber:p.productNumber,availableQty:available,index});
 let supply={warehouseId:supplyWarehouseForStore(storeId),source:'UNMAPPED_D365',availableStock:null,physicalStock:null,mappingRequired:true};
 try{
  const s=await getSupplyStockByProductNumber(storeId,p.productNumber);supply={warehouseId:s.warehouseId,source:s.source,availableStock:s.availableOnHandQuantity,physicalStock:s.onHandQuantity,mappingRequired:!!s.mappingRequired,rowCount:s.rowCount??0,batches:s.batches||[]}
 }catch(error){supply={...supply,source:'ERROR',error:error.message}}
 let velocity={status:'UNAVAILABLE',dailySales7:null,dailySales28:null};
 try{velocity=await readStoreProductSalesVelocity(storeId,p.productNumber,{businessDate:ctx.businessDate,days:28})}catch(error){velocity={status:'ERROR',dailySales7:null,dailySales28:null,error:error.message}}
 const policy=replenishmentPolicy(!!ctx.promoLabel);
 const replenishmentResult=membership.status==='ASSORTED'?recommendReplenishment({storeAvailable:available,supplyAvailable:supply.availableStock,confirmedInbound:finiteOrNull(p.onOrderStock)??0,dailySales7:velocity.status==='READY'?velocity.dailySales7:null,dailySales28:velocity.status==='READY'?velocity.dailySales28:null,...policy}):null;
 const replenishment=replenishmentResult?{...replenishmentResult,presentation:decisionPresentation(replenishmentResult),ready:!['NEED_SALES_DATA','NEED_SUPPLY_DATA','NEED_STOCK_DATA'].includes(replenishmentResult.decision),missingInputs:missingInputsForDecision(replenishmentResult.decision),salesVelocity:velocity,policy}:{ready:false,decision:'NOT_APPLICABLE',missingInputs:[],salesVelocity:velocity,policy};
 const primary=primaryAction({availability,ctx,membership,replenishment});
 return{
  storeId,businessDate:ctx.businessDate,ean:ctx.ean,
  item:{productNumber:p.productNumber,name:p.name,category:p.category,unit:p.unit},
  pricing:{basePrice:ctx.basePrice?.price??null,expectedUnitPrice:ctx.expectedUnitPrice,promoLabel:ctx.promoLabel,promotionError:ctx.promotionError||null,priceGroup:ctx.priceGroup,openIncident:ctx.openIncident||null},
  storeStock:{warehouseId:p.warehouseId??null,physicalStock:finiteOrNull(p.stock),availableStock:available,reservedStock:finiteOrNull(p.reservedStock),incomingStock:finiteOrNull(p.onOrderStock),totalAvailableStock:finiteOrNull(p.totalAvailableStock),source:p.stockSource??null,mappingRequired:!!p.stockMappingRequired,batches:p.batches||[]},
  supplyStock:supply,
  merchandising:{assortment:membership,assortmentState:index.status,assortmentSyncedAt:index.syncedAt||null,assortmentMaxAgeHours:age,taxonomy},
  availability,
  replenishment,
  primaryAction:primary,
  actions:secondaryActions(),
  integrationHealth:{pricing:ctx.integrationErrors?'DEGRADED':'LIVE_OR_AVAILABLE',stock:p.stockMappingRequired?'UNMAPPED':p.stockSource||'UNKNOWN',assortment:index.status,supply:supply.mappingRequired?'UNMAPPED':supply.source,sales:velocity.status}
 }
}

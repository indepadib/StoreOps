import { buildPriceCheckContext } from './price-check.mjs';
import { assortmentIndex,assortmentMembership,productTaxonomy,classifyAvailability } from './assortment.mjs';
import { getSupplyStockByProductNumber,supplyWarehouseForStore } from './dynamics-stock.mjs';
import { recommendReplenishment,decisionPresentation } from './replenishment-engine.mjs';

const maxAgeHours=()=>Math.max(1,Math.min(24*30,Number(process.env.STOREOPS_ASSORTMENT_MAX_AGE_HOURS)||36));
const finiteOrNull=v=>{const n=Number(v);return Number.isFinite(n)?n:null};

function primaryAction({availability,ctx,membership,replenishment}){
 if(ctx.openIncident)return{code:'CORRECT_PRICE',label:'Corriger le prix / promo',page:'commercial',tone:'danger'};
 if(availability.state==='STOCK_ANOMALY')return{code:'CHECK_STOCK',label:'Contrôler le stock',page:'inventory',tone:'danger'};
 if(availability.state==='RESIDUAL_STOCK_OUTSIDE_ASSORTMENT')return{code:'TREAT_RESIDUAL',label:'Traiter le stock hors assortiment',page:'inventory',tone:'warn'};
 if(membership.status==='UNKNOWN')return{code:'ASSORTMENT_UNKNOWN',label:'Référentiel assortiment à synchroniser',page:'managerMore',tone:'neutral'};
 if(membership.status==='NOT_ASSORTED')return{code:'NOT_ASSORTED',label:'Article hors assortiment',page:'managerMore',tone:'neutral'};
 if(replenishment?.decision==='REPLENISH')return{code:'REPLENISH',label:`Commander ${replenishment.actionQty}`,page:'inventory',tone:'brand'};
 if(replenishment?.decision==='PARTIAL')return{code:'REPLENISH_PARTIAL',label:`Commander ${replenishment.actionQty}`,page:'inventory',tone:'warn'};
 if(replenishment?.decision==='WAREHOUSE_OUT')return{code:'WAREHOUSE_OUT',label:'Signaler la rupture entrepôt',page:'incidents',tone:'danger'};
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

export async function buildItemAssistant({storeId,ean,businessDate=null}){
 const ctx=await buildPriceCheckContext({storeId,ean,businessDate:businessDate||undefined}),p=ctx.product,age=maxAgeHours(),index=assortmentIndex(storeId,{businessDate:ctx.businessDate,maxAgeHours:age}),membership=assortmentMembership(storeId,p.productNumber,{index}),taxonomy=productTaxonomy(p.productNumber),available=finiteOrNull(p.availableStock),availability=classifyAvailability({storeId,productNumber:p.productNumber,availableQty:available,index});
 let supply={warehouseId:supplyWarehouseForStore(storeId),source:'UNMAPPED_D365',availableStock:null,physicalStock:null,mappingRequired:true};
 try{
  const s=await getSupplyStockByProductNumber(storeId,p.productNumber);supply={warehouseId:s.warehouseId,source:s.source,availableStock:s.availableOnHandQuantity,physicalStock:s.onHandQuantity,mappingRequired:!!s.mappingRequired,rowCount:s.rowCount??0}
 }catch(error){supply={...supply,source:'ERROR',error:error.message}}
 const replenishmentResult=membership.status==='ASSORTED'?recommendReplenishment({storeAvailable:available??0,supplyAvailable:supply.availableStock??0,confirmedInbound:finiteOrNull(p.onOrderStock)??0,dailySales7:null,dailySales28:null,leadTimeDays:1,safetyDays:1,packSize:1,minOrderQty:0}):null;
 const replenishment=replenishmentResult?{...replenishmentResult,presentation:decisionPresentation(replenishmentResult),ready:replenishmentResult.decision!=='NEED_SALES_DATA',missingInputs:replenishmentResult.decision==='NEED_SALES_DATA'?['sales.velocity']:[]}:{ready:false,decision:'NOT_APPLICABLE',missingInputs:[]};
 const primary=primaryAction({availability,ctx,membership,replenishment});
 return{
  storeId,businessDate:ctx.businessDate,ean:ctx.ean,
  item:{productNumber:p.productNumber,name:p.name,category:p.category,unit:p.unit},
  pricing:{basePrice:ctx.basePrice?.price??null,expectedUnitPrice:ctx.expectedUnitPrice,promoLabel:ctx.promoLabel,promotionError:ctx.promotionError||null,priceGroup:ctx.priceGroup,openIncident:ctx.openIncident||null},
  storeStock:{warehouseId:p.warehouseId??null,physicalStock:finiteOrNull(p.stock),availableStock:available,reservedStock:finiteOrNull(p.reservedStock),incomingStock:finiteOrNull(p.onOrderStock),totalAvailableStock:finiteOrNull(p.totalAvailableStock),source:p.stockSource??null,mappingRequired:!!p.stockMappingRequired},
  supplyStock:supply,
  merchandising:{assortment:membership,assortmentState:index.status,assortmentSyncedAt:index.syncedAt||null,assortmentMaxAgeHours:age,taxonomy},
  availability,
  replenishment,
  primaryAction:primary,
  actions:secondaryActions(),
  integrationHealth:{pricing:ctx.integrationErrors?'DEGRADED':'LIVE_OR_AVAILABLE',stock:p.stockMappingRequired?'UNMAPPED':p.stockSource||'UNKNOWN',assortment:index.status,supply:supply.mappingRequired?'UNMAPPED':supply.source,sales:'UNMAPPED'}
 }
}

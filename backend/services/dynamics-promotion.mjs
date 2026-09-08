import { config } from '../config.mjs';
import { odataGet } from './dynamics.mjs';
import { odataGetAllBySkip } from './dynamics-query.mjs';
import { getSalesPriceAgreementsByItem } from './dynamics-price.mjs';

export const RETAIL_DISCOUNT_ENTITY='RetailDiscounts';
export const RETAIL_DISCOUNT_LINE_ENTITY='RetailDiscountLines';
export const RETAIL_DISCOUNT_PRICE_GROUP_ENTITY='RetailDiscountPriceGroups';
export const MIX_MATCH_LINE_GROUP_ENTITY='MixAndMatchLineGroups';

const clean=v=>String(v??'').trim();
function escapeOData(v){return String(v).replaceAll("'","''")}
function dateOnly(v){if(!v)return null;const s=String(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function isOpenBoundary(v){const d=dateOnly(v);return !d||d==='1900-01-01'||d==='1900-01-02'}
function orFilter(field,values){return values.length?`(${values.map(v=>`${field} eq '${escapeOData(v)}'`).join(' or ')})`:''}
function promotionStatus(header,businessDate){
  if(!header)return'UNKNOWN';
  if(header.Status!=='Enabled'||header.ProcessingStatus!=='Processed')return'INACTIVE';
  const day=dateOnly(businessDate)||new Date().toISOString().slice(0,10),from=dateOnly(header.ValidFrom),to=dateOnly(header.ValidTo);
  if(!isOpenBoundary(from)&&day<from)return'UPCOMING';
  if(!isOpenBoundary(to)&&day>to)return'EXPIRED';
  return'ACTIVE';
}
function mechanicFor(header,line,mixGroup){
  const requiredQuantity=Number(line?.MixAndMatchNumberOfItemsNeeded||mixGroup?.NumberOfItemsNeeded||0)||null;
  if(header?.PeriodicDiscountType==='MixAndMatch'){
    if(header.MixAndMatchDiscountType==='LeastExpensive')return{type:'MIX_AND_MATCH',mechanic:'LEAST_EXPENSIVE',requiredQuantity,discountedLineCount:Number(header.MixAndMatchNoOfLeastExpensiveLines||0)||null,discountPercent:Number(header.DiscountPercentValue||0)||null,dealPrice:null};
    if(header.MixAndMatchDiscountType==='DealPrice')return{type:'MIX_AND_MATCH',mechanic:'DEAL_PRICE',requiredQuantity,discountedLineCount:null,discountPercent:null,dealPrice:Number(header.MixAndMatchDealPrice||0)||null};
    return{type:'MIX_AND_MATCH',mechanic:String(header.MixAndMatchDiscountType||'OTHER').toUpperCase(),requiredQuantity,discountedLineCount:null,discountPercent:null,dealPrice:null};
  }
  if(line?.OfferDiscountMethod==='PercentOff')return{type:'DISCOUNT',mechanic:'PERCENT_OFF',requiredQuantity:null,discountPercent:Number(line.OfferDiscountPercentage||0)||Number(header?.DiscountPercentValue||0)||null,discountAmount:null,dealPrice:null};
  if(Number(line?.OfferDiscountAmount||0))return{type:'DISCOUNT',mechanic:'AMOUNT_OFF',requiredQuantity:null,discountPercent:null,discountAmount:Number(line.OfferDiscountAmount),dealPrice:null};
  if(Number(line?.OfferPrice||0))return{type:'DISCOUNT',mechanic:'FIXED_PRICE',requiredQuantity:null,discountPercent:null,discountAmount:null,dealPrice:Number(line.OfferPrice)};
  return{type:'DISCOUNT',mechanic:String(line?.OfferDiscountMethod||header?.PeriodicDiscountType||'OTHER').toUpperCase(),requiredQuantity:null,discountPercent:null,discountAmount:null,dealPrice:null};
}
export function computeSimpleEffectivePrice(basePrice,mechanic){
  const base=basePrice==null||basePrice===''?null:Number(basePrice);
  if(!Number.isFinite(base)||base<=0)return null;
  if(mechanic.mechanic==='PERCENT_OFF'&&Number.isFinite(Number(mechanic.discountPercent)))return Number((base*(1-Number(mechanic.discountPercent)/100)).toFixed(2));
  if(mechanic.mechanic==='AMOUNT_OFF'&&Number.isFinite(Number(mechanic.discountAmount)))return Number(Math.max(0,base-Number(mechanic.discountAmount)).toFixed(2));
  if(mechanic.mechanic==='FIXED_PRICE'&&Number.isFinite(Number(mechanic.dealPrice)))return Number(mechanic.dealPrice);
  return null;
}
export function chooseEffectiveUnitPrice(basePrice,simpleEffectivePrices=[]){
  const candidates=[];
  if(basePrice!==null&&basePrice!==undefined&&basePrice!==''){const b=Number(basePrice);if(Number.isFinite(b)&&b>=0)candidates.push(b)}
  for(const value of simpleEffectivePrices||[]){const n=Number(value);if(Number.isFinite(n)&&n>=0)candidates.push(n)}
  return candidates.length?Math.min(...candidates):null;
}
export function resolvePriceGroup(priceGroup=null){return String(priceGroup||config.dynamics.defaultPriceGroup||'Franprix').trim()||'Franprix'}
function promotionLive(){return config.dynamics.mode==='live'&&config.dynamics.read?.promotion==='live'}
function entity(key,fallback){return config.dynamics.entities?.[key]||fallback}
function safeError(error){
  if(!error)return null;
  return {code:clean(error.code)||'D365_PROMOTION_READ_FAILED',status:Number(error.status)||502,message:clean(error.message)||'Lecture promotion Dynamics indisponible.'};
}

async function queryPromotionLines(item){
  const company=config.dynamics.dataAreaId;
  const itemField=clean(process.env.D365_PROMOTION_ITEM_FIELD)||'ItemId';
  const filters=[`${itemField} eq '${escapeOData(item)}'`];
  if(company)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(company)}'`);
  const payload=await odataGetAllBySkip(entity('retailDiscountLine',RETAIL_DISCOUNT_LINE_ENTITY),{
    filter:filters.join(' and '),
    extra:company?'cross-company=true':'',
    pageSize:100,
    maxRows:500
  });
  return {payload,itemField};
}

export async function getRetailPromotionsByItem(productNumber,{businessDate=null,priceGroup=null}={}){
  const item=clean(productNumber);
  if(!item)throw Object.assign(new Error('ItemNumber requis.'),{status:400,code:'D365_PROMOTION_ITEM_REQUIRED'});
  const day=dateOnly(businessDate)||new Date().toISOString().slice(0,10),resolvedPriceGroup=resolvePriceGroup(priceGroup);
  if(!promotionLive())return{mode:'SIMULATED',productNumber:item,businessDate:day,priceGroup:resolvedPriceGroup,promotions:[],rowCount:0,coverage:{directItem:true,category:false}};

  const {payload:linePayload,itemField}=await queryPromotionLines(item);
  const lines=Array.isArray(linePayload?.value)?linePayload.value:[];
  const offerIds=[...new Set(lines.map(x=>x.OfferId).filter(Boolean))];
  if(!offerIds.length)return{mode:'LIVE',productNumber:item,businessDate:day,priceGroup:resolvedPriceGroup,promotions:[],rowCount:0,coverage:{directItem:true,category:false},scan:{rowsScanned:lines.length,pages:linePayload.pages||1,truncated:!!linePayload.truncated,filteredByItem:true,itemField}};

  const offerFilter=orFilter('OfferId',offerIds);
  const companyFilter=config.dynamics.dataAreaId?`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`:'';
  const withCompany=f=>[f,companyFilter].filter(Boolean).join(' and ');
  const common={top:500,extra:config.dynamics.dataAreaId?'cross-company=true':''};

  const [headersResult,groupsResult]=await Promise.allSettled([
    odataGet(entity('retailDiscount',RETAIL_DISCOUNT_ENTITY),{filter:withCompany(offerFilter),...common}),
    odataGet(entity('retailDiscountPriceGroup',RETAIL_DISCOUNT_PRICE_GROUP_ENTITY),{filter:withCompany(offerFilter),...common})
  ]);
  if(headersResult.status==='rejected')throw Object.assign(new Error(`Lecture ${entity('retailDiscount',RETAIL_DISCOUNT_ENTITY)} impossible: ${headersResult.reason?.message||'erreur D365'}`),{status:headersResult.reason?.status||502,code:'D365_PROMOTION_HEADER_READ_FAILED'});

  const headers=Array.isArray(headersResult.value?.value)?headersResult.value.value:[];
  const groups=groupsResult.status==='fulfilled'&&Array.isArray(groupsResult.value?.value)?groupsResult.value.value:[];
  const groupError=groupsResult.status==='rejected'?safeError(groupsResult.reason):null;
  const needsMix=headers.some(x=>x?.PeriodicDiscountType==='MixAndMatch')||lines.some(x=>x?.MixAndMatchLineGroup||Number(x?.MixAndMatchNumberOfItemsNeeded||0)>0);
  let mixGroups=[],mixError=null;
  if(needsMix){
    try{
      const mixPayload=await odataGet(entity('mixMatchLineGroup',MIX_MATCH_LINE_GROUP_ENTITY),{filter:withCompany(orFilter('MixAndMatchOfferId',offerIds)),...common});
      mixGroups=Array.isArray(mixPayload?.value)?mixPayload.value:[];
    }catch(error){mixError=safeError(error)}
  }

  const headerById=new Map(headers.map(x=>[x.OfferId,x]));
  const promotions=offerIds.map(offerId=>{
    const header=headerById.get(offerId)||null,offerLines=lines.filter(x=>x.OfferId===offerId),line=offerLines[0]||null;
    const priceGroups=groups.filter(x=>x.OfferId===offerId).map(x=>x.PriceGroupId).filter(Boolean);
    const mixGroup=mixGroups.find(x=>x.MixAndMatchOfferId===offerId&&(!line?.MixAndMatchLineGroup||x.MixAndMatchLineGroup===line.MixAndMatchLineGroup))||null;
    const mechanic=mechanicFor(header,line,mixGroup),status=promotionStatus(header,day);
    const priceGroupEligible=groupError?null:(!resolvedPriceGroup||priceGroups.length===0||priceGroups.includes(resolvedPriceGroup));
    return{offerId,name:header?.Name||line?.Name||offerId,periodicDiscountType:header?.PeriodicDiscountType||null,status,enabled:header?.Status==='Enabled',processingStatus:header?.ProcessingStatus||null,validFrom:header?.ValidFrom||null,validTo:header?.ValidTo||null,currencyCode:header?.CurrencyCode||null,concurrencyMode:header?.ConcurrencyMode||null,pricingPriorityNumber:header?.PricingPriorityNumber??null,priceGroups,priceGroupEligible,itemLine:{lineNum:line?.LineNum??null,itemId:line?.ItemId||item,name:line?.Name||null,unit:line?.UnitOfMeasureSymbol||null,lineType:line?.LineType||null,mixAndMatchLineGroup:line?.MixAndMatchLineGroup||null},mechanic,activeForRequestedContext:status==='ACTIVE'&&priceGroupEligible===true,rawLineCount:offerLines.length};
  });
  return{mode:'LIVE',productNumber:item,businessDate:day,priceGroup:resolvedPriceGroup,promotions,rowCount:promotions.length,coverage:{directItem:true,category:false},scan:{rowsScanned:lines.length,pages:linePayload.pages||1,truncated:!!linePayload.truncated,filteredByItem:true,itemField},warnings:{priceGroup:groupError,mixAndMatch:mixError}};
}

export async function getProductPricing(productNumber,{businessDate=null,priceGroup=null}={}){
  const item=clean(productNumber);
  if(!item)throw Object.assign(new Error('ItemNumber requis.'),{status:400,code:'D365_PRODUCT_PRICE_ITEM_REQUIRED'});
  const resolvedPriceGroup=resolvePriceGroup(priceGroup);
  const [priceResult,promoResult]=await Promise.allSettled([
    getSalesPriceAgreementsByItem(item),
    getRetailPromotionsByItem(item,{businessDate,priceGroup:resolvedPriceGroup})
  ]);

  const priceError=priceResult.status==='rejected'?safeError(priceResult.reason):null;
  const promotionError=promoResult.status==='rejected'?safeError(promoResult.reason):null;
  const priceDiagnostics=priceResult.status==='fulfilled'?priceResult.value:{mode:'ERROR',basePrice:null,rowCount:0,rows:[]};
  const promoDiagnostics=promoResult.status==='fulfilled'?promoResult.value:{mode:'ERROR',productNumber:item,businessDate:dateOnly(businessDate)||new Date().toISOString().slice(0,10),priceGroup:resolvedPriceGroup,promotions:[],rowCount:0,coverage:{directItem:true,category:false},error:promotionError};

  const baseRow=priceDiagnostics.basePrice?.row||null,basePrice=baseRow?Number(baseRow.SalesPrice):null;
  const activePromotions=(promoDiagnostics.promotions||[]).filter(x=>x.activeForRequestedContext),simplePromotions=activePromotions.filter(x=>x.mechanic.type==='DISCOUNT'),conditionalPromotions=activePromotions.filter(x=>x.mechanic.type==='MIX_AND_MATCH');
  const simpleEffectivePrices=simplePromotions.map(x=>computeSimpleEffectivePrice(basePrice,x.mechanic)).filter(Number.isFinite),effectiveUnitPrice=chooseEffectiveUnitPrice(basePrice,simpleEffectivePrices);
  const priceMode=priceDiagnostics.mode||'SIMULATED',promotionMode=promoDiagnostics.mode||'SIMULATED';
  const fullyLive=priceMode==='LIVE'&&promotionMode==='LIVE';
  const partlyLive=priceMode==='LIVE'||promotionMode==='LIVE';
  return{
    mode:fullyLive?'LIVE':partlyLive?'PARTIAL':priceMode==='ERROR'||promotionMode==='ERROR'?'DEGRADED':'SIMULATED',
    sources:{price:priceMode,promotion:promotionMode},
    errors:{price:priceError,promotion:promotionError},
    productNumber:item,
    businessDate:promoDiagnostics.businessDate||dateOnly(businessDate)||new Date().toISOString().slice(0,10),
    priceGroup:resolvedPriceGroup,
    basePrice:baseRow?{price:basePrice,unit:baseRow.SalesUnitSymbol||null,priceQuantity:baseRow.SalesPriceQuantity??null,priceDate:baseRow.SalesPriceDate||null,source:baseRow.BaseSalesPriceSource||null}:null,
    tradeAgreements:{rowCount:priceDiagnostics.rowCount||0,rows:priceDiagnostics.rows||[]},
    promotions:{rowCount:promoDiagnostics.rowCount||0,activeCount:activePromotions.length,items:promoDiagnostics.promotions||[],coverage:promoDiagnostics.coverage||{directItem:true,category:false},scan:promoDiagnostics.scan||null,warnings:promoDiagnostics.warnings||null,error:promotionError},
    effectiveUnitPrice,
    conditionalPromotions,
    pricingNote:promotionError?'Article et prix disponibles ; lecture promotion Dynamics indisponible pour ce scan.':conditionalPromotions.length?'Le prix unitaire n’est pas artificiellement recalculé pour les offres Mix & Match. La mécanique du lot reste séparée.':null
  };
}

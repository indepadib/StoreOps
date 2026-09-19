import { config } from '../config.mjs';
import { odataGet,odataGetAll,resolveStorePriceGroups } from './dynamics.mjs';
import { effectiveD365PriceHistoryMapping } from './d365-price-history-mapping.mjs';

export const SALES_PRICE_ENTITY='SalesPriceAgreements';
export const BASE_PRICE_ENTITY='ReleasedProductsV2';

function escapeOData(v){return String(v).replaceAll("'","''")}
function priceLive(){return config.dynamics.mode==='live'&&config.dynamics.read?.price==='live'}
function salesPriceEntity(){return config.dynamics.entities?.salesPrice||SALES_PRICE_ENTITY}
function basePriceEntity(){return config.dynamics.entities?.basePrice||BASE_PRICE_ENTITY}

const AGREEMENT_SELECT_FIELDS=[
  'RecordId','dataAreaId','ItemNumber','ProductNumber','Price','PriceCurrencyCode',
  'SalesPriceQuantity','QuantityUnitySymbol','PriceApplicableFromDate','PriceApplicableToDate',
  'PriceCustomerGroupCode','CustomerAccountNumber','PriceWarehouseId','PriceSiteId',
  'FromQuantity','ToQuantity','WillSearchContinue'
];

const BASE_PRICE_SELECT_FIELDS=[
  'dataAreaId','ItemNumber','ProductNumber','SalesPrice','SalesUnitSymbol','SalesPriceQuantity',
  'SalesPriceDate','SellStartDate','SellEndDate','BaseSalesPriceSource','SalesSalesTaxItemGroupCode',
  'SalesLineDiscountProductGroupCode','SalesMultilineDiscountProductGroupCode',
  'IsRetailDiscountPOSRegistrationProhibited','IsDiscountPOSRegistrationProhibited',
  'IsManualDiscountPOSRegistrationProhibited','IsPOSRegistrationBlocked','ProductLifecycleStateId'
];

export async function getBaseSalesPriceByItem(productNumber){
  const item=String(productNumber||'').trim(),entity=basePriceEntity();
  if(!item)throw Object.assign(new Error('ItemNumber requis.'),{status:400,code:'D365_BASE_PRICE_ITEM_REQUIRED'});

  if(!priceLive()){
    return {mode:'SIMULATED',entity,productNumber:item,rowCount:0,row:null};
  }

  const filters=[`ItemNumber eq '${escapeOData(item)}'`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  const payload=await odataGet(entity,{
    filter:filters.join(' and '),
    select:BASE_PRICE_SELECT_FIELDS.join(','),
    top:1,
    extra:config.dynamics.dataAreaId?'cross-company=true':''
  });
  const row=Array.isArray(payload?.value)?payload.value[0]||null:null;
  return {
    mode:'LIVE',
    entity,
    productNumber:item,
    dataAreaId:config.dynamics.dataAreaId||row?.dataAreaId||null,
    rowCount:row?1:0,
    row
  };
}

function canonicalHistoryRow(row,fields){
  return{
    RecordId:fields.recordId?row?.[fields.recordId]:null,
    dataAreaId:row?.[config.dynamics.dataAreaField]??row?.dataAreaId??null,
    ItemNumber:row?.[fields.item]??null,
    ProductNumber:row?.[fields.item]??null,
    Price:row?.[fields.price]??null,
    PriceCurrencyCode:fields.currency?row?.[fields.currency]:null,
    SalesPriceQuantity:fields.quantity?row?.[fields.quantity]:null,
    QuantityUnitySymbol:fields.unit?row?.[fields.unit]:null,
    PriceApplicableFromDate:row?.[fields.validFrom]??null,
    PriceApplicableToDate:fields.validTo?row?.[fields.validTo]:null,
    PriceCustomerGroupCode:fields.priceGroup?row?.[fields.priceGroup]:null,
    CustomerAccountNumber:fields.customer?row?.[fields.customer]:null,
    PriceWarehouseId:fields.warehouse?row?.[fields.warehouse]:null,
    PriceSiteId:fields.site?row?.[fields.site]:null
  }
}

export async function getSalesPriceAgreementsByItem(productNumber){
  const item=String(productNumber||'').trim(),historyMapping=effectiveD365PriceHistoryMapping(),entity=historyMapping?.entity||salesPriceEntity();
  if(!item)throw Object.assign(new Error('ItemNumber requis.'),{status:400,code:'D365_PRICE_ITEM_REQUIRED'});

  const basePrice=await getBaseSalesPriceByItem(item);
  if(!priceLive()){
    return {mode:'SIMULATED',entity,productNumber:item,rowCount:0,rows:[],basePrice,mappingSource:historyMapping?'STOREOPS_VALIDATED_MAPPING':'ENV_CONFIG'};
  }

  if(historyMapping){
    const fields=historyMapping.fields,itemField=fields.item;
    const filters=[`${itemField} eq '${escapeOData(item)}'`];
    if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
    const select=[...new Set([itemField,fields.price,fields.validFrom,fields.validTo,fields.currency,fields.priceGroup,fields.customer,fields.warehouse,fields.site,fields.quantity,fields.unit,fields.recordId,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean))].join(',');
    const payload=await odataGet(entity,{filter:filters.join(' and '),select,top:100,extra:config.dynamics.dataAreaId?'cross-company=true':''});
    const rawRows=Array.isArray(payload?.value)?payload.value:[];
    const rows=rawRows.map(row=>canonicalHistoryRow(row,fields));
    return{mode:'LIVE',entity,productNumber:item,dataAreaId:config.dynamics.dataAreaId||rows[0]?.dataAreaId||basePrice.dataAreaId||null,rowCount:rows.length,rows,basePrice,mappingSource:'STOREOPS_VALIDATED_MAPPING'}
  }

  const filters=[`ItemNumber eq '${escapeOData(item)}'`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  const payload=await odataGet(entity,{
    filter:filters.join(' and '),
    select:AGREEMENT_SELECT_FIELDS.join(','),
    top:100,
    extra:config.dynamics.dataAreaId?'cross-company=true':''
  });
  const rows=Array.isArray(payload?.value)?payload.value:[];
  return {
    mode:'LIVE',
    entity,
    productNumber:item,
    dataAreaId:config.dynamics.dataAreaId||rows[0]?.dataAreaId||basePrice.dataAreaId||null,
    rowCount:rows.length,
    rows,
    basePrice,
    mappingSource:'ENV_CONFIG'
  };
}


function clean(v){return String(v??'').trim()}
function dateOnly(v){const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function stableFingerprint(parts=[]){return parts.map(v=>String(v??'')).join('|')}
function previousDays(day,count=2){const out=[];const d=new Date(`${day}T12:00:00Z`);for(let i=0;i<=count;i++){const x=new Date(d);x.setUTCDate(x.getUTCDate()-i);out.push(x.toISOString().slice(0,10))}return out}
function orFilter(field,values=[]){const rows=[...new Set((values||[]).map(clean).filter(Boolean))];return rows.length?`(${rows.map(v=>`${field} eq '${escapeOData(v)}'`).join(' or ')})`:''}
async function dateScopedRows(entity,{dateField,day,filterParts=[],select='',pageSize=200,maxRows=4000}={}){
  const extra=config.dynamics.dataAreaId?'cross-company=true':'';
  const dateFilters=[`${dateField} eq ${day}`,`${dateField} eq '${escapeOData(day)}'`];
  let lastError=null;
  for(const dateFilter of dateFilters){
    try{
      const filter=[...filterParts,dateFilter].filter(Boolean).join(' and ');
      return await odataGetAll(entity,{filter,select,extra,pageSize,maxRows})
    }catch(error){lastError=error}
  }
  throw lastError||new Error(`Lecture datée ${entity} impossible.`)
}

export async function getCommercialPriceChanges(storeId,businessDate){
  const day=dateOnly(businessDate)||new Date().toISOString().slice(0,10);
  if(!priceLive())return{changes:[],diagnostics:{mode:'SIMULATED',sources:[]}};

  const companyFilter=config.dynamics.dataAreaId?`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`:'';
  const priceGroupContext=await resolveStorePriceGroups(storeId).catch(()=>null);
  const priceGroups=[...new Set([...(priceGroupContext?.groups||[]),config.dynamics.storePriceGroups?.[storeId],config.dynamics.defaultPriceGroup||'Franprix'].map(clean).filter(Boolean))];
  const sources=[],byItem=new Map(),scanDays=previousDays(day,2),historyMapping=effectiveD365PriceHistoryMapping();

  try{
    const entity=historyMapping?.entity||salesPriceEntity(),fields=historyMapping?.fields||null;
    let totalRows=0,totalPages=0,truncated=false;
    for(const scanDay of scanDays){
      const dateField=fields?.validFrom||'PriceApplicableFromDate',groupField=fields?.priceGroup||'PriceCustomerGroupCode';
      const filterParts=[companyFilter,groupField&&priceGroups.length?orFilter(groupField,priceGroups):''].filter(Boolean);
      const select=fields?[...new Set([fields.item,fields.price,fields.validFrom,fields.validTo,fields.currency,fields.priceGroup,fields.customer,fields.warehouse,fields.site,fields.quantity,fields.unit,fields.recordId,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean))].join(','):AGREEMENT_SELECT_FIELDS.join(',');
      const payload=await dateScopedRows(entity,{dateField,day:scanDay,filterParts,select,pageSize:250,maxRows:6000});
      totalRows+=Number(payload.rowCount||0);totalPages+=Number(payload.pages||0);truncated=truncated||!!payload.truncated;
      if(payload.truncated)throw Object.assign(new Error(`Les accords tarifaires autour du ${day} dépassent la limite StoreOps.`),{status:503,code:'D365_COMMERCIAL_PRICE_AGREEMENTS_TRUNCATED'});
      const normalized=fields?(payload.value||[]).map(row=>canonicalHistoryRow(row,fields)):(payload.value||[]);
      for(const r of normalized){
        const item=clean(r.ItemNumber||r.ProductNumber),rowDay=dateOnly(r.PriceApplicableFromDate),rowGroup=clean(r.PriceCustomerGroupCode),price=Number(r.Price);
        if(!item||!scanDays.includes(rowDay)||!Number.isFinite(price)||price<0)continue;
        if(rowGroup&&priceGroups.length&&!priceGroups.includes(rowGroup))continue;
        const record=clean(r.RecordId)||`${item}:${rowGroup||'ALL'}:${rowDay}`;
        const existing=byItem.get(item);
        if(existing&&dateOnly(existing.effectiveFrom)>rowDay)continue;
        byItem.set(item,{
          sourceKey:`D365-PRICE-AGREEMENT-${record}-${rowDay}`,
          stableKey:`D365-PRICE-AGREEMENT:${record}`,
          fingerprint:stableFingerprint(['AGREEMENT',record,item,price,rowGroup,r.PriceCurrencyCode,r.PriceApplicableFromDate,r.PriceApplicableToDate,r.PriceWarehouseId,r.PriceSiteId]),
          actionType:'VERIFY',deltaActionType:'PRICE_CHANGE',deltaOnFirstSeen:true,deltaSignageAction:'VERIFY',
          ean:`ITEM:${item}`,productNumber:item,productName:item,category:null,
          oldPrice:null,expectedPrice:price,promoLabel:`Accord tarifaire ${rowGroup||priceGroups[0]||'Retail'} · ${price.toFixed(2)} DH${rowDay===day?'':` · détecté en rattrapage (${rowDay})`}`,
          signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,storeId,priceGroup:rowGroup||priceGroups[0]||null,priceGroups,
          source:'D365_RETAIL_PRICING',effectiveFrom:r.PriceApplicableFromDate||rowDay,effectiveTo:r.PriceApplicableToDate||null,priceSource:'SALES_PRICE_AGREEMENT'
        })
      }
    }
    sources.push({source:'SALES_PRICE_AGREEMENTS',status:'READY',entity,mappingSource:historyMapping?'STOREOPS_VALIDATED_MAPPING':'ENV_CONFIG',priceGroups,rowCount:totalRows,pages:totalPages,truncated,changes:[...byItem.values()].filter(x=>x.priceSource==='SALES_PRICE_AGREEMENT').length})
  }catch(error){sources.push({source:'SALES_PRICE_AGREEMENTS',status:'ERROR',code:error.code||'D365_PRICE_AGREEMENTS_DELTA_FAILED',message:error.message})}

  try{
    const entity=basePriceEntity(),payload=await dateScopedRows(entity,{
      dateField:'SalesPriceDate',day,filterParts:[companyFilter],
      select:BASE_PRICE_SELECT_FIELDS.join(','),pageSize:200,maxRows:4000
    });
    if(payload.truncated)throw Object.assign(new Error(`Les changements de prix de base du ${day} dépassent la limite StoreOps.`),{status:503,code:'D365_COMMERCIAL_BASE_PRICES_TRUNCATED'});
    let inserted=0;
    for(const r of payload.value||[]){
      const item=clean(r.ItemNumber||r.ProductNumber),rowDay=dateOnly(r.SalesPriceDate),price=Number(r.SalesPrice);
      if(!item||rowDay!==day||!Number.isFinite(price)||price<0||byItem.has(item))continue;
      byItem.set(item,{
        sourceKey:`D365-PRICE-BASE-${item}-${day}`,stableKey:`D365-PRICE-BASE:${item}`,
        fingerprint:stableFingerprint(['BASE',item,price,r.SalesUnitSymbol,r.SalesPriceQuantity,r.SalesPriceDate,r.SellStartDate,r.SellEndDate]),
        actionType:'PRICE_CHANGE',ean:`ITEM:${item}`,productNumber:item,productName:item,category:null,
        oldPrice:null,expectedPrice:price,promoLabel:`Nouveau prix de base ${price.toFixed(2)} DH`,
        signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,storeId,priceGroup:priceGroups[0]||null,priceGroups,source:'D365_RETAIL_PRICING',
        effectiveFrom:r.SalesPriceDate||day,effectiveTo:r.SellEndDate||null,priceSource:'BASE_PRICE'
      });inserted+=1
    }
    sources.push({source:'BASE_PRICE',status:'READY',entity,rowCount:payload.rowCount,changes:inserted})
  }catch(error){sources.push({source:'BASE_PRICE',status:'ERROR',code:error.code||'D365_BASE_PRICE_DELTA_FAILED',message:error.message})}

  const changes=[...byItem.values()];
  if(!changes.length&&sources.length&&sources.every(x=>x.status==='ERROR')){
    throw Object.assign(new Error('Dynamics n’a pas permis de lire les changements de prix du jour.'),{status:502,code:'D365_COMMERCIAL_PRICE_DELTA_FAILED',details:{sources}})
  }
  return{changes,diagnostics:{mode:'LIVE',day,scanDays,priceGroups,priceGroupContext,sources}}
}

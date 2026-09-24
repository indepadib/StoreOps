import { config } from '../config.mjs';
import { odataGet,odataGetAll,resolveStorePriceGroups } from './dynamics.mjs';
import { effectiveD365PriceHistoryMapping } from './d365-price-history-mapping.mjs';
import { storeOperationalSettings } from './store-settings.mjs';

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

function openBoundary(v){const d=dateOnly(v);return !d||d==='1900-01-01'||d==='1900-01-02'}
function normalizeUnit(v){return clean(v).toUpperCase().replace(/\s+/g,'')}
function positiveOr(v,fallback=1){const n=Number(v);return Number.isFinite(n)&&n>0?n:fallback}
export function resolveApplicableTradeAgreements({rows=[],businessDate=null,priceGroups=[],warehouseId=null,quantity=1,baseUnit=null,basePriceQuantity=1}={}){
 const day=dateOnly(businessDate)||new Date().toISOString().slice(0,10),groups=[...new Set((priceGroups||[]).map(clean).filter(Boolean))],qty=positiveOr(quantity,1),baseQty=positiveOr(basePriceQuantity,1),baseU=normalizeUnit(baseUnit),wh=clean(warehouseId);
 const evaluated=(Array.isArray(rows)?rows:[]).map((row,index)=>{
  const price=Number(row?.Price),from=dateOnly(row?.PriceApplicableFromDate),to=dateOnly(row?.PriceApplicableToDate),group=clean(row?.PriceCustomerGroupCode),customer=clean(row?.CustomerAccountNumber),warehouse=clean(row?.PriceWarehouseId),site=clean(row?.PriceSiteId),fromQty=Number(row?.FromQuantity),toQty=Number(row?.ToQuantity),agreementQty=positiveOr(row?.SalesPriceQuantity,1),unit=clean(row?.QuantityUnitySymbol),unitNorm=normalizeUnit(unit),reasons=[];
  const dateEligible=(openBoundary(from)||day>=from)&&(openBoundary(to)||day<=to);if(!dateEligible)reasons.push('DATE');
  const groupEligible=!group||!groups.length||groups.includes(group);if(!groupEligible)reasons.push('PRICE_GROUP');
  const customerEligible=!customer;if(!customerEligible)reasons.push('CUSTOMER_CONTEXT');
  const warehouseEligible=!warehouse||(!!wh&&warehouse===wh);if(!warehouseEligible)reasons.push('WAREHOUSE');
  const siteEligible=!site;if(!siteEligible)reasons.push('SITE_CONTEXT');
  const quantityEligible=(!Number.isFinite(fromQty)||fromQty<=0||qty>=fromQty)&&(!Number.isFinite(toQty)||toQty<=0||qty<=toQty);if(!quantityEligible)reasons.push('QUANTITY');
  const scopeEligible=groupEligible&&customerEligible&&warehouseEligible&&siteEligible;
  const eligible=scopeEligible&&dateEligible&&quantityEligible&&Number.isFinite(price)&&price>=0;
  const unitCompatible=!baseU||!unitNorm||baseU===unitNorm;if(eligible&&!unitCompatible)reasons.push('UNIT_CONVERSION_UNPROVEN');
  const normalizedPrice=eligible&&unitCompatible?Number((price/agreementQty*baseQty).toFixed(6)):null;
  return{index,row,recordId:row?.RecordId??null,price:Number.isFinite(price)?price:null,normalizedPrice,unit:unit||null,priceQuantity:agreementQty,group:group||null,warehouse:warehouse||null,from,to,scopeEligible,dateEligible,quantityEligible,unitCompatible,eligible,safeForEffectivePrice:eligible&&unitCompatible,reasons};
 });
 const eligible=evaluated.filter(x=>x.eligible),safe=eligible.filter(x=>x.safeForEffectivePrice),signatures=[...new Set(safe.map(x=>[String(x.normalizedPrice),normalizeUnit(x.unit),String(x.priceQuantity)].join('|')))];
 let status='NONE',selected=null,safePrice=null;
 if(eligible.length&&!safe.length)status='UNSAFE';
 else if(safe.length&&signatures.length===1){
  status='UNIQUE';
  selected=[...safe].sort((a,b)=>String(b.from||'').localeCompare(String(a.from||''))||String(b.recordId??'').localeCompare(String(a.recordId??'')))[0];
  safePrice=selected.normalizedPrice;
 }else if(safe.length)status='AMBIGUOUS';
 return{status,businessDate:day,priceGroups:groups,warehouseId:wh||null,quantity:qty,baseUnit:clean(baseUnit)||null,basePriceQuantity:baseQty,rowCount:evaluated.length,scopeRelevantCount:evaluated.filter(x=>x.scopeEligible).length,eligibleCount:eligible.length,safeCount:safe.length,safePrice,selected,evaluated,reason:status==='UNIQUE'?'Un accord tarifaire magasin non ambigu est applicable.':status==='AMBIGUOUS'?'Plusieurs accords tarifaires compatibles donnent des prix différents ; aucun prix n’est imposé par StoreOps.':status==='UNSAFE'?'Un accord est applicable mais son unité n’est pas comparable de façon prouvée au prix de base.':'Aucun accord tarifaire applicable à ce magasin et cette date.'}
}
export async function getStoreSalesPriceContext(productNumber,{storeId=null,businessDate=null,quantity=1,priceGroups=[]}={}){
 const payload=await getSalesPriceAgreementsByItem(productNumber),base=payload?.basePrice?.row||null;
 let groupContext=null;try{groupContext=storeId?await resolveStorePriceGroups(storeId):null}catch{}
 const groups=[...new Set([...(priceGroups||[]),...(groupContext?.groups||[])].map(clean).filter(Boolean))];
 const store=storeId?storeOperationalSettings(storeId):null,warehouseId=clean(store?.storeWarehouseId)||null;
 const applicability=resolveApplicableTradeAgreements({rows:payload.rows||[],businessDate,priceGroups:groups,warehouseId,quantity,baseUnit:base?.SalesUnitSymbol||null,basePriceQuantity:base?.SalesPriceQuantity??1});
 return{...payload,priceGroups:groups,priceGroupContext:groupContext,storeWarehouseId:warehouseId,applicability}
}

function previousDays(day,count=2){const out=[];const d=new Date(`${day}T12:00:00Z`);for(let i=0;i<=count;i++){const x=new Date(d);x.setUTCDate(x.getUTCDate()-i);out.push(x.toISOString().slice(0,10))}return out}
function nextDay(day){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function orFilter(field,values=[]){const rows=[...new Set((values||[]).map(clean).filter(Boolean))];return rows.length?`(${rows.map(v=>`${field} eq '${escapeOData(v)}'`).join(' or ')})`:''}
function priceGroupScopeFilter(field,values=[]){const base=orFilter(field,values);return base?`(${base} or ${field} eq '')`:`${field} eq ''`}
async function dateScopedRows(entity,{dateField,day,filterParts=[],select='',pageSize=200,maxRows=4000}={}){
  const extra=config.dynamics.dataAreaId?'cross-company=true':'',tomorrow=nextDay(day);
  const dateFilters=[
    {mode:'DATETIME_RANGE',filter:`${dateField} ge ${day}T00:00:00Z and ${dateField} lt ${tomorrow}T00:00:00Z`},
    {mode:'DATE_LITERAL',filter:`${dateField} eq ${day}`},
    {mode:'QUOTED_DATE',filter:`${dateField} eq '${escapeOData(day)}'`}
  ];
  let lastError=null,firstEmpty=null;
  for(const attempt of dateFilters){
    try{
      const filter=[...filterParts,attempt.filter].filter(Boolean).join(' and '),payload=await odataGetAll(entity,{filter,select,extra,pageSize,maxRows}),value=Array.isArray(payload?.value)?payload.value:[];
      const result={...payload,dateFilterMode:attempt.mode,dateFilter:attempt.filter};
      if(value.length)return result;
      firstEmpty=firstEmpty||result
    }catch(error){lastError=error}
  }
  if(firstEmpty)return firstEmpty;
  throw lastError||new Error(`Lecture datée ${entity} impossible.`)
}

export async function getCommercialPriceChanges(storeId,businessDate){
  const day=dateOnly(businessDate)||new Date().toISOString().slice(0,10);
  if(!priceLive())return{changes:[],diagnostics:{mode:'SIMULATED',sources:[]}};

  const companyFilter=config.dynamics.dataAreaId?`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`:'';
  const priceGroupContext=await resolveStorePriceGroups(storeId).catch(()=>null);
  const priceGroups=[...new Set([...(priceGroupContext?.groups||[]),config.dynamics.storePriceGroups?.[storeId],config.dynamics.defaultPriceGroup||'Franprix'].map(clean).filter(Boolean))];
  const store=storeOperationalSettings(storeId),storeWarehouse=clean(store?.storeWarehouseId);
  const sources=[],changesByKey=new Map(),agreementItems=new Set(),scanDays=previousDays(day,2),historyMapping=effectiveD365PriceHistoryMapping();

  try{
    const entity=historyMapping?.entity||salesPriceEntity(),fields=historyMapping?.fields||null;
    let totalRows=0,totalPages=0,truncated=false;
    for(const scanDay of scanDays){
      const dateField=fields?.validFrom||'PriceApplicableFromDate',groupField=fields?.priceGroup||'PriceCustomerGroupCode';
      const filterParts=[companyFilter,groupField?priceGroupScopeFilter(groupField,priceGroups):''].filter(Boolean);
      const select=fields?[...new Set([fields.item,fields.price,fields.validFrom,fields.validTo,fields.currency,fields.priceGroup,fields.customer,fields.warehouse,fields.site,fields.quantity,fields.unit,fields.recordId,config.dynamics.dataAreaId?config.dynamics.dataAreaField:''].filter(Boolean))].join(','):AGREEMENT_SELECT_FIELDS.join(',');
      const payload=await dateScopedRows(entity,{dateField,day:scanDay,filterParts,select,pageSize:250,maxRows:6000});
      totalRows+=Number(payload.rowCount||0);totalPages+=Number(payload.pages||0);truncated=truncated||!!payload.truncated;
      if(payload.truncated)throw Object.assign(new Error(`Les accords tarifaires autour du ${day} dépassent la limite StoreOps.`),{status:503,code:'D365_COMMERCIAL_PRICE_AGREEMENTS_TRUNCATED'});
      const normalized=fields?(payload.value||[]).map(row=>canonicalHistoryRow(row,fields)):(payload.value||[]);
      for(const r of normalized){
        const item=clean(r.ItemNumber||r.ProductNumber),rowDay=dateOnly(r.PriceApplicableFromDate),rowGroup=clean(r.PriceCustomerGroupCode),price=Number(r.Price),customer=clean(r.CustomerAccountNumber),warehouse=clean(r.PriceWarehouseId),priceQty=positiveOr(r.SalesPriceQuantity,1),unit=clean(r.QuantityUnitySymbol);
        if(!item||!scanDays.includes(rowDay)||!Number.isFinite(price)||price<0)continue;
        if(rowGroup&&priceGroups.length&&!priceGroups.includes(rowGroup))continue;
        if(customer)continue;
        if(warehouse&&(!storeWarehouse||warehouse!==storeWarehouse))continue;
        const record=clean(r.RecordId)||`${item}:${rowGroup||'ALL'}:${warehouse||'ALL'}:${rowDay}`,key=`AGREEMENT:${record}`,unitPrice=Number((price/priceQty).toFixed(6)),basis=priceQty!==1||unit?` · ${price.toFixed(2)} DH / ${priceQty!==1?`${priceQty} `:''}${unit||'unité'}`:` · ${price.toFixed(2)} DH`;
        agreementItems.add(item);
        changesByKey.set(key,{
          sourceKey:`D365-PRICE-AGREEMENT-${record}-${rowDay}`,
          stableKey:`D365-PRICE-AGREEMENT:${record}`,
          fingerprint:stableFingerprint(['AGREEMENT',record,item,price,priceQty,unit,rowGroup,r.PriceCurrencyCode,r.PriceApplicableFromDate,r.PriceApplicableToDate,warehouse,r.PriceSiteId]),
          actionType:'VERIFY',deltaActionType:'PRICE_CHANGE',deltaOnFirstSeen:true,deltaSignageAction:'VERIFY',
          ean:`ITEM:${item}`,productNumber:item,productName:item,category:null,
          oldPrice:null,expectedPrice:unitPrice,promoLabel:`Accord tarifaire ${rowGroup||'Tous groupes'}${basis}${warehouse?` · entrepôt ${warehouse}`:''}${rowDay===day?'':` · détecté en rattrapage (${rowDay})`}`,
          signageAction:'VERIFY',priority:'HIGH',blockingOpening:true,storeId,priceGroup:rowGroup||null,priceGroups,
          source:'D365_RETAIL_PRICING',effectiveFrom:r.PriceApplicableFromDate||rowDay,effectiveTo:r.PriceApplicableToDate||null,priceSource:'SALES_PRICE_AGREEMENT'
        })
      }
    }
    sources.push({source:'SALES_PRICE_AGREEMENTS',status:'READY',entity,mappingSource:historyMapping?'STOREOPS_VALIDATED_MAPPING':'ENV_CONFIG',priceGroups,storeWarehouse,rowCount:totalRows,pages:totalPages,truncated,changes:[...changesByKey.values()].filter(x=>x.priceSource==='SALES_PRICE_AGREEMENT').length})
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
      if(!item||rowDay!==day||!Number.isFinite(price)||price<0||agreementItems.has(item))continue;
      changesByKey.set(`BASE:${item}`,{
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

  const changes=[...changesByKey.values()];
  if(!changes.length&&sources.length&&sources.every(x=>x.status==='ERROR')){
    throw Object.assign(new Error('Dynamics n’a pas permis de lire les changements de prix du jour.'),{status:502,code:'D365_COMMERCIAL_PRICE_DELTA_FAILED',details:{sources}})
  }
  return{changes,diagnostics:{mode:'LIVE',day,scanDays,priceGroups,priceGroupContext,sources}}
}

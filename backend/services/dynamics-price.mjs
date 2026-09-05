import { config } from '../config.mjs';
import { odataGet } from './dynamics.mjs';

export const SALES_PRICE_ENTITY='SalesPriceAgreements';
export const BASE_PRICE_ENTITY='ReleasedProductsV2';

function escapeOData(v){return String(v).replaceAll("'","''")}

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
  const item=String(productNumber||'').trim();
  if(!item)throw Object.assign(new Error('ItemNumber requis.'),{status:400,code:'D365_BASE_PRICE_ITEM_REQUIRED'});

  if(config.dynamics.mode!=='live'){
    return {mode:'SIMULATED',entity:BASE_PRICE_ENTITY,productNumber:item,rowCount:0,row:null};
  }

  const filters=[`ItemNumber eq '${escapeOData(item)}'`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  const payload=await odataGet(BASE_PRICE_ENTITY,{
    filter:filters.join(' and '),
    select:BASE_PRICE_SELECT_FIELDS.join(','),
    top:1,
    extra:config.dynamics.dataAreaId?'cross-company=true':''
  });
  const row=Array.isArray(payload?.value)?payload.value[0]||null:null;
  return {
    mode:'LIVE',
    entity:BASE_PRICE_ENTITY,
    productNumber:item,
    dataAreaId:config.dynamics.dataAreaId||row?.dataAreaId||null,
    rowCount:row?1:0,
    row
  };
}

export async function getSalesPriceAgreementsByItem(productNumber){
  const item=String(productNumber||'').trim();
  if(!item)throw Object.assign(new Error('ItemNumber requis.'),{status:400,code:'D365_PRICE_ITEM_REQUIRED'});

  const basePrice=await getBaseSalesPriceByItem(item);
  if(config.dynamics.mode!=='live'){
    return {mode:'SIMULATED',entity:SALES_PRICE_ENTITY,productNumber:item,rowCount:0,rows:[],basePrice};
  }

  const filters=[`ItemNumber eq '${escapeOData(item)}'`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  const payload=await odataGet(SALES_PRICE_ENTITY,{
    filter:filters.join(' and '),
    select:AGREEMENT_SELECT_FIELDS.join(','),
    top:100,
    extra:config.dynamics.dataAreaId?'cross-company=true':''
  });
  const rows=Array.isArray(payload?.value)?payload.value:[];
  return {
    mode:'LIVE',
    entity:SALES_PRICE_ENTITY,
    productNumber:item,
    dataAreaId:config.dynamics.dataAreaId||rows[0]?.dataAreaId||basePrice.dataAreaId||null,
    rowCount:rows.length,
    rows,
    basePrice
  };
}

import { config } from '../config.mjs';
import { odataGet } from './dynamics.mjs';

export const SALES_PRICE_ENTITY='SalesPriceAgreements';

function escapeOData(v){return String(v).replaceAll("'","''")}

const SELECT_FIELDS=[
  'RecordId','dataAreaId','ItemNumber','ProductNumber','Price','PriceCurrencyCode',
  'SalesPriceQuantity','QuantityUnitySymbol','PriceApplicableFromDate','PriceApplicableToDate',
  'PriceCustomerGroupCode','CustomerAccountNumber','PriceWarehouseId','PriceSiteId',
  'FromQuantity','ToQuantity','WillSearchContinue'
];

export async function getSalesPriceAgreementsByItem(productNumber){
  const item=String(productNumber||'').trim();
  if(!item)throw Object.assign(new Error('ItemNumber requis.'),{status:400,code:'D365_PRICE_ITEM_REQUIRED'});

  if(config.dynamics.mode!=='live'){
    return {mode:'SIMULATED',entity:SALES_PRICE_ENTITY,productNumber:item,rowCount:0,rows:[]};
  }

  const filters=[`ItemNumber eq '${escapeOData(item)}'`];
  if(config.dynamics.dataAreaId)filters.push(`${config.dynamics.dataAreaField} eq '${escapeOData(config.dynamics.dataAreaId)}'`);
  const payload=await odataGet(SALES_PRICE_ENTITY,{
    filter:filters.join(' and '),
    select:SELECT_FIELDS.join(','),
    top:100,
    extra:config.dynamics.dataAreaId?'cross-company=true':''
  });
  const rows=Array.isArray(payload?.value)?payload.value:[];
  return {
    mode:'LIVE',
    entity:SALES_PRICE_ENTITY,
    productNumber:item,
    dataAreaId:config.dynamics.dataAreaId||rows[0]?.dataAreaId||null,
    rowCount:rows.length,
    rows
  };
}

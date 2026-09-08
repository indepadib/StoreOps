import type { Config } from '@netlify/functions';

declare const Netlify:{env:{get(key:string):string|undefined}};

function bridge(){
  const keys=[
    'D365_MODE','D365_PRODUCT_READ_MODE','D365_PRICE_READ_MODE','D365_PROMOTION_READ_MODE',
    'D365_BASE_URL','D365_TENANT_ID','D365_CLIENT_ID','D365_CLIENT_SECRET','D365_OAUTH_VERSION',
    'D365_DATA_AREA_ID','D365_DATA_AREA_FIELD','D365_BARCODE_ENTITY','D365_PRODUCT_ENTITY',
    'D365_BARCODE_FIELD','D365_BARCODE_PRODUCT_FIELD','D365_BARCODE_DESCRIPTION_FIELD','D365_BARCODE_UNIT_FIELD',
    'D365_PRODUCT_NUMBER_FIELD','D365_PRODUCT_NAME_FIELD','D365_DEFAULT_PRICE_GROUP','D365_STORE_PRICE_GROUPS',
    'D365_BASE_PRICE_ENTITY','D365_SALES_PRICE_ENTITY'
  ];
  for(const key of keys){const value=Netlify.env.get(key);if(value!==undefined)process.env[key]=value;}
}

function safeError(error:any){return{code:String(error?.code||'D365_PRICE_DEBUG_FAILED'),status:Number(error?.status)||500,message:String(error?.message||error||'Erreur inconnue').slice(0,900)}}

export default async(request:Request)=>{
  const url=new URL(request.url);
  if(!url.hostname.startsWith('deploy-preview-'))return new Response('Not found',{status:404});
  bridge();
  const ean=String(url.searchParams.get('ean')||'4012').trim();
  try{
    const dynamics=await import('../../backend/services/dynamics.mjs');
    const price=await import('../../backend/services/dynamics-price.mjs');
    const product=await dynamics.getProductByEan(ean);
    if(!product)return Response.json({ok:false,ean,stage:'product',found:false},{status:404});
    const pricing=await price.getSalesPriceAgreementsByItem(product.productNumber);
    const base=pricing?.basePrice?.row||null;
    const agreements=Array.isArray(pricing?.rows)?pricing.rows:[];
    return Response.json({
      ok:true,
      ean,
      product:{productNumber:product.productNumber,name:product.name,unit:product.unit},
      basePrice:base?{SalesPrice:base.SalesPrice,SalesUnitSymbol:base.SalesUnitSymbol,SalesPriceQuantity:base.SalesPriceQuantity,SalesPriceDate:base.SalesPriceDate,BaseSalesPriceSource:base.BaseSalesPriceSource}:null,
      agreementCount:agreements.length,
      agreements:agreements.map((x:any)=>({
        RecordId:x.RecordId??null,
        ItemNumber:x.ItemNumber??x.ProductNumber??null,
        Price:x.Price??null,
        PriceCurrencyCode:x.PriceCurrencyCode??null,
        SalesPriceQuantity:x.SalesPriceQuantity??null,
        QuantityUnitySymbol:x.QuantityUnitySymbol??null,
        PriceApplicableFromDate:x.PriceApplicableFromDate??null,
        PriceApplicableToDate:x.PriceApplicableToDate??null,
        PriceCustomerGroupCode:x.PriceCustomerGroupCode??null,
        CustomerAccountNumber:x.CustomerAccountNumber??null,
        PriceWarehouseId:x.PriceWarehouseId??null,
        PriceSiteId:x.PriceSiteId??null,
        FromQuantity:x.FromQuantity??null,
        ToQuantity:x.ToQuantity??null,
        WillSearchContinue:x.WillSearchContinue??null,
        dataAreaId:x.dataAreaId??null
      }))
    });
  }catch(error){return Response.json({ok:false,ean,stage:'unhandled',error:safeError(error)},{status:200});}
};

export const config:Config={path:'/smoke/d365-price-debug'};

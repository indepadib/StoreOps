import type { Config } from '@netlify/functions';

declare const Netlify:{env:{get(key:string):string|undefined}};

function bridge(){
  const keys=[
    'D365_MODE','D365_PRODUCT_READ_MODE','D365_PRICE_READ_MODE','D365_PROMOTION_READ_MODE',
    'D365_BASE_URL','D365_TENANT_ID','D365_CLIENT_ID','D365_CLIENT_SECRET','D365_OAUTH_VERSION',
    'D365_DATA_AREA_ID','D365_DATA_AREA_FIELD','D365_BARCODE_ENTITY','D365_PRODUCT_ENTITY',
    'D365_BARCODE_FIELD','D365_BARCODE_PRODUCT_FIELD','D365_BARCODE_DESCRIPTION_FIELD','D365_BARCODE_UNIT_FIELD',
    'D365_PRODUCT_NUMBER_FIELD','D365_PRODUCT_NAME_FIELD','D365_DEFAULT_PRICE_GROUP','D365_STORE_PRICE_GROUPS',
    'D365_BASE_PRICE_ENTITY','D365_SALES_PRICE_ENTITY','D365_RETAIL_DISCOUNT_ENTITY','D365_RETAIL_DISCOUNT_LINE_ENTITY','D365_RETAIL_DISCOUNT_PRICE_GROUP_ENTITY'
  ];
  for(const key of keys){const value=Netlify.env.get(key);if(value!==undefined)process.env[key]=value;}
}

function safeError(error:any){return{code:String(error?.code||'D365_PRICE_DEBUG_FAILED'),status:Number(error?.status)||500,message:String(error?.message||error||'Erreur inconnue').slice(0,900)}}
function pick(row:any){if(!row)return null;return{OfferId:row.OfferId??null,ItemId:row.ItemId??null,Name:row.Name??null,CategoryName:row.CategoryName??null,LineType:row.LineType??null,OfferDiscountMethod:row.OfferDiscountMethod??null,OfferDiscountPercentage:row.OfferDiscountPercentage??null,OfferDiscountAmount:row.OfferDiscountAmount??null,OfferPrice:row.OfferPrice??null,OfferPriceInclTaxN1:row.OfferPriceInclTaxN1??null,OfferPriceN1:row.OfferPriceN1??null,DiscountPercentOrValue:row.DiscountPercentOrValue??null,MixAndMatchDiscountType:row.MixAndMatchDiscountType??null,MixAndMatchLineGroup:row.MixAndMatchLineGroup??null,MixAndMatchNumberOfItemsNeeded:row.MixAndMatchNumberOfItemsNeeded??null,dataAreaId:row.dataAreaId??row.DataAreaId??null}}

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
    const company=String(process.env.D365_DATA_AREA_ID||'5001').replaceAll("'","''");
    const lineEntity=String(process.env.D365_RETAIL_DISCOUNT_LINE_ENTITY||'RetailDiscountLines');
    const probes:any={};
    const attempts:[string,string][]=[
      ['name',`Name eq 'Banane au KG' and dataAreaId eq '${company}'`],
      ['offerPrice',`OfferPrice eq 17.9 and dataAreaId eq '${company}'`],
      ['offerPriceInclTaxN1',`OfferPriceInclTaxN1 eq 17.9 and dataAreaId eq '${company}'`],
      ['offerPriceN1',`OfferPriceN1 eq 17.9 and dataAreaId eq '${company}'`],
      ['amountOff2',`OfferDiscountAmount eq 2 and dataAreaId eq '${company}'`]
    ];
    for(const [key,filter] of attempts){
      try{const r=await dynamics.probeDataEntity(lineEntity,{top:50,filter});probes[key]={ok:true,filter,rowCount:r.rowCount,rows:(r.rows||[]).map(pick)}}
      catch(error){probes[key]={ok:false,filter,error:safeError(error)}}
    }
    return Response.json({
      ok:true,ean,
      product:{productNumber:product.productNumber,name:product.name,unit:product.unit},
      basePrice:base?{SalesPrice:base.SalesPrice,SalesUnitSymbol:base.SalesUnitSymbol,SalesPriceQuantity:base.SalesPriceQuantity,SalesPriceDate:base.SalesPriceDate,BaseSalesPriceSource:base.BaseSalesPriceSource}:null,
      agreementCount:agreements.length,
      agreements:agreements.map((x:any)=>({RecordId:x.RecordId??null,ItemNumber:x.ItemNumber??x.ProductNumber??null,Price:x.Price??null,PriceApplicableFromDate:x.PriceApplicableFromDate??null,PriceApplicableToDate:x.PriceApplicableToDate??null,PriceCustomerGroupCode:x.PriceCustomerGroupCode??null,PriceWarehouseId:x.PriceWarehouseId??null,PriceSiteId:x.PriceSiteId??null,dataAreaId:x.dataAreaId??null})),
      retailDiscountLineProbes:probes
    });
  }catch(error){return Response.json({ok:false,ean,stage:'unhandled',error:safeError(error)},{status:200});}
};

export const config:Config={path:'/smoke/d365-price-debug'};

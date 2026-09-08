import type { Config } from '@netlify/functions';

declare const Netlify:{env:{get(key:string):string|undefined}};

function bridge(){
  const keys=[
    'D365_MODE','D365_PRODUCT_READ_MODE','D365_PRICE_READ_MODE','D365_PROMOTION_READ_MODE',
    'D365_BASE_URL','D365_TENANT_ID','D365_CLIENT_ID','D365_CLIENT_SECRET','D365_OAUTH_VERSION',
    'D365_DATA_AREA_ID','D365_DATA_AREA_FIELD','D365_BARCODE_ENTITY','D365_PRODUCT_ENTITY',
    'D365_BARCODE_FIELD','D365_BARCODE_PRODUCT_FIELD','D365_BARCODE_DESCRIPTION_FIELD','D365_BARCODE_UNIT_FIELD',
    'D365_PRODUCT_NUMBER_FIELD','D365_PRODUCT_NAME_FIELD','D365_DEFAULT_PRICE_GROUP','D365_STORE_PRICE_GROUPS',
    'D365_BASE_PRICE_ENTITY','D365_SALES_PRICE_ENTITY','D365_RETAIL_DISCOUNT_ENTITY','D365_RETAIL_DISCOUNT_LINE_ENTITY',
    'D365_RETAIL_DISCOUNT_PRICE_GROUP_ENTITY','D365_MIX_MATCH_LINE_GROUP_ENTITY','D365_PROMOTION_ITEM_FIELD',
    'D365_ODATA_PAGE_SIZE','D365_ODATA_MAX_ROWS'
  ];
  for(const key of keys){const value=Netlify.env.get(key);if(value!==undefined)process.env[key]=value;}
}

function safeError(error:any){return{code:String(error?.code||'D365_V176_SMOKE_FAILED'),status:Number(error?.status)||500,message:String(error?.message||error||'Erreur inconnue').slice(0,900)}}

export default async(request:Request)=>{
  const url=new URL(request.url);
  if(!url.hostname.startsWith('deploy-preview-'))return new Response('Not found',{status:404});
  bridge();
  const ean=String(url.searchParams.get('ean')||'4012').trim();
  try{
    const dynamics=await import('../../backend/services/dynamics.mjs');
    const promotion=await import('../../backend/services/dynamics-promotion.mjs');
    const product=await dynamics.getProductByEan(ean);
    if(!product)return Response.json({ok:false,ean,stage:'product',found:false},{status:404});
    const pricing=await promotion.getProductPricing(product.productNumber,{
      priceGroup:'Franprix',
      productName:product.name,
      productCategory:product.category||'FPXMPX - Dépannage'
    });
    return Response.json({
      ok:true,
      ean,
      product:{productNumber:product.productNumber,name:product.name,category:product.category||null},
      mode:pricing.mode,
      sources:pricing.sources,
      errors:pricing.errors,
      basePrice:pricing.basePrice?.price??null,
      expectedUnitPrice:pricing.effectiveUnitPrice??null,
      promoLabel:(pricing.promotions?.items||[]).filter((x:any)=>x.activeForRequestedContext).map((x:any)=>({offerId:x.offerId,name:x.name,mechanic:x.mechanic,priceGroups:x.priceGroups,status:x.status})),
      promotions:pricing.promotions
    });
  }catch(error){return Response.json({ok:false,ean,error:safeError(error)},{status:200});}
};

export const config:Config={path:'/smoke/v176-promo'};

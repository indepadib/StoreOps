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

function safeError(error:any){return{code:String(error?.code||'D365_SMOKE_FAILED'),status:Number(error?.status)||500,message:String(error?.message||error||'Erreur inconnue').slice(0,700)}}
function pickLine(row:any){if(!row)return null;return{OfferId:row.OfferId??null,ItemId:row.ItemId??null,RetailGroupMemberLine:row.RetailGroupMemberLine??null,LineType:row.LineType??null,CategoryName:row.CategoryName??null,Name:row.Name??null,dataAreaId:row.dataAreaId??row.DataAreaId??null,keys:Object.keys(row).sort()}}
function pickGroup(row:any){if(!row)return null;return{OfferId:row.OfferId??null,PriceGroupId:row.PriceGroupId??null,PriceDiscGroup:row.PriceDiscGroup??null,dataAreaId:row.dataAreaId??row.DataAreaId??null,keys:Object.keys(row).sort()}}

export default async(request:Request)=>{
  const url=new URL(request.url);
  if(!url.hostname.startsWith('deploy-preview-'))return new Response('Not found',{status:404});
  bridge();
  try{
    const dynamics=await import('../../backend/services/dynamics.mjs');
    const mode=String(url.searchParams.get('mode')||'pricing');
    if(mode==='structure'){
      const company=String(process.env.D365_DATA_AREA_ID||'5001').replaceAll("'","''");
      const groupEntity=String(process.env.D365_RETAIL_DISCOUNT_PRICE_GROUP_ENTITY||'RetailDiscountPriceGroups');
      const lineEntity=String(process.env.D365_RETAIL_DISCOUNT_LINE_ENTITY||'RetailDiscountLines');
      const out:any={ok:true,company,groupEntity,lineEntity};
      try{
        const g=await dynamics.probeDataEntity(groupEntity,{top:20,filter:`PriceGroupId eq 'Franprix' and dataAreaId eq '${company}'`});
        out.priceGroupFilter={ok:true,rowCount:g.rowCount,rows:(g.rows||[]).map(pickGroup)};
      }catch(error){out.priceGroupFilter={ok:false,error:safeError(error)}}
      if(!out.priceGroupFilter?.ok||!out.priceGroupFilter?.rowCount){
        try{
          const g=await dynamics.probeDataEntity(groupEntity,{top:10,filter:`dataAreaId eq '${company}'`});
          out.priceGroupCompanySample={ok:true,rowCount:g.rowCount,rows:(g.rows||[]).map(pickGroup)};
        }catch(error){out.priceGroupCompanySample={ok:false,error:safeError(error)}}
      }
      const offerId=out.priceGroupFilter?.rows?.find((x:any)=>x.OfferId)?.OfferId||out.priceGroupCompanySample?.rows?.find((x:any)=>x.OfferId)?.OfferId||null;
      if(offerId){
        const safeOffer=String(offerId).replaceAll("'","''");
        try{
          const l=await dynamics.probeDataEntity(lineEntity,{top:20,filter:`OfferId eq '${safeOffer}' and dataAreaId eq '${company}'`});
          out.offerLineFilter={ok:true,offerId,rowCount:l.rowCount,rows:(l.rows||[]).map(pickLine)};
        }catch(error){out.offerLineFilter={ok:false,offerId,error:safeError(error)}}
      }
      try{
        const l=await dynamics.probeDataEntity(lineEntity,{top:3,filter:`dataAreaId eq '${company}'`});
        out.lineCompanySample={ok:true,rowCount:l.rowCount,rows:(l.rows||[]).map(pickLine)};
      }catch(error){out.lineCompanySample={ok:false,error:safeError(error)}}
      try{
        const entities=await dynamics.listDataEntities('GroupMember');
        out.groupMemberEntities=entities.map((x:any)=>({Name:x.Name??x.name??null,PublicEntityName:x.PublicEntityName??x.publicEntityName??null,PublicCollectionName:x.PublicCollectionName??x.publicCollectionName??null,IsReadOnly:x.IsReadOnly??x.isReadOnly??null}));
      }catch(error){out.groupMemberEntitiesError=safeError(error)}
      return Response.json(out);
    }

    const promotion=await import('../../backend/services/dynamics-promotion.mjs');
    const ean=String(url.searchParams.get('ean')||'5449000206770').trim();
    const product=await dynamics.getProductByEan(ean);
    if(!product)return Response.json({ok:false,ean,stage:'product',found:false},{status:404});
    const pricing=await promotion.getProductPricing(product.productNumber,{priceGroup:'Franprix'});
    return Response.json({
      ok:true,ean,
      product:{productNumber:product.productNumber,name:product.name,unit:product.unit},
      mode:pricing.mode,sources:pricing.sources,errors:pricing.errors,
      basePrice:pricing.basePrice?.price??null,effectiveUnitPrice:pricing.effectiveUnitPrice??null,
      promotions:{rowCount:pricing.promotions?.rowCount??0,activeCount:pricing.promotions?.activeCount??0,scan:pricing.promotions?.scan??null,warnings:pricing.promotions?.warnings??null,items:(pricing.promotions?.items||[]).map((x:any)=>({offerId:x.offerId,name:x.name,status:x.status,active:x.activeForRequestedContext,priceGroups:x.priceGroups,priceGroupEligible:x.priceGroupEligible,mechanic:x.mechanic,validFrom:x.validFrom,validTo:x.validTo}))}
    });
  }catch(error){return Response.json({ok:false,stage:'unhandled',error:safeError(error)},{status:200});}
};

export const config:Config={path:'/smoke/d365-promo'};

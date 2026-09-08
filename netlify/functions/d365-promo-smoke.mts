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
function pickLine(row:any){if(!row)return null;return{OfferId:row.OfferId??null,ItemId:row.ItemId??null,LineType:row.LineType??null,CategoryName:row.CategoryName??null,Name:row.Name??null,OfferDiscountMethod:row.OfferDiscountMethod??null,OfferDiscountPercentage:row.OfferDiscountPercentage??null,OfferDiscountAmount:row.OfferDiscountAmount??null,OfferPrice:row.OfferPrice??null,MixAndMatchDiscountType:row.MixAndMatchDiscountType??null,MixAndMatchLineGroup:row.MixAndMatchLineGroup??null,MixAndMatchNumberOfItemsNeeded:row.MixAndMatchNumberOfItemsNeeded??null,dataAreaId:row.dataAreaId??row.DataAreaId??null}}
function pickGroup(row:any){if(!row)return null;return{OfferId:row.OfferId??null,PriceGroupId:row.PriceGroupId??null,PriceDiscGroup:row.PriceDiscGroup??null,dataAreaId:row.dataAreaId??row.DataAreaId??null}}
function esc(v:any){return String(v??'').replaceAll("'","''")}
function chunks<T>(items:T[],size:number){const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out}
function orOffer(ids:string[]){return `(${ids.map(id=>`OfferId eq '${esc(id)}'`).join(' or ')})`}
function dateOnly(v:any){const s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function openDate(v:any){const d=dateOnly(v);return !d||d==='1900-01-01'||d==='1900-01-02'}
function headerActive(h:any,day:string){
  if(h?.Status&&h.Status!=='Enabled')return false;
  if(h?.ProcessingStatus&&h.ProcessingStatus!=='Processed')return false;
  const from=dateOnly(h?.ValidFrom),to=dateOnly(h?.ValidTo);
  return (openDate(from)||String(from)<=day)&&(openDate(to)||String(to)>=day);
}

async function offerDriven(dynamics:any,productNumber:string,priceGroup='Franprix'){
  const company=String(process.env.D365_DATA_AREA_ID||'5001');
  const groupEntity=String(process.env.D365_RETAIL_DISCOUNT_PRICE_GROUP_ENTITY||'RetailDiscountPriceGroups');
  const headerEntity=String(process.env.D365_RETAIL_DISCOUNT_ENTITY||'RetailDiscounts');
  const lineEntity=String(process.env.D365_RETAIL_DISCOUNT_LINE_ENTITY||'RetailDiscountLines');
  const companyFilter=`dataAreaId eq '${esc(company)}'`,extra='cross-company=true';
  const groupPayload=await dynamics.odataGetAll(groupEntity,{filter:`PriceGroupId eq '${esc(priceGroup)}' and ${companyFilter}`,pageSize:200,maxRows:2000,extra});
  const groups=Array.isArray(groupPayload.value)?groupPayload.value:[];
  const offerIds=[...new Set(groups.map((x:any)=>String(x.OfferId||'').trim()).filter(Boolean))] as string[];
  const headers:any[]=[];
  for(const batch of chunks(offerIds,20)){
    const payload=await dynamics.odataGet(headerEntity,{filter:`${orOffer(batch)} and ${companyFilter}`,top:500,extra});
    headers.push(...(Array.isArray(payload?.value)?payload.value:[]));
  }
  const day=new Date().toISOString().slice(0,10);
  const activeHeaders=headers.filter(h=>headerActive(h,day));
  const activeIds=[...new Set(activeHeaders.map(h=>String(h.OfferId||'').trim()).filter(Boolean))] as string[];
  const matched:any[]=[];let rowsRead=0,batchesRead=0,truncated=false;
  for(const batch of chunks(activeIds,8)){
    const payload=await dynamics.odataGetAll(lineEntity,{filter:`${orOffer(batch)} and ${companyFilter}`,pageSize:250,maxRows:5000,extra});
    rowsRead+=Number(payload.rowCount||0);batchesRead+=1;truncated=truncated||!!payload.truncated;
    for(const row of payload.value||[])if(String(row?.ItemId||'').trim()===productNumber)matched.push(row);
  }
  const headerById=new Map(activeHeaders.map(h=>[String(h.OfferId),h]));
  return{
    priceGroup,company,productNumber,
    groups:{rowCount:groups.length,pages:groupPayload.pages,truncated:groupPayload.truncated,offerCount:offerIds.length},
    headers:{rowCount:headers.length,activeCount:activeHeaders.length,activeOfferIds:activeIds},
    lines:{rowsRead,batchesRead,truncated,matchedCount:matched.length},
    matches:matched.map(row=>({line:pickLine(row),header:(()=>{const h=headerById.get(String(row.OfferId))||{};return{OfferId:h.OfferId??row.OfferId,Name:h.Name??null,PeriodicDiscountType:h.PeriodicDiscountType??null,Status:h.Status??null,ProcessingStatus:h.ProcessingStatus??null,ValidFrom:h.ValidFrom??null,ValidTo:h.ValidTo??null,MixAndMatchDiscountType:h.MixAndMatchDiscountType??null,MixAndMatchDealPrice:h.MixAndMatchDealPrice??null,MixAndMatchNoOfLeastExpensiveLines:h.MixAndMatchNoOfLeastExpensiveLines??null,DiscountPercentValue:h.DiscountPercentValue??null}})()})
  };
}

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
      try{const g=await dynamics.probeDataEntity(groupEntity,{top:20,filter:`PriceGroupId eq 'Franprix' and dataAreaId eq '${company}'`});out.priceGroupFilter={ok:true,rowCount:g.rowCount,rows:(g.rows||[]).map(pickGroup)}}catch(error){out.priceGroupFilter={ok:false,error:safeError(error)}}
      const offerId=out.priceGroupFilter?.rows?.find((x:any)=>x.OfferId)?.OfferId||null;
      if(offerId){try{const l=await dynamics.probeDataEntity(lineEntity,{top:20,filter:`OfferId eq '${esc(offerId)}' and dataAreaId eq '${company}'`});out.offerLineFilter={ok:true,offerId,rowCount:l.rowCount,rows:(l.rows||[]).map(pickLine)}}catch(error){out.offerLineFilter={ok:false,offerId,error:safeError(error)}}}
      return Response.json(out);
    }

    const ean=String(url.searchParams.get('ean')||'5449000206770').trim();
    const product=await dynamics.getProductByEan(ean);
    if(!product)return Response.json({ok:false,ean,stage:'product',found:false},{status:404});
    if(mode==='offer-driven')return Response.json({ok:true,ean,product:{productNumber:product.productNumber,name:product.name},diagnostic:await offerDriven(dynamics,product.productNumber,'Franprix')});

    const promotion=await import('../../backend/services/dynamics-promotion.mjs');
    const pricing=await promotion.getProductPricing(product.productNumber,{priceGroup:'Franprix'});
    return Response.json({ok:true,ean,product:{productNumber:product.productNumber,name:product.name,unit:product.unit},mode:pricing.mode,sources:pricing.sources,errors:pricing.errors,basePrice:pricing.basePrice?.price??null,effectiveUnitPrice:pricing.effectiveUnitPrice??null,promotions:{rowCount:pricing.promotions?.rowCount??0,activeCount:pricing.promotions?.activeCount??0,scan:pricing.promotions?.scan??null,warnings:pricing.promotions?.warnings??null,items:(pricing.promotions?.items||[]).map((x:any)=>({offerId:x.offerId,name:x.name,status:x.status,active:x.activeForRequestedContext,priceGroups:x.priceGroups,priceGroupEligible:x.priceGroupEligible,mechanic:x.mechanic,validFrom:x.validFrom,validTo:x.validTo}))}});
  }catch(error){return Response.json({ok:false,stage:'unhandled',error:safeError(error)},{status:200});}
};

export const config:Config={path:'/smoke/d365-promo'};

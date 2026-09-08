import type { Config } from '@netlify/functions';

declare const Netlify:{env:{get(key:string):string|undefined}};

function bridge(){
  const keys=[
    'D365_MODE','D365_PRODUCT_READ_MODE','D365_PRICE_READ_MODE','D365_PROMOTION_READ_MODE',
    'D365_BASE_URL','D365_TENANT_ID','D365_CLIENT_ID','D365_CLIENT_SECRET','D365_OAUTH_VERSION',
    'D365_DATA_AREA_ID','D365_DATA_AREA_FIELD','D365_RETAIL_DISCOUNT_ENTITY','D365_RETAIL_DISCOUNT_PRICE_GROUP_ENTITY'
  ];
  for(const key of keys){const value=Netlify.env.get(key);if(value!==undefined)process.env[key]=value;}
}

function safeError(error:any){return{code:String(error?.code||'D365_OFFER_DEBUG_FAILED'),status:Number(error?.status)||500,message:String(error?.message||error||'Erreur inconnue').slice(0,900)}}

export default async(request:Request)=>{
  const url=new URL(request.url);
  if(!url.hostname.startsWith('deploy-preview-'))return new Response('Not found',{status:404});
  bridge();
  const offerId=String(url.searchParams.get('offerId')||'5001-000091').trim();
  try{
    const dynamics=await import('../../backend/services/dynamics.mjs');
    const company=String(process.env.D365_DATA_AREA_ID||'5001').replaceAll("'","''");
    const safeOffer=offerId.replaceAll("'","''");
    const headerEntity=String(process.env.D365_RETAIL_DISCOUNT_ENTITY||'RetailDiscounts');
    const groupEntity=String(process.env.D365_RETAIL_DISCOUNT_PRICE_GROUP_ENTITY||'RetailDiscountPriceGroups');
    const header=await dynamics.probeDataEntity(headerEntity,{top:20,filter:`OfferId eq '${safeOffer}' and dataAreaId eq '${company}'`});
    const groups=await dynamics.probeDataEntity(groupEntity,{top:20,filter:`OfferId eq '${safeOffer}' and dataAreaId eq '${company}'`});
    return Response.json({ok:true,offerId,header:{rowCount:header.rowCount,rows:header.rows},groups:{rowCount:groups.rowCount,rows:groups.rows}});
  }catch(error){return Response.json({ok:false,offerId,error:safeError(error)},{status:200});}
};

export const config:Config={path:'/smoke/d365-offer-debug'};

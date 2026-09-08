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
function esc(v:any){return String(v??'').replaceAll("'","''")}
function chunks<T>(items:T[],size:number){const out:T[][]=[];for(let i=0;i<items.length;i+=size)out.push(items.slice(i,i+size));return out}
function orFilter(field:string,ids:string[]){return `(${ids.map(id=>`${field} eq '${esc(id)}'`).join(' or ')})`}
function dateOnly(v:any){const s=String(v||'');return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}
function openDate(v:any){const d=dateOnly(v);return !d||d==='1900-01-01'||d==='1900-01-02'}
function activeOnDay(h:any,day:string){const from=dateOnly(h?.ValidFrom),to=dateOnly(h?.ValidTo);return (openDate(from)||String(from)<=day)&&(openDate(to)||String(to)>=day)}

async function activeHeaderProbe(dynamics:any){
  const company=String(process.env.D365_DATA_AREA_ID||'5001');
  const headerEntity=String(process.env.D365_RETAIL_DISCOUNT_ENTITY||'RetailDiscounts');
  const filter=`Status eq 'Enabled' and ProcessingStatus eq 'Processed' and dataAreaId eq '${esc(company)}'`;
  try{
    const payload=await dynamics.probeDataEntity(headerEntity,{top:20,filter});
    return{ok:true,entity:headerEntity,filter,rowCount:payload.rowCount,rows:(payload.rows||[]).map((h:any)=>({OfferId:h.OfferId??null,Name:h.Name??null,PeriodicDiscountType:h.PeriodicDiscountType??null,Status:h.Status??null,ProcessingStatus:h.ProcessingStatus??null,ValidFrom:h.ValidFrom??null,ValidTo:h.ValidTo??null,keys:Object.keys(h).sort()}))};
  }catch(error){return{ok:false,entity:headerEntity,filter,error:safeError(error)}}
}

async function loadActiveFranprixUniverse(dynamics:any,priceGroup='Franprix'){
  const company=String(process.env.D365_DATA_AREA_ID||'5001'),extra='cross-company=true';
  const headerEntity=String(process.env.D365_RETAIL_DISCOUNT_ENTITY||'RetailDiscounts');
  const groupEntity=String(process.env.D365_RETAIL_DISCOUNT_PRICE_GROUP_ENTITY||'RetailDiscountPriceGroups');
  const companyFilter=`dataAreaId eq '${esc(company)}'`;
  const activeFilter=`Status eq 'Enabled' and ProcessingStatus eq 'Processed' and ${companyFilter}`;
  const headerPayload=await dynamics.odataGetAll(headerEntity,{filter:activeFilter,pageSize:100,maxRows:1000,extra});
  const day=new Date().toISOString().slice(0,10);
  const headers=(headerPayload.value||[]).filter((h:any)=>activeOnDay(h,day));
  const ids=[...new Set(headers.map((h:any)=>String(h.OfferId||'').trim()).filter(Boolean))] as string[];
  const groupPayloads=await Promise.all(chunks(ids,15).map(batch=>dynamics.odataGet(groupEntity,{filter:`${orFilter('OfferId',batch)} and PriceGroupId eq '${esc(priceGroup)}' and ${companyFilter}`,top:500,extra})));
  const groups=groupPayloads.flatMap((p:any)=>Array.isArray(p?.value)?p.value:[]);
  const eligible=new Set(groups.map((g:any)=>String(g.OfferId||'').trim()).filter(Boolean));
  const eligibleHeaders=headers.filter((h:any)=>eligible.has(String(h.OfferId||'').trim()));
  return{company,priceGroup,day,headerPayload,headers,groups,eligibleHeaders,eligibleIds:[...eligible] as string[]};
}

async function activeStats(dynamics:any){
  const u=await loadActiveFranprixUniverse(dynamics,'Franprix');
  return{company:u.company,businessDate:u.day,priceGroup:u.priceGroup,headers:{read:u.headerPayload.rowCount,pages:u.headerPayload.pages,truncated:u.headerPayload.truncated,activeToday:u.headers.length},priceGroups:{rows:u.groups.length,eligibleOffers:u.eligibleHeaders.length},eligible:u.eligibleHeaders.map((h:any)=>({OfferId:h.OfferId,Name:h.Name,PeriodicDiscountType:h.PeriodicDiscountType,ValidFrom:h.ValidFrom,ValidTo:h.ValidTo}))};
}

async function offerDriven(dynamics:any,productNumber:string){
  const u=await loadActiveFranprixUniverse(dynamics,'Franprix');
  const lineEntity=String(process.env.D365_RETAIL_DISCOUNT_LINE_ENTITY||'RetailDiscountLines'),extra='cross-company=true',companyFilter=`dataAreaId eq '${esc(u.company)}'`;
  const batches=chunks(u.eligibleIds,5);
  const payloads=await Promise.all(batches.map(batch=>dynamics.odataGetAll(lineEntity,{filter:`${orFilter('OfferId',batch)} and ${companyFilter}`,pageSize:250,maxRows:5000,extra})));
  const matches:any[]=[];let rowsRead=0,truncated=false;
  for(const p of payloads){rowsRead+=Number(p.rowCount||0);truncated=truncated||!!p.truncated;for(const row of p.value||[])if(String(row?.ItemId||'').trim()===productNumber)matches.push(row)}
  const headerById=new Map(u.eligibleHeaders.map((h:any)=>[String(h.OfferId),h]));
  return{company:u.company,businessDate:u.day,priceGroup:u.priceGroup,headers:{activeToday:u.headers.length,eligible:u.eligibleHeaders.length},lines:{batches:batches.length,rowsRead,truncated,matched:matches.length},matches:matches.map((row:any)=>{const h:any=headerById.get(String(row.OfferId))||{};return{OfferId:row.OfferId,ItemId:row.ItemId,Name:row.Name||h.Name||null,CategoryName:row.CategoryName||null,LineType:row.LineType||null,OfferDiscountMethod:row.OfferDiscountMethod||null,OfferDiscountPercentage:row.OfferDiscountPercentage??null,OfferDiscountAmount:row.OfferDiscountAmount??null,OfferPrice:row.OfferPrice??null,MixAndMatchDiscountType:h.MixAndMatchDiscountType||row.MixAndMatchDiscountType||null,MixAndMatchLineGroup:row.MixAndMatchLineGroup||null,MixAndMatchNumberOfItemsNeeded:row.MixAndMatchNumberOfItemsNeeded??null,PeriodicDiscountType:h.PeriodicDiscountType||null,ValidFrom:h.ValidFrom||null,ValidTo:h.ValidTo||null,MixAndMatchDealPrice:h.MixAndMatchDealPrice??null,MixAndMatchNoOfLeastExpensiveLines:h.MixAndMatchNoOfLeastExpensiveLines??null,DiscountPercentValue:h.DiscountPercentValue??null}})};
}

export default async(request:Request)=>{
  const url=new URL(request.url);
  if(!url.hostname.startsWith('deploy-preview-'))return new Response('Not found',{status:404});
  bridge();
  try{
    const dynamics=await import('../../backend/services/dynamics.mjs');
    const mode=String(url.searchParams.get('mode')||'active-filter');
    if(mode==='active-filter')return Response.json({ok:true,diagnostic:await activeHeaderProbe(dynamics)});
    if(mode==='active-stats')return Response.json({ok:true,diagnostic:await activeStats(dynamics)});
    const ean=String(url.searchParams.get('ean')||'5449000206770').trim();
    const product=await dynamics.getProductByEan(ean);
    if(!product)return Response.json({ok:false,ean,stage:'product',found:false},{status:404});
    if(mode==='offer-driven')return Response.json({ok:true,ean,product:{productNumber:product.productNumber,name:product.name},diagnostic:await offerDriven(dynamics,product.productNumber)});
    return Response.json({ok:true,ean,product:{productNumber:product.productNumber,name:product.name}});
  }catch(error){return Response.json({ok:false,stage:'unhandled',error:safeError(error)},{status:200});}
};

export const config:Config={path:'/smoke/d365-promo'};

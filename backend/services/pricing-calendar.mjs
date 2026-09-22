import { config } from '../config.mjs';
import { odataGetAll,resolveStorePriceGroups } from './dynamics.mjs';
import { RETAIL_DISCOUNT_ENTITY,RETAIL_DISCOUNT_PRICE_GROUP_ENTITY } from './dynamics-promotion.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const dayOnly=v=>{const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null};
const openBoundary=v=>{const d=dayOnly(v);return !d||d==='1900-01-01'||d==='1900-01-02'};
const chunks=(values,size=20)=>{const out=[];for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));return out};
const orFilter=(field,values)=>values.length?'('+values.map(v=>field+" eq '"+esc(v)+"'").join(' or ')+')':'';
const companyFilter=()=>config.dynamics.dataAreaId?config.dynamics.dataAreaField+" eq '"+esc(config.dynamics.dataAreaId)+"'":'';
const withCompany=filter=>[filter,companyFilter()].filter(Boolean).join(' and ');
const extraCompany=()=>config.dynamics.dataAreaId?'cross-company=true':'';
const normalizeState=v=>['ACTIVE','UPCOMING','EXPIRED','INACTIVE','ALL'].includes(clean(v).toUpperCase())?clean(v).toUpperCase():'ACTIVE';

export function pricingPeriodStatus({from=null,to=null,enabled=true,processed=true}={},businessDate=null){
 const day=dayOnly(businessDate)||new Date().toISOString().slice(0,10),start=dayOnly(from),end=dayOnly(to);
 if(!enabled||!processed)return'INACTIVE';
 if(!openBoundary(start)&&day<start)return'UPCOMING';
 if(!openBoundary(end)&&day>end)return'EXPIRED';
 return'ACTIVE'
}
function tradeStatus(row,day){return pricingPeriodStatus({from:row.PriceApplicableFromDate,to:row.PriceApplicableToDate},day)}
function promoStatus(row,day){return pricingPeriodStatus({from:row.ValidFrom,to:row.ValidTo,enabled:row.Status==='Enabled',processed:row.ProcessingStatus==='Processed'},day)}
function stateCounts(rows=[]){return rows.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{ACTIVE:0,UPCOMING:0,EXPIRED:0,INACTIVE:0})}
function matchesQuery(row,q){if(!q)return true;return[row.productNumber,row.itemNumber,row.offerId,row.name,row.priceGroup,row.type,row.mechanic].map(clean).join(' ').toLowerCase().includes(q.toLowerCase())}
function sortRows(rows=[]){const rank={ACTIVE:0,UPCOMING:1,EXPIRED:2,INACTIVE:3};return[...rows].sort((a,b)=>(rank[a.status]??9)-(rank[b.status]??9)||String(b.from||'').localeCompare(String(a.from||''))||String(a.name||a.productNumber||'').localeCompare(String(b.name||b.productNumber||'')))}

async function readTradeAgreements(groups,day){
 if(config.dynamics.mode!=='live'||config.dynamics.read?.price!=='live')return{mode:'SIMULATED',items:[],truncated:false};
 const filter=withCompany(orFilter('PriceCustomerGroupCode',groups));if(!filter)return{mode:'LIVE',items:[],truncated:false};
 const payload=await odataGetAll('SalesPriceAgreements',{filter,select:'ProductNumber,ItemNumber,PriceCustomerGroupCode,Price,PriceCurrencyCode,SalesPriceQuantity,QuantityUnitySymbol,PriceApplicableFromDate,PriceApplicableToDate',extra:extraCompany(),pageSize:500,maxRows:10000});
 const items=(payload.value||[]).map(row=>({kind:'TRADE_AGREEMENT',productNumber:clean(row.ProductNumber||row.ItemNumber)||null,itemNumber:clean(row.ItemNumber||row.ProductNumber)||null,priceGroup:clean(row.PriceCustomerGroupCode)||null,price:Number.isFinite(Number(row.Price))?Number(row.Price):null,currency:clean(row.PriceCurrencyCode)||null,priceQuantity:Number(row.SalesPriceQuantity||1)||1,unit:clean(row.QuantityUnitySymbol)||null,from:dayOnly(row.PriceApplicableFromDate),to:dayOnly(row.PriceApplicableToDate),status:tradeStatus(row,day)}));
 return{mode:'LIVE',items,rowsRead:payload.rowCount||items.length,pages:payload.pages||1,truncated:!!payload.truncated}
}

async function readPromotions(groups,day){
 if(config.dynamics.mode!=='live'||config.dynamics.read?.promotion!=='live')return{mode:'SIMULATED',items:[],truncated:false};
 if(!groups.length)return{mode:'LIVE',items:[],truncated:false};
 const groupPayload=await odataGetAll(RETAIL_DISCOUNT_PRICE_GROUP_ENTITY,{filter:withCompany(orFilter('PriceGroupId',groups)),select:'OfferId,PriceGroupId',extra:extraCompany(),pageSize:500,maxRows:5000});
 const groupRows=groupPayload.value||[],offerIds=[...new Set(groupRows.map(x=>clean(x.OfferId)).filter(Boolean))],byOffer=new Map();
 for(const row of groupRows){const id=clean(row.OfferId),group=clean(row.PriceGroupId);if(!id||!group)continue;if(!byOffer.has(id))byOffer.set(id,new Set());byOffer.get(id).add(group)}
 if(!offerIds.length)return{mode:'LIVE',items:[],truncated:!!groupPayload.truncated};
 const headers=[];
 for(const batch of chunks(offerIds,20)){const payload=await odataGetAll(RETAIL_DISCOUNT_ENTITY,{filter:withCompany(orFilter('OfferId',batch)),select:'OfferId,Name,PeriodicDiscountType,Status,ProcessingStatus,ValidFrom,ValidTo,CurrencyCode,ConcurrencyMode,PricingPriorityNumber,MixAndMatchDiscountType,MixAndMatchDealPrice,DiscountPercentValue',extra:extraCompany(),pageSize:500,maxRows:2000});headers.push(...(payload.value||[]))}
 const items=headers.map(row=>({kind:'PROMOTION',offerId:clean(row.OfferId)||null,name:clean(row.Name)||clean(row.OfferId)||'Promotion',type:clean(row.PeriodicDiscountType)||null,mechanic:clean(row.MixAndMatchDiscountType)||null,dealPrice:Number(row.MixAndMatchDealPrice||0)||null,discountPercent:Number(row.DiscountPercentValue||0)||null,currency:clean(row.CurrencyCode)||null,priority:row.PricingPriorityNumber??null,concurrencyMode:clean(row.ConcurrencyMode)||null,priceGroups:[...(byOffer.get(clean(row.OfferId))||[])],from:dayOnly(row.ValidFrom),to:dayOnly(row.ValidTo),status:promoStatus(row,day)}));
 return{mode:'LIVE',items,groupRows:groupPayload.rowCount||groupRows.length,offerRows:headers.length,truncated:!!groupPayload.truncated}
}

export async function pricingCalendarForStore({storeId,businessDate=null,state='ACTIVE',query='',limit=200}={}){
 const day=dayOnly(businessDate)||new Date().toISOString().slice(0,10),wanted=normalizeState(state),q=clean(query),safeLimit=Math.max(20,Math.min(500,Number(limit)||200));
 const groupContext=await resolveStorePriceGroups(storeId),groups=[...new Set((groupContext.groups||[]).map(clean).filter(Boolean))];
 const [tradeResult,promoResult]=await Promise.allSettled([readTradeAgreements(groups,day),readPromotions(groups,day)]);
 const trade=tradeResult.status==='fulfilled'?tradeResult.value:{mode:'ERROR',items:[],error:{code:tradeResult.reason?.code||'TRADE_AGREEMENT_READ_FAILED',message:tradeResult.reason?.message||String(tradeResult.reason)}};
 const promo=promoResult.status==='fulfilled'?promoResult.value:{mode:'ERROR',items:[],error:{code:promoResult.reason?.code||'PROMOTION_READ_FAILED',message:promoResult.reason?.message||String(promoResult.reason)}};
 const allTrade=sortRows(trade.items||[]),allPromo=sortRows(promo.items||[]),apply=rows=>rows.filter(x=>(wanted==='ALL'||x.status===wanted)&&matchesQuery(x,q)),tradeFiltered=apply(allTrade),promoFiltered=apply(allPromo);
 const liveSources=[trade.mode,promo.mode].filter(x=>x==='LIVE').length,errorSources=[trade.mode,promo.mode].filter(x=>x==='ERROR').length;
 return{status:errorSources===2?'UNAVAILABLE':errorSources||liveSources<2?'PARTIAL':'READY',storeId,businessDate:day,state:wanted,query:q||null,priceGroups:groups,priceGroupContext:groupContext,summary:{promotions:stateCounts(allPromo),tradeAgreements:stateCounts(allTrade),promotionTotal:allPromo.length,tradeAgreementTotal:allTrade.length},promotions:{mode:promo.mode,items:promoFiltered.slice(0,safeLimit),matched:promoFiltered.length,truncated:promoFiltered.length>safeLimit||!!promo.truncated,error:promo.error||null},tradeAgreements:{mode:trade.mode,items:tradeFiltered.slice(0,safeLimit),matched:tradeFiltered.length,truncated:tradeFiltered.length>safeLimit||!!trade.truncated,error:trade.error||null},refreshedAt:new Date().toISOString()}
}

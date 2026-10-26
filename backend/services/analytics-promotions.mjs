import { config } from '../config.mjs';
import { getCommercialChanges } from './dynamics.mjs';
import {readPreparedAnalyticsStock} from './dynamics-stock.mjs';

const clean=v=>String(v??'').trim();
const round2=v=>Math.round((Number(v||0)+Number.EPSILON)*100)/100;
const dayDiff=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);

function promoState(row,day){
  if(row.actionType==='PROMO_END')return'ENDED';
  if(row.source==='D365_RETAIL_PRICING_DIAGNOSTIC')return'PROCESSING';
  const from=clean(row.validFrom).slice(0,10),to=clean(row.validTo).slice(0,10);
  if(from&&from===day)return'STARTS_TODAY';
  if(to&&to===day)return'ENDS_TODAY';
  if(to&&to>=day&&dayDiff(day,to)<=3)return'ENDS_SOON';
  return'ACTIVE';
}
function discountPercent(row){
  const direct=Number(row?.sourceDetails?.discountPercentage);
  if(Number.isFinite(direct)&&direct>0)return round2(direct);
  const old=row.oldPrice==null?NaN:Number(row.oldPrice),next=row.expectedPrice==null?NaN:Number(row.expectedPrice);
  if(Number.isFinite(old)&&old>0&&Number.isFinite(next)&&next>=0&&next<old)return round2((old-next)/old*100);
  return null;
}
function mechanic(row){
  const method=clean(row?.sourceDetails?.discountMethod);
  if(method)return method;
  if(Number(row?.sourceDetails?.offerPrice||0)>0)return'OfferPrice';
  if(Number(row?.sourceDetails?.discountAmount||0)>0)return'AmountOff';
  return row.actionType||null;
}

export async function readPromotionAnalytics(storeId,{businessDate=new Date().toISOString().slice(0,10),force=false}={}){
  const day=/^\d{4}-\d{2}-\d{2}$/.test(clean(businessDate))?clean(businessDate):new Date().toISOString().slice(0,10);
  if(config.dynamics.mode!=='live'||config.dynamics.read?.promotion!=='live'){
    return{status:'UNAVAILABLE',storeId,businessDate:day,source:'D365_PROMOTIONS_NOT_LIVE',items:[],summary:{offers:null,articles:null,active:null,endingSoon:null,outOfStock:null,lowStock:null,averageDiscountPct:null}};
  }

  let changes;
  try{changes=await getCommercialChanges(storeId,day)}catch(error){
    return{status:'UNAVAILABLE',storeId,businessDate:day,source:'D365_PROMOTIONS_READ_FAILED',items:[],error:{code:error?.code||'D365_PROMOTIONS_READ_FAILED',message:error?.message||String(error)}};
  }

  if((changes||[]).some(x=>x.source==='SIMULATED_D365')){
    return{status:'UNAVAILABLE',storeId,businessDate:day,source:'SIMULATED_SOURCE_REJECTED',items:[],message:'Analytics refuse les données promotionnelles simulées.'};
  }

  let stock=null;
  try{const snapshot=await readPreparedAnalyticsStock(storeId);stock={source:snapshot.source,readAt:snapshot.checkedAt,items:snapshot.items.map(x=>({productNumber:x.productNumber,availableQty:x.availableOnHandQuantity,type:x.availableOnHandQuantity==null?'UNKNOWN':x.availableOnHandQuantity<0?'NEGATIVE':x.availableOnHandQuantity===0?'OUT':'AVAILABLE'}))}}catch{}
  const stockByProduct=new Map((stock?.items||[]).map(x=>[clean(x.productNumber),x]));

  const rows=(changes||[]).filter(row=>row.actionType!=='PRICE_CHANGE').map(row=>{
    const productNumber=clean(row.productNumber)||null,signal=productNumber?stockByProduct.get(productNumber)||null:null;
    return{
      storeId,
      sourceKey:row.sourceKey||null,
      offerId:row?.sourceDetails?.offerId||null,
      lineNum:row?.sourceDetails?.lineNum??null,
      productNumber,
      productName:row.productName||productNumber||row.category||'Promotion',
      category:row.category||null,
      actionType:row.actionType||null,
      state:promoState(row,day),
      oldPrice:row.oldPrice??row?.sourceDetails?.basePrice??null,
      promoPrice:row.expectedPrice??row?.sourceDetails?.promoPrice??null,
      discountPct:discountPercent(row),
      mechanic:mechanic(row),
      discountAmount:row?.sourceDetails?.discountAmount??null,
      validFrom:clean(row.validFrom).slice(0,10)||null,
      validTo:clean(row.validTo).slice(0,10)||null,
      priceGroups:Array.isArray(row.priceGroups)?row.priceGroups:row.priceGroup?[row.priceGroup]:[],
      retailChannelId:row.retailChannelId||null,
      promoLabel:row.promoLabel||null,
      source:row.source||null,
      stockSignal:signal?.type||null,
      stockPriority:signal?.priority||null,
      availableQty:signal?.availableQty??null,
      coverageDays:signal?.coverageDays??null,
      salesRisk24h:signal?.salesRisk24h??null
    };
  });

  const live=rows.filter(x=>x.state!=='ENDED'),productRows=live.filter(x=>x.productNumber);
  const offerKeys=new Set(live.map(x=>x.offerId||x.sourceKey).filter(Boolean));
  const articleKeys=new Set(productRows.map(x=>x.productNumber));
  const discounts=productRows.map(x=>x.discountPct).filter(x=>x!=null&&Number.isFinite(Number(x)));
  const endingSoon=live.filter(x=>['ENDS_TODAY','ENDS_SOON'].includes(x.state)).length;
  const outOfStock=productRows.filter(x=>x.stockSignal==='OUT').length;
  const lowStock=productRows.filter(x=>x.stockSignal==='LOW').length;

  return{
    status:'READY',
    storeId,
    businessDate:day,
    source:'D365_RETAIL_PRICING',
    checkedAt:new Date().toISOString(),
    summary:{
      offers:offerKeys.size,
      articles:articleKeys.size,
      active:live.length,
      endingSoon,
      outOfStock,
      lowStock,
      averageDiscountPct:discounts.length?round2(discounts.reduce((s,x)=>s+Number(x),0)/discounts.length):null,
      caPromo:null,
      uplift:null,
      roi:null
    },
    items:rows.sort((a,b)=>{
      const order={PROCESSING:0,STARTS_TODAY:1,ENDS_TODAY:2,ENDS_SOON:3,ACTIVE:4,ENDED:5};
      return(order[a.state]??9)-(order[b.state]??9)||(Number(b.discountPct||0)-Number(a.discountPct||0))||String(a.productName).localeCompare(String(b.productName),'fr')
    }),
    diagnostics:{
      stockSource:stock?.source||null,
      stockReady:!!stock,stockReadAt:stock?.readAt||null,stockDateBasis:'CURRENT_SNAPSHOT',
      rawChanges:(changes||[]).length,
      note:'CA promo, uplift et ROI restent indisponibles tant que les discount transactions ne sont pas reliées aux ventes.'
    }
  };
}
import {config} from '../config.mjs';
import {odataGetAll} from './dynamics.mjs';
import {referenceIndex} from './analytics-detention.mjs';
import {readAnalyticsCatalog} from './analytics-catalog.mjs';
import {analyticsCacheKey,readAnalyticsCache,writeAnalyticsCache} from './analytics-persistent-cache.mjs';
const esc=x=>String(x).replaceAll("'","''");
const finite=x=>x==null||x===''?null:Number.isFinite(Number(x))?Number(x):null;
export function latestInvoicePurchases(rows=[]){
 const result=new Map();
 for(const r of [...rows].sort((a,b)=>String(b.InvoiceDate).localeCompare(String(a.InvoiceDate))||String(b.CreatedOn).localeCompare(String(a.CreatedOn))||String(b.SourceKey).localeCompare(String(a.SourceKey)))){
  const sku=String(r.ItemId||'').trim(),qty=finite(r.Qty),amount=finite(r.LineAmount),unit=String(r.PurchUnit||'').trim();
  if(!sku||result.has(sku)||!(qty>0)||!/^\d{4}-\d{2}-\d{2}/.test(String(r.InvoiceDate)))continue;
  const valid=amount!=null&&amount>=0&&unit&&r.CurrencyCode;
  result.set(sku,{price:valid?Math.round(amount/qty*10000)/10000:null,status:valid?'READY':'UNAVAILABLE',date:String(r.InvoiceDate).slice(0,10),unit,currency:r.CurrencyCode||null,invoice:r.InvoiceId||null,source:'D365/VendInvoiceTransBiEntities',method:'NET_INVOICE_LINE_AMOUNT_PER_PURCHASE_UNIT',scope:'COMPANY',note:'Montant HT de ligne / quantité facturée ; hors remises globales et frais de facture. Dernière ligne positive par date de facture puis création ; avoirs exclus.'});
 }
 return result;
}
async function purchases(skus){
 const key=analyticsCacheKey('reference-purchases-v1',[config.dynamics.dataAreaId,...skus]);const hit=await readAnalyticsCache(key);if(hit)return hit;
 try{
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Casablanca'}).format(new Date());
  const filter=[config.dynamics.dataAreaId?`${config.dynamics.dataAreaField} eq '${esc(config.dynamics.dataAreaId)}'`:'',`(${skus.map(s=>`ItemId eq '${esc(s)}'`).join(' or ')})`,`InvoiceDate le ${today}T23:59:59Z`].filter(Boolean).join(' and ');
  const r=await odataGetAll('VendInvoiceTransBiEntities',{filter,select:'ItemId,InvoiceDate,CreatedOn,SourceKey,Qty,LineAmount,PurchUnit,CurrencyCode,InvoiceId',extra:'cross-company=true',pageSize:1000,maxRows:5000});
  const value={status:r.truncated?'INCOMPLETE':'READY',items:r.truncated?[]:[...latestInvoicePurchases(r.value).entries()]};
  await writeAnalyticsCache(key,'reference-purchases-v1',value,900);return value;
 }catch(e){return{status:'UNAVAILABLE',items:[],error:e.code||'PURCHASE_SOURCE_FAILED'}}
}
async function barcodes(skus){
 const c=config.dynamics;if(!c.barcodeEntity||!c.barcodeProductField||!c.barcodeField)return{status:'UNAVAILABLE',items:[]};
 try{const r=await odataGetAll(c.barcodeEntity,{filter:[`(${skus.map(s=>`${c.barcodeProductField} eq '${esc(s)}'`).join(' or ')})`,c.dataAreaId?`${c.dataAreaField} eq '${esc(c.dataAreaId)}'`:''].filter(Boolean).join(' and '),select:[c.barcodeProductField,c.barcodeField].join(','),extra:'cross-company=true',pageSize:1000,maxRows:5000});return{status:r.truncated?'INCOMPLETE':'READY',items:r.truncated?[]:r.value.map(x=>[String(x[c.barcodeProductField]),String(x[c.barcodeField])])}}catch{return{status:'UNAVAILABLE',items:[]}}
}
export async function readArticleReference({offset=0,limit=40,expectedSnapshot=null}={}){
 const index=await referenceIndex();if(!index.complete)throw Object.assign(new Error('Référentiel Dynamics incomplet : export suspendu pour éviter une liste tronquée.'),{status:502,code:'REFERENCE_INCOMPLETE'});
 const products=[...index.products].sort();
 const {createHash}=await import('node:crypto');const snapshot=createHash('sha256').update(products.join('|')).digest('hex');
 if(expectedSnapshot&&snapshot!==expectedSnapshot)throw Object.assign(new Error('Le référentiel a changé. Relancer la lecture pour garder un export cohérent.'),{status:409});
 const page=products.slice(offset,offset+limit),key=analyticsCacheKey('article-reference-v2',[snapshot,offset,limit]);let cached=await readAnalyticsCache(key);if(cached)return cached;
 const [catalog,buy,bars]=page.length?await Promise.all([readAnalyticsCatalog(page),purchases(page),barcodes(page)]):[{items:[]},{status:'READY',items:[]},{status:'READY',items:[]}];
 const prices=new Map(buy.items),checkedAt=new Date().toISOString();
 const data={schemaVersion:1,snapshot,checkedAt,company:config.dynamics.dataAreaId,offset,total:products.length,nextOffset:offset+page.length<products.length?offset+page.length:null,purchaseStatus:buy.status,purchaseError:buy.error||null,items:catalog.items.map(r=>({...r,barcodes:[...new Set(bars.items.filter(x=>x[0]===r.productNumber).map(x=>x[1]))],barcodeStatus:bars.status,lastPurchase:prices.get(r.productNumber)||null,lastPurchaseStatus:buy.status==='READY'?prices.get(r.productNumber)?.status||'NOT_FOUND':buy.status,salesPriceSource:r.salesPrice==null?null:'D365/ReleasedProductsV2.SalesPrice',salesPriceEffectiveDate:r.salesPriceDate||null,checkedAt})),semantics:{salesPrice:'Prix de vente de la fiche article, hors conditions magasin et promotions. Date de prix de fiche exposée si disponible ; ce prix ne constitue pas le prix effectif magasin/date avec accords et promotions.',lastPurchase:'Dernière ligne d’achat facturée positive de la société, HT par unité d’achat. Absence de facture ou lecture incomplète = N/D.',cost:'Coût actuel de référence, distinct du dernier achat facturé.',hierarchy:'Classement Dynamics ; classement partiel ou absent conservé et signalé.'}};
 await writeAnalyticsCache(key,'article-reference-v2',data,900);return data;
}

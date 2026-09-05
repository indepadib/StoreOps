import { db,uid,audit,todayISO } from '../db.mjs';
import { config } from '../config.mjs';
import { getStoreProductByEan } from './dynamics-stock.mjs';
import { getProductPricing } from './dynamics-promotion.mjs';
import { odataGetAllBySkip } from './dynamics-query.mjs';

db.exec(`
CREATE TABLE IF NOT EXISTS price_checks(
 id TEXT PRIMARY KEY,
 store_id TEXT NOT NULL REFERENCES stores(id),
 business_date TEXT NOT NULL,
 ean TEXT NOT NULL,
 product_number TEXT NOT NULL,
 product_name TEXT NOT NULL,
 expected_price REAL NULL,
 observed_price REAL NULL,
 promo_label TEXT NULL,
 signage_ok INTEGER NULL,
 execution_ok INTEGER NULL,
 status TEXT NOT NULL CHECK(status IN ('CONFORM','MISMATCH')),
 issues_json TEXT NULL,
 checked_by TEXT NOT NULL REFERENCES users(id),
 checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_price_checks_store_date ON price_checks(store_id,business_date,checked_at);
`);

const money=n=>`${Number(n).toFixed(2)} DH`;
export function priceGroupForStore(storeId){return String(config.dynamics.storePriceGroups?.[storeId]||config.dynamics.defaultPriceGroup||'Franprix').trim()||'Franprix'}
export function promoText(p){
 const active=(p?.promotions?.items||[]).filter(x=>x.activeForRequestedContext);
 if(!active.length)return null;
 return active.map(x=>{
  const m=x.mechanic||{};
  if(m.type==='MIX_AND_MATCH'&&m.mechanic==='DEAL_PRICE')return `${x.name} · ${m.requiredQuantity||'?'} article(s) pour ${money(m.dealPrice)}`;
  if(m.type==='MIX_AND_MATCH'&&m.mechanic==='LEAST_EXPENSIVE')return `${x.name} · sur ${m.requiredQuantity||'?'} article(s), ${m.discountedLineCount||1} moins cher(s) remisé(s) à ${m.discountPercent||100}%`;
  if(m.type==='DISCOUNT'&&m.mechanic==='PERCENT_OFF')return `${x.name} · -${m.discountPercent}%`;
  if(m.type==='DISCOUNT'&&m.mechanic==='AMOUNT_OFF')return `${x.name} · -${money(m.discountAmount)}`;
  if(m.type==='DISCOUNT'&&m.mechanic==='FIXED_PRICE')return `${x.name} · prix promo ${money(m.dealPrice)}`;
  return x.name||x.periodicDiscountType||'Promotion active';
 }).join(' | ');
}
async function categoryForProduct(productNumber,fallback='Autre'){
 if(fallback&&fallback!=='Autre')return fallback;
 if(config.dynamics.mode!=='live')return fallback||'Autre';
 const company=config.dynamics.dataAreaId;
 const filter=company?`${config.dynamics.dataAreaField} eq '${String(company).replaceAll("'","''")}'`:'';
 try{
  const payload=await odataGetAllBySkip('RetailDiscountLines',{filter,extra:company?'cross-company=true':''});
  const row=(payload?.value||[]).find(x=>String(x?.ItemId||'').trim()===String(productNumber||'').trim()&&String(x?.CategoryName||'').trim());
  return String(row?.CategoryName||fallback||'Autre').trim()||'Autre';
 }catch{return fallback||'Autre'}
}
function openPriceIncident(storeId,ean){
 const row=db.prepare(`SELECT i.id,i.title,i.criticality,i.requires_evidence,i.created_at,
  (SELECT COUNT(*) FROM incident_actions a WHERE a.incident_id=i.id AND a.status='OPEN') open_actions,
  (SELECT COUNT(*) FROM incident_evidence e WHERE e.incident_id=i.id) evidence_count
  FROM incidents i JOIN price_checks p ON p.id=i.source_id
  WHERE i.store_id=? AND i.source_type='PRICE_CHECK' AND i.status='OPEN' AND p.ean=?
  ORDER BY i.created_at DESC LIMIT 1`).get(storeId,ean);
 return row||null;
}

export async function buildPriceCheckContext({storeId,ean,businessDate=todayISO()}){
 const code=String(ean||'').trim();
 if(!code)throw Object.assign(new Error('EAN obligatoire.'),{status:400});
 const product=await getStoreProductByEan(storeId,code);
 if(!product)throw Object.assign(new Error('Article introuvable Dynamics.'),{status:404});
 const priceGroup=priceGroupForStore(storeId);
 const [pricing,category]=await Promise.all([
  getProductPricing(product.productNumber,{businessDate,priceGroup}),
  categoryForProduct(product.productNumber,product.category)
 ]);
 return{
  storeId,businessDate,ean:code,priceGroup,
  product:{ean:code,productNumber:product.productNumber,name:product.name,category,unit:product.unit,stock:product.stock,availableStock:product.availableStock},
  basePrice:pricing.basePrice,
  expectedUnitPrice:pricing.effectiveUnitPrice,
  promotions:pricing.promotions,
  conditionalPromotions:pricing.conditionalPromotions||[],
  promoLabel:promoText(pricing),
  pricingNote:pricing.pricingNote||null,
  promotionScan:pricing.promotions?.scan||null,
  openIncident:openPriceIncident(storeId,code)
 };
}

export async function executePriceCheck({storeId,ean,businessDate=todayISO(),observedPrice,signageOk,executionOk,user,tolerance=0.01}){
 const ctx=await buildPriceCheckContext({storeId,ean,businessDate});
 const issues=[];
 const expected=ctx.expectedUnitPrice==null?null:Number(ctx.expectedUnitPrice),observed=observedPrice==null||observedPrice===''?null:Number(observedPrice);
 if(expected!=null){
  if(!Number.isFinite(observed)||observed<0)issues.push('Prix rayon obligatoire.');
  else if(Math.abs(observed-expected)>Number(tolerance||0.01))issues.push(`Prix rayon ${money(observed)} ≠ prix Dynamics ${money(expected)}.`);
 }
 const hasPromo=!!ctx.promoLabel;
 if(hasPromo&&signageOk!==true)issues.push('Signalétique promotionnelle non conforme à Dynamics.');
 if(executionOk!==true)issues.push('Exécution rayon non confirmée.');
 const status=issues.length?'MISMATCH':'CONFORM',id=uid('pc');
 db.prepare(`INSERT INTO price_checks(id,store_id,business_date,ean,product_number,product_name,expected_price,observed_price,promo_label,signage_ok,execution_ok,status,issues_json,checked_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .run(id,storeId,businessDate,ctx.ean,ctx.product.productNumber,ctx.product.name,expected,Number.isFinite(observed)?observed:null,ctx.promoLabel,hasPromo?(signageOk===true?1:0):1,executionOk===true?1:0,status,issues.length?JSON.stringify(issues):null,user.id);
 audit({storeId,businessDate,userId:user.id,action:status==='CONFORM'?'PRICE_CHECK_CONFORM':'PRICE_CHECK_MISMATCH',entityType:'PRICE_CHECK',entityId:id,details:{ean:ctx.ean,productNumber:ctx.product.productNumber,expectedPrice:expected,observedPrice:observed,promoLabel:ctx.promoLabel,priceGroup:ctx.priceGroup,issues,priorIncidentId:ctx.openIncident?.id||null}});
 return{check:{id,status,issues,expectedPrice:expected,observedPrice:Number.isFinite(observed)?observed:null},context:ctx};
}

export function listPriceChecks(storeId,businessDate=todayISO(),limit=50){
 return db.prepare(`SELECT p.*,u.name checked_by_name FROM price_checks p LEFT JOIN users u ON u.id=p.checked_by WHERE p.store_id=? AND p.business_date=? ORDER BY p.checked_at DESC LIMIT ?`).all(storeId,businessDate,Math.max(1,Math.min(200,Number(limit)||50))).map(r=>{let issues=[];try{issues=r.issues_json?JSON.parse(r.issues_json):[]}catch{}return{...r,issues}});
}

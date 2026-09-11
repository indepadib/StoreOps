import {db,uid,audit,todayISO} from '../db.mjs';

const clean=v=>String(v??'').trim();
const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(clean(v))?clean(v):null;
const n=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null};
const fields=['leadTimeDays','safetyDays','packSize','minOrderQty','promoFactor','dayOfWeekFactor'];
const dbField={leadTimeDays:'lead_time_days',safetyDays:'safety_days',packSize:'pack_size',minOrderQty:'min_order_qty',promoFactor:'promo_factor',dayOfWeekFactor:'day_factor'};

db.exec(`
CREATE TABLE IF NOT EXISTS replenishment_rules(
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 scope_type TEXT NOT NULL CHECK(scope_type IN ('NETWORK','STORE','CATEGORY','ITEM')),
 store_id TEXT NULL REFERENCES stores(id),
 category_id TEXT NULL,
 product_number TEXT NULL,
 lead_time_days REAL NULL,
 safety_days REAL NULL,
 pack_size REAL NULL,
 min_order_qty REAL NULL,
 promo_factor REAL NULL,
 day_factor REAL NULL,
 effective_from TEXT NULL,
 effective_to TEXT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_replenishment_rules_lookup ON replenishment_rules(active,scope_type,store_id,category_id,product_number);
CREATE UNIQUE INDEX IF NOT EXISTS ux_replenishment_rules_active_scope ON replenishment_rules(scope_type,IFNULL(store_id,''),IFNULL(category_id,''),IFNULL(product_number,'')) WHERE active=1;
`);

function rowToRule(r){if(!r)return null;return{id:r.id,name:r.name,scopeType:r.scope_type,storeId:r.store_id,categoryId:r.category_id,productNumber:r.product_number,leadTimeDays:r.lead_time_days,safetyDays:r.safety_days,packSize:r.pack_size,minOrderQty:r.min_order_qty,promoFactor:r.promo_factor,dayOfWeekFactor:r.day_factor,effectiveFrom:r.effective_from,effectiveTo:r.effective_to,active:!!r.active,createdAt:r.created_at,updatedAt:r.updated_at}}
function envNonNegative(name,fallback){const x=Number(process.env[name]);return Number.isFinite(x)&&x>=0?x:fallback}
function defaults(){return{leadTimeDays:envNonNegative('STOREOPS_REPLENISHMENT_LEAD_TIME_DAYS',1),safetyDays:envNonNegative('STOREOPS_REPLENISHMENT_SAFETY_DAYS',1),packSize:Math.max(.001,envNonNegative('STOREOPS_REPLENISHMENT_PACK_SIZE',1)||1),minOrderQty:envNonNegative('STOREOPS_REPLENISHMENT_MIN_ORDER_QTY',0),promoFactor:Math.max(.1,envNonNegative('STOREOPS_REPLENISHMENT_PROMO_FACTOR',1)||1),dayOfWeekFactor:Math.max(.1,envNonNegative('STOREOPS_REPLENISHMENT_DAY_FACTOR',1)||1)}}
function activeOn(r,day){return !!r.active&&(!r.effectiveFrom||r.effectiveFrom<=day)&&(!r.effectiveTo||r.effectiveTo>=day)}
function validate(input={}){
 const scopeType=clean(input.scopeType||'NETWORK').toUpperCase(),storeId=clean(input.storeId)||null,categoryId=clean(input.categoryId)||null,productNumber=clean(input.productNumber)||null;
 if(!['NETWORK','STORE','CATEGORY','ITEM'].includes(scopeType))throw Object.assign(new Error('Périmètre de règle réappro invalide.'),{status:400,code:'REPLENISHMENT_SCOPE_INVALID'});
 if(scopeType==='NETWORK'&&(storeId||categoryId||productNumber))throw Object.assign(new Error('Une règle réseau ne doit pas cibler magasin, catégorie ou article.'),{status:400});
 if(scopeType==='STORE'&&(!storeId||categoryId||productNumber))throw Object.assign(new Error('Une règle magasin exige uniquement un magasin.'),{status:400});
 if(scopeType==='CATEGORY'&&!categoryId)throw Object.assign(new Error('Une règle catégorie exige une catégorie.'),{status:400});
 if(scopeType==='CATEGORY'&&productNumber)throw Object.assign(new Error('Une règle catégorie ne doit pas cibler un article.'),{status:400});
 if(scopeType==='ITEM'&&!productNumber)throw Object.assign(new Error('Une règle article exige un numéro article.'),{status:400});
 if(scopeType==='ITEM'&&categoryId)throw Object.assign(new Error('Une règle article ne doit pas cibler une catégorie.'),{status:400});
 if(storeId&&!db.prepare(`SELECT id FROM stores WHERE id=? AND active=1`).get(storeId))throw Object.assign(new Error('Magasin introuvable.'),{status:404});
 const effectiveFrom=input.effectiveFrom?iso(input.effectiveFrom):null,effectiveTo=input.effectiveTo?iso(input.effectiveTo):null;if((input.effectiveFrom&&!effectiveFrom)||(input.effectiveTo&&!effectiveTo)||(effectiveFrom&&effectiveTo&&effectiveFrom>effectiveTo))throw Object.assign(new Error('Période de règle invalide.'),{status:400});
 const out={name:clean(input.name)||`${scopeType} replenishment`,scopeType,storeId,categoryId,productNumber,effectiveFrom,effectiveTo,active:input.active!==false};
 for(const f of fields)out[f]=n(input[f]);
 if(out.leadTimeDays!==null&&out.leadTimeDays<0)throw Object.assign(new Error('Lead time invalide.'),{status:400});
 if(out.safetyDays!==null&&out.safetyDays<0)throw Object.assign(new Error('Stock sécurité invalide.'),{status:400});
 if(out.packSize!==null&&out.packSize<=0)throw Object.assign(new Error('Colisage doit être strictement positif.'),{status:400});
 if(out.minOrderQty!==null&&out.minOrderQty<0)throw Object.assign(new Error('MOQ invalide.'),{status:400});
 if(out.promoFactor!==null&&out.promoFactor<=0)throw Object.assign(new Error('Facteur promo invalide.'),{status:400});
 if(out.dayOfWeekFactor!==null&&out.dayOfWeekFactor<=0)throw Object.assign(new Error('Facteur jour invalide.'),{status:400});
 if(!fields.some(f=>out[f]!==null))throw Object.assign(new Error('La règle doit surcharger au moins un paramètre.'),{status:400,code:'REPLENISHMENT_RULE_EMPTY'});
 return out
}
function auditStore(user,storeId){return storeId||user?.store_id||db.prepare(`SELECT id FROM stores WHERE active=1 ORDER BY name LIMIT 1`).get()?.id||null}
function writeAudit({user,storeId,action,id,details}){const sid=auditStore(user,storeId);if(sid)audit({storeId:sid,userId:user?.id||null,action,entityType:'REPLENISHMENT_RULE',entityId:id,details})}

export function listReplenishmentRules({storeId=null,includeInactive=false}={}){const where=[],args=[];if(!includeInactive)where.push('active=1');if(storeId){where.push('(store_id IS NULL OR store_id=?)');args.push(storeId)}return db.prepare(`SELECT * FROM replenishment_rules ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY active DESC,scope_type,name`).all(...args).map(rowToRule)}
export function saveReplenishmentRule({user,id=null,input={}}){const v=validate(input),rid=id||uid('rrule'),existing=id?db.prepare(`SELECT id FROM replenishment_rules WHERE id=?`).get(id):null;if(id&&!existing)throw Object.assign(new Error('Règle réappro introuvable.'),{status:404});
 const vals=[v.name,v.scopeType,v.storeId,v.categoryId,v.productNumber,v.leadTimeDays,v.safetyDays,v.packSize,v.minOrderQty,v.promoFactor,v.dayOfWeekFactor,v.effectiveFrom,v.effectiveTo,v.active?1:0,user?.id||null];
 try{if(id)db.prepare(`UPDATE replenishment_rules SET name=?,scope_type=?,store_id=?,category_id=?,product_number=?,lead_time_days=?,safety_days=?,pack_size=?,min_order_qty=?,promo_factor=?,day_factor=?,effective_from=?,effective_to=?,active=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...vals,id);else db.prepare(`INSERT INTO replenishment_rules(id,name,scope_type,store_id,category_id,product_number,lead_time_days,safety_days,pack_size,min_order_qty,promo_factor,day_factor,effective_from,effective_to,active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(rid,...vals.slice(0,14),user?.id||null,user?.id||null)}catch(error){if(String(error.message).includes('UNIQUE'))throw Object.assign(new Error('Une règle active existe déjà sur ce périmètre exact.'),{status:409,code:'REPLENISHMENT_RULE_EXISTS'});throw error}
 writeAudit({user,storeId:v.storeId,action:id?'REPLENISHMENT_RULE_UPDATED':'REPLENISHMENT_RULE_CREATED',id:rid,details:{scopeType:v.scopeType,storeId:v.storeId,categoryId:v.categoryId,productNumber:v.productNumber}});return rowToRule(db.prepare(`SELECT * FROM replenishment_rules WHERE id=?`).get(rid))}
export function setReplenishmentRuleActive({id,user,active}){const row=db.prepare(`SELECT * FROM replenishment_rules WHERE id=?`).get(id);if(!row)throw Object.assign(new Error('Règle réappro introuvable.'),{status:404});try{db.prepare(`UPDATE replenishment_rules SET active=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(active?1:0,user?.id||null,id)}catch(error){if(String(error.message).includes('UNIQUE'))throw Object.assign(new Error('Impossible de réactiver : une autre règle active existe déjà sur ce périmètre.'),{status:409});throw error}writeAudit({user,storeId:row.store_id,action:active?'REPLENISHMENT_RULE_ACTIVATED':'REPLENISHMENT_RULE_DEACTIVATED',id,details:{scopeType:row.scope_type}});return rowToRule(db.prepare(`SELECT * FROM replenishment_rules WHERE id=?`).get(id))}

function categoryDepth(rule,taxonomy){const row=(taxonomy||[]).filter(x=>clean(x.category_id)===rule.categoryId).sort((a,b)=>Number(b.level||0)-Number(a.level||0))[0];return Number(row?.level||0)}
function matchRule(rule,{storeId,productNumber,categoryIds,day}){if(!activeOn(rule,day))return false;if(rule.scopeType==='NETWORK')return true;if(rule.scopeType==='STORE')return rule.storeId===storeId;if(rule.scopeType==='CATEGORY')return categoryIds.has(rule.categoryId)&&(!rule.storeId||rule.storeId===storeId);if(rule.scopeType==='ITEM')return rule.productNumber===productNumber&&(!rule.storeId||rule.storeId===storeId);return false}
function score(rule,taxonomy){if(rule.scopeType==='NETWORK')return 10;if(rule.scopeType==='STORE')return 20;if(rule.scopeType==='CATEGORY')return 30+(rule.storeId?5:0)+Math.min(4,categoryDepth(rule,taxonomy)/100);if(rule.scopeType==='ITEM')return 40+(rule.storeId?5:0);return 0}

export function resolveReplenishmentPolicy({storeId,productNumber,taxonomy=[],businessDate=todayISO(),hasPromotion=false}={}){
 const day=iso(businessDate)||todayISO(),categoryIds=new Set((taxonomy||[]).flatMap(x=>[clean(x.category_id),clean(x.parent_category_id)]).filter(Boolean)),matching=listReplenishmentRules({storeId}).filter(r=>matchRule(r,{storeId,productNumber:clean(productNumber),categoryIds,day})).sort((a,b)=>score(a,taxonomy)-score(b,taxonomy)||String(a.updatedAt).localeCompare(String(b.updatedAt)));
 const policy=defaults(),source=Object.fromEntries(fields.map(f=>[f,{type:'DEFAULT',ruleId:null,label:'Valeur par défaut'}]));
 for(const rule of matching)for(const f of fields)if(rule[f]!==null&&rule[f]!==undefined){policy[f]=Number(rule[f]);source[f]={type:rule.scopeType,ruleId:rule.id,label:rule.name,storeId:rule.storeId,categoryId:rule.categoryId,productNumber:rule.productNumber}}
 const configuredPromoFactor=policy.promoFactor;policy.promoFactor=hasPromotion?configuredPromoFactor:1;
 return{policy,configuredPromoFactor,promotionApplied:!!hasPromotion,source,appliedRules:matching.map(r=>({id:r.id,name:r.name,scopeType:r.scopeType,storeId:r.storeId,categoryId:r.categoryId,productNumber:r.productNumber,score:score(r,taxonomy)})),businessDate:day}
}

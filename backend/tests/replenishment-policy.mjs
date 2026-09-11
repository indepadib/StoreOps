import assert from 'node:assert/strict';
import {db,todayISO} from '../db.mjs';
import {saveReplenishmentRule,resolveReplenishmentPolicy,setReplenishmentRuleActive} from '../services/replenishment-policy.mjs';

process.env.STOREOPS_REPLENISHMENT_LEAD_TIME_DAYS='1';
process.env.STOREOPS_REPLENISHMENT_SAFETY_DAYS='1';
process.env.STOREOPS_REPLENISHMENT_PACK_SIZE='1';
process.env.STOREOPS_REPLENISHMENT_MIN_ORDER_QTY='0';
process.env.STOREOPS_REPLENISHMENT_PROMO_FACTOR='1';
process.env.STOREOPS_REPLENISHMENT_DAY_FACTOR='1';

const user=db.prepare(`SELECT * FROM users WHERE role='ops_director' LIMIT 1`).get();
const store=db.prepare(`SELECT * FROM stores WHERE id='val-fleuri'`).get();
const productNumber='HS-RULE-001',day=todayISO(),taxonomy=[{category_id:'FRAIS',parent_category_id:'ALIMENTAIRE',level:3}];

const network=saveReplenishmentRule({user,input:{name:'Réseau standard',scopeType:'NETWORK',leadTimeDays:2,safetyDays:1.5,packSize:2}});
const storeRule=saveReplenishmentRule({user,input:{name:'Val Fleuri',scopeType:'STORE',storeId:store.id,leadTimeDays:3,minOrderQty:4}});
const category=saveReplenishmentRule({user,input:{name:'Frais',scopeType:'CATEGORY',categoryId:'FRAIS',safetyDays:2,promoFactor:1.4}});
const item=saveReplenishmentRule({user,input:{name:'Colisage article',scopeType:'ITEM',storeId:store.id,productNumber,packSize:6}});

let resolved=resolveReplenishmentPolicy({storeId:store.id,productNumber,taxonomy,businessDate:day,hasPromotion:true});
assert.deepEqual(resolved.policy,{leadTimeDays:3,safetyDays:2,packSize:6,minOrderQty:4,promoFactor:1.4,dayOfWeekFactor:1});
assert.equal(resolved.source.leadTimeDays.ruleId,storeRule.id,'store must override network lead time');
assert.equal(resolved.source.safetyDays.ruleId,category.id,'category must override inherited safety days');
assert.equal(resolved.source.packSize.ruleId,item.id,'item must override pack size');
assert.equal(resolved.source.minOrderQty.ruleId,storeRule.id,'unoverridden item field must inherit store value');
assert.equal(resolved.source.promoFactor.ruleId,category.id);
assert.equal(resolved.appliedRules.at(-1).id,item.id,'item must be the most specific applied rule');

resolved=resolveReplenishmentPolicy({storeId:store.id,productNumber,taxonomy,businessDate:day,hasPromotion:false});
assert.equal(resolved.policy.promoFactor,1,'configured promo factor must only apply when promotion is active');
assert.equal(resolved.configuredPromoFactor,1.4,'configured factor must still be explainable');

setReplenishmentRuleActive({id:item.id,user,active:false});
resolved=resolveReplenishmentPolicy({storeId:store.id,productNumber,taxonomy,businessDate:day,hasPromotion:true});
assert.equal(resolved.policy.packSize,2,'deactivating item override must fall back to network pack size');

let duplicate=false;
try{saveReplenishmentRule({user,input:{name:'Duplicate store',scopeType:'STORE',storeId:store.id,safetyDays:9}})}catch(e){duplicate=e.code==='REPLENISHMENT_RULE_EXISTS'}
assert.equal(duplicate,true,'only one active exact rule per scope is allowed');

for(const id of [network.id,storeRule.id,category.id])setReplenishmentRuleActive({id,user,active:false});
console.log('StoreOps V1.80 replenishment policy contracts passed');

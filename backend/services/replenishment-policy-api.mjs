import {canAccessStore} from './permissions.mjs';
import {productTaxonomy} from './assortment.mjs';
import {listReplenishmentRules,saveReplenishmentRule,setReplenishmentRuleActive,resolveReplenishmentPolicy} from './replenishment-policy.mjs';

function route(path,pattern){const a=path.split('/').filter(Boolean),b=pattern.split('/').filter(Boolean);if(a.length!==b.length)return null;const p={};for(let i=0;i<a.length;i++){if(b[i].startsWith(':'))p[b[i].slice(1)]=decodeURIComponent(a[i]);else if(a[i]!==b[i])return null}return p}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>1e6)reject(Object.assign(new Error('Payload trop volumineux'),{status:413}))});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch{reject(Object.assign(new Error('JSON invalide'),{status:400}))}});req.on('error',reject)})}
function director(user){if(user.role!=='ops_director')throw Object.assign(new Error('Configuration réservée à la Direction / Administrateur.'),{status:403})}

export async function handleReplenishmentPolicyApi({req,url,user}){
 const path=url.pathname;let p;
 if(path==='/api/admin/replenishment-rules'){
  director(user);
  if(req.method==='GET')return{status:200,data:{items:listReplenishmentRules({storeId:url.searchParams.get('storeId')||null,includeInactive:url.searchParams.get('all')==='1'})}};
  if(req.method==='POST'){const b=await body(req);return{status:201,data:saveReplenishmentRule({user,input:b})}}
 }
 p=route(path,'/api/admin/replenishment-rules/:ruleId');if(p&&(req.method==='PUT'||req.method==='PATCH')){director(user);const b=await body(req);return{status:200,data:saveReplenishmentRule({user,id:p.ruleId,input:b})}}
 p=route(path,'/api/admin/replenishment-rules/:ruleId/active');if(p&&req.method==='POST'){director(user);const b=await body(req);return{status:200,data:setReplenishmentRuleActive({id:p.ruleId,user,active:b.active!==false})}}
 p=route(path,'/api/stores/:storeId/replenishment-policy/:productNumber');if(p&&req.method==='GET'){
  if(!canAccessStore(user,p.storeId))throw Object.assign(new Error('Accès interdit à ce magasin.'),{status:403});
  const taxonomy=productTaxonomy(p.productNumber),hasPromotion=url.searchParams.get('promotion')==='1';
  return{status:200,data:resolveReplenishmentPolicy({storeId:p.storeId,productNumber:p.productNumber,taxonomy,businessDate:url.searchParams.get('date')||undefined,hasPromotion})}
 }
 return null
}

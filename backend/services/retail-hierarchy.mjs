import {db} from '../db.mjs';
import './assortment.mjs';
import {retailCategoryCode,categoryLabel} from './category-code.mjs';

export const RETAIL_LEVELS=['department','rayon','family','subfamily','subsubfamily','ub'];
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
const scopeKey=(source,hierarchy,id)=>JSON.stringify([source,hierarchy,id]);
export function makeHierarchyContext(categories=[],assignments=[]){
 const byProduct=new Map(),byId=new Map(),byCode=new Map(),byName=new Map();
 const add=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value)};
 for(const c of categories.filter(c=>c.active!==0)){
  add(byId,scopeKey(c.source,c.hierarchy_key,c.category_id),c);
  add(byName,scopeKey(c.source,c.hierarchy_key,c.category_name),c);
  const code=retailCategoryCode(c.category_code)||retailCategoryCode(c.category_name)||retailCategoryCode(c.category_id);
  if(code)add(byCode,code,c);
 }
 for(const a of assignments)add(byProduct,a.product_number,a);
 return{categories,assignments,byProduct,byId,byCode,byName};
}
function matchCategories(context,source,hierarchy,id){
 const key=scopeKey(source,hierarchy,id);
 return [...new Set([...(context.byId.get(key)||[]),...(context.byName.get(key)||[])])];
}
export function resolveRetailHierarchy(productNumber,context={},product={}){
 if(!context.byName)context=makeHierarchyContext(context.categories,context.assignments);
 const assigned=context.byProduct.get(productNumber)||[],candidates=[];
 for(const a of assigned){
  const matches=matchCategories(context,a.source,a.hierarchy_key,a.category_id);
  for(const leaf of matches){const code=retailCategoryCode(leaf.category_code)||retailCategoryCode(leaf.category_name);if(code?.length===18)candidates.push({code,source:a.source,hierarchy:a.hierarchy_key,leaf})}
  const direct=retailCategoryCode(a.category_code)||retailCategoryCode(a.category_id);
  if(direct?.length===18)candidates.push({code:direct,source:a.source,hierarchy:a.hierarchy_key});
 }
 const unique=[...new Set(candidates.map(x=>x.code))];
 if(unique.length!==1)return{status:unique.length?'AMBIGUOUS':'MISSING',reason:assigned.length?'UB_CATEGORY_JOIN_UNRESOLVED':'PRODUCT_ASSIGNMENT_MISSING',levels:{},source:'PRODUCT_CATEGORY_ASSIGNMENTS'};
 const ub=unique[0],scopes=candidates.filter(x=>x.code===ub),ancestors=new Set(),levels={};
 for(const candidate of scopes){
  let node=candidate.leaf;const visited=new Set();
  while(node&&!visited.has(node)){visited.add(node);ancestors.add(node);const parents=matchCategories(context,node.source,node.hierarchy_key,node.parent_category_id);node=parents.length===1?parents[0]:null}
 }
 for(const [i,key] of RETAIL_LEVELS.entries()){
  const length=(i+1)*3,code=ub.slice(0,length);
  const matches=new Set((context.byCode.get(code)||[]).filter(c=>scopes.some(x=>x.source===c.source&&x.hierarchy===c.hierarchy_key)));
  for(const c of ancestors){
   const raw=String(c.category_code||'');
   if(!/^\d+$/.test(raw))continue;
   const matchesPrefix=raw.length<=length&&raw.padStart(length,'0')===code;
   const shortRayon=i===1&&raw.length<=3&&raw.padStart(3,'0')===ub.slice(3,6);
   if(matchesPrefix||shortRayon)matches.add(c);
  }
  const labels=[...new Set([...matches].map(c=>categoryLabel(c.category_name,code)).filter(Boolean))];
  const rayonFallback=key==='rayon'&&product.rayonLabel&&!/^Rayon \d+$/i.test(product.rayonLabel)?product.rayonLabel:null;
  levels[key]={id:code,label:labels.length===1?labels[0]:rayonFallback||code,labelStatus:labels.length===1?'RESOLVED':rayonFallback?'EXISTING_RAYON':labels.length>1?'AMBIGUOUS':'MISSING'};
 }
 return{status:'RESOLVED',source:'PRODUCT_CATEGORY_ASSIGNMENTS',ub,levels};
}
export function hierarchyContext(){
 return makeHierarchyContext(db.prepare('SELECT * FROM merchandising_categories WHERE active=1').all(),db.prepare('SELECT * FROM merchandising_product_categories').all());
}
export function attachRetailHierarchy(products,context=hierarchyContext()){
 return products.map(p=>({...p,hierarchy:resolveRetailHierarchy(String(p.key||p.productNumber||''),context,p)}));
}
export function rankRetailHierarchy(products=[],previous=null){
 const build=rows=>Object.fromEntries(RETAIL_LEVELS.map(level=>{
  const map=new Map();
  for(const p of rows){const node=p.hierarchy?.levels?.[level],key=node?.id||'__UNCLASSIFIED__',cur=map.get(key)||{key,label:node?.label||'Non classé',sales:0,units:0,articles:0,unclassified:!node};cur.sales+=Number(p.sales||0);cur.units+=Number(p.units||0);cur.articles++;map.set(key,cur)}
  return[level,[...map.values()]];
 }));
 const current=build(products),prior=previous===null?null:build(previous),total=products.reduce((s,p)=>s+Number(p.sales||0),0);
 for(const level of RETAIL_LEVELS){
  const old=new Map((prior?.[level]||[]).map(p=>[p.key,p.sales]));
  if(prior)for(const p of prior[level])if(!current[level].some(x=>x.key===p.key))current[level].push({...p,sales:0,units:0,articles:0});
  current[level]=current[level].sort((a,b)=>b.sales-a.sales||a.key.localeCompare(b.key)).map((p,i)=>({...p,rank:i+1,sales:round(p.sales),units:round(p.units),sharePct:total?round(p.sales/total*100):null,previous:prior?round(old.get(p.key)||0):null,delta:prior?round(p.sales-(old.get(p.key)||0)):null,changePct:prior&&old.get(p.key)?round((p.sales-old.get(p.key))/old.get(p.key)*100):null}));
 }
 return current;
}

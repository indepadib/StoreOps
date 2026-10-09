import {db} from '../db.mjs';
import './assortment.mjs';
import {retailCategoryCode,categoryLabel} from './category-code.mjs';

export const RETAIL_LEVELS=['department','rayon','family','subfamily','subsubfamily','ub'];
const round=v=>Math.round((v+Number.EPSILON)*100)/100;
export function resolveRetailHierarchy(productNumber,context={},product={}){
 const {categories=[],assignments=[]}=context;
 const assigned=context.byProduct?(context.byProduct.get(productNumber)||[]):assignments.filter(x=>x.product_number===productNumber);
 const candidates=[];
 for(const assignment of assigned){
  const category=context.byId?context.byId.get(JSON.stringify([assignment.source,assignment.hierarchy_key,assignment.category_id])):categories.find(c=>c.source===assignment.source&&c.hierarchy_key===assignment.hierarchy_key&&c.category_id===assignment.category_id&&c.active!==0);
  const code=retailCategoryCode(assignment.category_code)||retailCategoryCode(category?.category_code)||retailCategoryCode(category?.category_name)||retailCategoryCode(assignment.category_id);
  if(code?.length===18)candidates.push({code,source:assignment.source,hierarchy:assignment.hierarchy_key});
 }
 const unique=[...new Set(candidates.map(x=>x.code))];
 if(unique.length!==1)return{status:unique.length?'AMBIGUOUS':'MISSING',levels:{},source:'PRODUCT_CATEGORY_ASSIGNMENTS'};
 const ub=unique[0],scopes=candidates.filter(x=>x.code===ub),levels={};
 for(const [i,key] of RETAIL_LEVELS.entries()){
  const code=ub.slice(0,(i+1)*3);
  const matching=context.byCode?(context.byCode.get(code)||[]):categories.filter(c=>(retailCategoryCode(c.category_code)||retailCategoryCode(c.category_name)||retailCategoryCode(c.category_id))===code);
  const labels=[...new Set(matching.filter(c=>c.active!==0&&scopes.some(x=>x.source===c.source&&x.hierarchy===c.hierarchy_key)).map(c=>categoryLabel(c.category_name,code)).filter(Boolean))];
  const rayonFallback=key==='rayon'&&product.rayonLabel&&!/^Rayon \d+$/i.test(product.rayonLabel)?product.rayonLabel:null;
  levels[key]={id:code,label:labels.length===1?labels[0]:rayonFallback||code,labelStatus:labels.length===1?'RESOLVED':rayonFallback?'EXISTING_RAYON':labels.length>1?'AMBIGUOUS':'MISSING'};
 }
 return{status:'RESOLVED',source:'PRODUCT_CATEGORY_ASSIGNMENTS',ub,levels};
}
export function hierarchyContext(){
 const categories=db.prepare('SELECT * FROM merchandising_categories WHERE active=1').all(),assignments=db.prepare('SELECT * FROM merchandising_product_categories').all(),byProduct=new Map(),byId=new Map(),byCode=new Map();
 for(const c of categories){byId.set(JSON.stringify([c.source,c.hierarchy_key,c.category_id]),c);const code=retailCategoryCode(c.category_code)||retailCategoryCode(c.category_name)||retailCategoryCode(c.category_id);if(code){if(!byCode.has(code))byCode.set(code,[]);byCode.get(code).push(c)}}
 for(const a of assignments){if(!byProduct.has(a.product_number))byProduct.set(a.product_number,[]);byProduct.get(a.product_number).push(a)}
 return{categories,assignments,byProduct,byId,byCode};
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

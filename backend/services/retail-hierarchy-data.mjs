import {config} from '../config.mjs';
import {odataGetAll} from './dynamics.mjs';
import {dynamicsMerchandisingConfig,normalizeCategoryRows,normalizeAssignmentRows} from './dynamics-merchandising.mjs';
import {hierarchyContext,makeHierarchyContext} from './retail-hierarchy.mjs';

// Read-only reference cache: dashboard GETs must not mutate the database snapshot.
const references=new Map(),products=new Map(),pending=new Map();
const TTL=300000;
const esc=value=>String(value).replaceAll("'","''");
export async function readRetailHierarchyContext(productNumbers=[],{read=odataGetAll,live=config.dynamics.mode==='live'}={}){
 const local=hierarchyContext(),c=dynamicsMerchandisingConfig(),t=c.taxonomy;
 if(!live||process.env.D365_TAXONOMY_READ_MODE==='disabled')return{...local,diagnostics:{status:'LOCAL',source:'STOREOPS'}};
 const ids=[...new Set(productNumbers.map(x=>String(x||'').trim()).filter(Boolean))];
 const field=t.assignmentProductField||'ProductNumber';
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)||![t.categoryEntity,t.assignmentEntity].every(x=>/^[A-Za-z0-9_]+$/.test(x)))return{...local,diagnostics:{status:'UNAVAILABLE',code:'INVALID_TAXONOMY_MAPPING'}};
 const key=JSON.stringify([config.dynamics.baseUrl,config.dynamics.dataAreaId,t]);
 const companyRows=rows=>(rows||[]).filter(r=>{const area=r[config.dynamics.dataAreaField]||r.dataAreaId||r.DataAreaId;return !area||!config.dynamics.dataAreaId||String(area).toLowerCase()===config.dynamics.dataAreaId.toLowerCase()});
 const request=async(entity,filter)=>{const r=await read(entity,{filter,pageSize:1000,maxRows:t.maxRows,extra:'cross-company=true'});if(r.truncated)throw Object.assign(new Error('Référentiel catégories incomplet'),{code:'D365_TAXONOMY_TRUNCATED'});return companyRows(r.value)};
 const once=async(k,fn)=>{if(pending.has(k))return pending.get(k);const task=fn();pending.set(k,task);try{return await task}finally{pending.delete(k)}};
 try{
  const categories=await once(key,async()=>{
   const hit=references.get(key);if(hit&&Date.now()-hit.at<TTL)return hit.rows;
   const rows=normalizeCategoryRows(await request(t.categoryEntity),t);
   if(!rows.length)throw Object.assign(new Error('Référentiel catégories vide'),{code:'D365_TAXONOMY_EMPTY'});
   references.set(key,{at:Date.now(),rows});return rows;
  });
  const missing=ids.filter(id=>{const hit=products.get(key+'|'+id);return !hit||Date.now()-hit.at>=TTL});
  const batches=[];for(let i=0;i<missing.length;i+=30)batches.push(missing.slice(i,i+30));
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,batches.length)},async()=>{
   while(cursor<batches.length){const batch=batches[cursor++];await once(key+'|batch|'+batch.join('|'),async()=>{
    const rows=normalizeAssignmentRows(await request(t.assignmentEntity,batch.map(id=>`${field} eq '${esc(id)}'`).join(' or ')),t);
    for(const id of batch)products.set(key+'|'+id,{at:Date.now(),rows:rows.filter(r=>r.productNumber===id)});
   })}
  }));
  if(products.size>20000)for(const [k,hit] of products)if(Date.now()-hit.at>=TTL)products.delete(k);
  const assignments=ids.flatMap(id=>products.get(key+'|'+id)?.rows||[]),names=[...new Set([...categories,...assignments].map(r=>r.hierarchy).filter(Boolean))];
  if(names.length>1&&[...categories,...assignments].some(r=>!r.hierarchy))throw Object.assign(new Error('Hiérarchie absente'),{code:'D365_TAXONOMY_SCOPE_AMBIGUOUS'});
  const scope=r=>r.hierarchy||names[0]||c.hierarchyKey;
  const context=makeHierarchyContext(categories.map(r=>({source:c.source,hierarchy_key:scope(r),category_id:r.categoryId,category_name:r.categoryName,category_code:r.categoryCode,parent_category_id:r.parentCategoryId,active:r.active?1:0})),assignments.map(r=>({source:c.source,hierarchy_key:scope(r),product_number:r.productNumber,category_id:r.categoryId,category_code:r.categoryCode})));
  return{...context,diagnostics:{status:'READY',source:'D365',categories:categories.length,requestedProducts:ids.length,assignedProducts:new Set(assignments.map(r=>r.productNumber)).size}};
 }catch(error){return{...local,diagnostics:{status:'UNAVAILABLE',source:'D365',code:error.code||'D365_TAXONOMY_READ_FAILED',message:error.message}}}
}

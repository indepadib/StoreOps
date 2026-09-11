import { config } from '../config.mjs';
import { odataGetAll } from './dynamics.mjs';
import { syncCategoryHierarchy,syncProductCategoryAssignments,replaceStoreAssortmentSnapshots } from './assortment.mjs';

const clean=v=>String(v??'').trim();
const esc=v=>String(v).replaceAll("'","''");
const validEntity=v=>/^[A-Za-z0-9_]+$/.test(clean(v));
const validField=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
const readMode=v=>String(v||'simulated').trim().toLowerCase();
function parseMap(v=''){
 const raw=clean(v);if(!raw)return{};if(raw.startsWith('{')){try{const p=JSON.parse(raw);return p&&typeof p==='object'?p:{}}catch{return{}}}
 return Object.fromEntries(raw.split(',').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i>0?[x.slice(0,i).trim(),x.slice(i+1).trim()]:null}).filter(Boolean));
}
function first(row,names){for(const n of names){if(n&&row?.[n]!==undefined&&row?.[n]!==null&&clean(row[n])!=='')return row[n]}return null}
function boolish(v,defaultValue=true){if(v===null||v===undefined||v==='')return defaultValue;if(typeof v==='boolean')return v;const s=String(v).trim().toLowerCase();if(['0','false','no','excluded','exclude','disabled','inactive'].includes(s))return false;if(['1','true','yes','included','include','enabled','active'].includes(s))return true;return defaultValue}
function dateOnly(v){const s=clean(v);return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):null}

export function dynamicsMerchandisingConfig(){
 return {
  source:'D365',
  assortmentReadMode:readMode(process.env.D365_ASSORTMENT_READ_MODE),
  taxonomyReadMode:readMode(process.env.D365_TAXONOMY_READ_MODE),
  hierarchyKey:clean(process.env.D365_CATEGORY_HIERARCHY_KEY)||'PROCUREMENT',
  taxonomy:{
   categoryEntity:clean(process.env.D365_CATEGORY_ENTITY)||'ProcurementProductCategories',
   assignmentEntity:clean(process.env.D365_PRODUCT_CATEGORY_ASSIGNMENT_ENTITY)||'ProductCategoryAssignments',
   categoryIdField:clean(process.env.D365_CATEGORY_ID_FIELD),
   categoryNameField:clean(process.env.D365_CATEGORY_NAME_FIELD),
   parentCategoryIdField:clean(process.env.D365_CATEGORY_PARENT_FIELD),
   categoryLevelField:clean(process.env.D365_CATEGORY_LEVEL_FIELD),
   categoryPathField:clean(process.env.D365_CATEGORY_PATH_FIELD),
   hierarchyField:clean(process.env.D365_CATEGORY_HIERARCHY_FIELD),
   assignmentProductField:clean(process.env.D365_PRODUCT_CATEGORY_PRODUCT_FIELD),
   assignmentCategoryField:clean(process.env.D365_PRODUCT_CATEGORY_CATEGORY_FIELD),
   assignmentHierarchyField:clean(process.env.D365_PRODUCT_CATEGORY_HIERARCHY_FIELD),
   pageSize:Math.max(50,Math.min(2000,Number(process.env.D365_MERCH_PAGE_SIZE)||500)),
   maxRows:Math.max(500,Math.min(200000,Number(process.env.D365_MERCH_MAX_ROWS)||50000))
  },
  assortment:{
   entity:clean(process.env.D365_ASSORTMENT_ENTITY),
   storeField:clean(process.env.D365_ASSORTMENT_STORE_FIELD),
   productField:clean(process.env.D365_ASSORTMENT_PRODUCT_FIELD),
   assortmentIdField:clean(process.env.D365_ASSORTMENT_ID_FIELD),
   assortmentNameField:clean(process.env.D365_ASSORTMENT_NAME_FIELD),
   inclusionField:clean(process.env.D365_ASSORTMENT_INCLUDED_FIELD),
   validFromField:clean(process.env.D365_ASSORTMENT_VALID_FROM_FIELD),
   validToField:clean(process.env.D365_ASSORTMENT_VALID_TO_FIELD),
   storeChannels:parseMap(process.env.D365_STORE_CHANNELS||''),
   pageSize:Math.max(50,Math.min(2000,Number(process.env.D365_ASSORTMENT_PAGE_SIZE)||500)),
   maxRows:Math.max(500,Math.min(200000,Number(process.env.D365_ASSORTMENT_MAX_ROWS)||50000))
  }
 }
}

export function normalizeCategoryRows(rows=[],mapping=dynamicsMerchandisingConfig().taxonomy){
 const out=[];
 for(const row of Array.isArray(rows)?rows:[]){
  const categoryId=clean(first(row,[mapping.categoryIdField,'CategoryId','CategoryIdentifier','ProcurementCategoryId','CategoryCode','Category']));
  const categoryName=clean(first(row,[mapping.categoryNameField,'CategoryName','ProcurementCategoryName','Name','Description']));
  if(!categoryId||!categoryName)continue;
  out.push({categoryId,categoryName,parentCategoryId:clean(first(row,[mapping.parentCategoryIdField,'ParentCategoryId','ParentCategoryIdentifier','ParentCategory']))||null,level:Number(first(row,[mapping.categoryLevelField,'CategoryLevel','Level']))||null,path:clean(first(row,[mapping.categoryPathField,'CategoryPath','Path']))||null,hierarchy:clean(first(row,[mapping.hierarchyField,'CategoryHierarchyName','HierarchyName','CategoryHierarchy']))||null,active:boolish(first(row,['IsActive','Active','Status']),true)});
 }
 return out
}

export function normalizeAssignmentRows(rows=[],mapping=dynamicsMerchandisingConfig().taxonomy){
 const out=[];
 for(const row of Array.isArray(rows)?rows:[]){
  const productNumber=clean(first(row,[mapping.assignmentProductField,'ProductNumber','ItemNumber','Product','ProductId']));
  const categoryId=clean(first(row,[mapping.assignmentCategoryField,'CategoryId','CategoryIdentifier','ProcurementCategoryId','Category']));
  if(!productNumber||!categoryId)continue;
  out.push({productNumber,categoryId,hierarchy:clean(first(row,[mapping.assignmentHierarchyField,'CategoryHierarchyName','HierarchyName','CategoryHierarchy']))||null});
 }
 return out
}

export function normalizeAssortmentRows(rows=[],mapping=dynamicsMerchandisingConfig().assortment){
 const byAssortment=new Map();
 for(const row of Array.isArray(rows)?rows:[]){
  const productNumber=clean(first(row,[mapping.productField,'ProductNumber','ItemNumber','Product']));
  const assortmentKey=clean(first(row,[mapping.assortmentIdField,'AssortmentId','AssortmentNumber','Assortment','RecId']));
  if(!productNumber||!assortmentKey)continue;
  const assortmentName=clean(first(row,[mapping.assortmentNameField,'AssortmentName','Name','Description']))||assortmentKey;
  if(!byAssortment.has(assortmentKey))byAssortment.set(assortmentKey,{assortmentKey,assortmentName,complete:true,validFrom:dateOnly(first(row,[mapping.validFromField,'ValidFrom','StartDate','EffectiveFrom'])),validTo:dateOnly(first(row,[mapping.validToField,'ValidTo','EndDate','EffectiveTo'])),products:[]});
  const a=byAssortment.get(assortmentKey),included=boolish(first(row,[mapping.inclusionField,'Included','IsIncluded','InclusionStatus','Status']),true);
  a.products.push({productNumber,included,reason:included?null:'SOURCE_EXCLUSION',validFrom:dateOnly(first(row,[mapping.validFromField,'ValidFrom','StartDate','EffectiveFrom'])),validTo:dateOnly(first(row,[mapping.validToField,'ValidTo','EndDate','EffectiveTo']))});
 }
 return [...byAssortment.values()]
}

function requireLive(domain){
 const c=dynamicsMerchandisingConfig(),mode=domain==='assortment'?c.assortmentReadMode:c.taxonomyReadMode;
 if(config.dynamics.mode!=='live'||mode!=='live')throw Object.assign(new Error(`${domain} D365 non activé en LIVE.`),{status:409,code:'D365_MERCH_NOT_LIVE',details:{domain,mode}});return c
}
function requireEntity(name,label){if(!validEntity(name))throw Object.assign(new Error(`${label} non configurée.`),{status:503,code:'D365_MERCH_MAPPING_REQUIRED',details:{mapping:label}});return name}

export async function syncTaxonomyFromDynamics(){
 const c=requireLive('taxonomy'),t=c.taxonomy,categoryEntity=requireEntity(t.categoryEntity,'D365_CATEGORY_ENTITY'),assignmentEntity=requireEntity(t.assignmentEntity,'D365_PRODUCT_CATEGORY_ASSIGNMENT_ENTITY');
 const [categoriesRaw,assignmentsRaw]=await Promise.all([
  odataGetAll(categoryEntity,{pageSize:t.pageSize,maxRows:t.maxRows,extra:config.dynamics.dataAreaId?'cross-company=true':''}),
  odataGetAll(assignmentEntity,{pageSize:t.pageSize,maxRows:t.maxRows,extra:config.dynamics.dataAreaId?'cross-company=true':''})
 ]);
 const categories=normalizeCategoryRows(categoriesRaw.value,t),assignments=normalizeAssignmentRows(assignmentsRaw.value,t);
 if(!categories.length)throw Object.assign(new Error('Aucune catégorie exploitable retournée par D365 : mapping à valider.'),{status:409,code:'D365_TAXONOMY_EMPTY',details:{entity:categoryEntity,rowsRead:categoriesRaw.rowCount}});
 if(!assignments.length)throw Object.assign(new Error('Aucune affectation produit/catégorie exploitable retournée par D365 : mapping à valider.'),{status:409,code:'D365_CATEGORY_ASSIGNMENT_EMPTY',details:{entity:assignmentEntity,rowsRead:assignmentsRaw.rowCount}});
 const hierarchyKey=c.hierarchyKey,categorySync=syncCategoryHierarchy({source:c.source,hierarchyKey,categories}),assignmentSync=syncProductCategoryAssignments({source:c.source,hierarchyKey,assignments});
 return{source:c.source,hierarchyKey,categoryEntity,assignmentEntity,categories:categorySync.inserted,assignments:assignmentSync.inserted,rowsRead:{categories:categoriesRaw.rowCount,assignments:assignmentsRaw.rowCount},truncated:!!categoriesRaw.truncated||!!assignmentsRaw.truncated}
}

export async function syncStoreAssortmentFromDynamics(storeId){
 const c=requireLive('assortment'),a=c.assortment,entity=requireEntity(a.entity,'D365_ASSORTMENT_ENTITY'),channel=clean(a.storeChannels?.[storeId]);
 if(!channel)throw Object.assign(new Error(`Canal assortiment non mappé pour ${storeId}.`),{status:503,code:'D365_ASSORTMENT_STORE_MAPPING_REQUIRED',details:{storeId}});
 if(!validField(a.storeField)||!validField(a.productField)||!validField(a.assortmentIdField))throw Object.assign(new Error('Champs assortiment D365 obligatoires non mappés.'),{status:503,code:'D365_ASSORTMENT_FIELDS_REQUIRED',details:{required:['D365_ASSORTMENT_STORE_FIELD','D365_ASSORTMENT_PRODUCT_FIELD','D365_ASSORTMENT_ID_FIELD']}});
 const filters=[`${a.storeField} eq '${esc(channel)}'`];
 const fetched=await odataGetAll(entity,{filter:filters.join(' and '),pageSize:a.pageSize,maxRows:a.maxRows,extra:config.dynamics.dataAreaId?'cross-company=true':''});
 if(fetched.truncated)throw Object.assign(new Error('Snapshot assortiment tronqué : refus de remplacer le référentiel magasin.'),{status:409,code:'D365_ASSORTMENT_TRUNCATED',details:{rowCount:fetched.rowCount,maxRows:a.maxRows}});
 const assortments=normalizeAssortmentRows(fetched.value,a);
 if(!assortments.length)throw Object.assign(new Error('Aucun assortiment exploitable retourné : dernier snapshot conservé.'),{status:409,code:'D365_ASSORTMENT_EMPTY',details:{storeId,channel,entity,rowsRead:fetched.rowCount}});
 const result=replaceStoreAssortmentSnapshots({storeId,source:c.source,assortments});
 return{...result,entity,channel,rowsRead:fetched.rowCount,assortments:assortments.map(x=>({key:x.assortmentKey,name:x.assortmentName,products:x.products.length,validFrom:x.validFrom,validTo:x.validTo}))}
}

export function merchandisingReadiness(storeId=null){
 const c=dynamicsMerchandisingConfig(),channel=storeId?clean(c.assortment.storeChannels?.[storeId]):null;
 return{source:'D365',globalMode:config.dynamics.mode,capabilities:{taxonomy:{mode:c.taxonomyReadMode,mapped:validEntity(c.taxonomy.categoryEntity)&&validEntity(c.taxonomy.assignmentEntity),entities:{categories:c.taxonomy.categoryEntity,assignments:c.taxonomy.assignmentEntity}},assortment:{mode:c.assortmentReadMode,mapped:validEntity(c.assortment.entity)&&validField(c.assortment.storeField)&&validField(c.assortment.productField)&&validField(c.assortment.assortmentIdField)&&(!storeId||!!channel),entity:c.assortment.entity||null,storeId,channel:channel||null}}}
}

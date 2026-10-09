import {db} from '../db.mjs';
import {retailCategoryCode} from './category-code.mjs';
import { config } from '../config.mjs';
import { odataGetAll } from './dynamics.mjs';
import { syncCategoryHierarchy,syncProductCategoryAssignments,replaceStoreAssortmentSnapshots } from './assortment.mjs';
import { effectiveD365TaxonomyMapping } from './d365-taxonomy-mapping.mjs';

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
 const persisted=effectiveD365TaxonomyMapping(),pf=persisted?.fields||{};
 return {
  source:'D365',
  assortmentReadMode:readMode(process.env.D365_ASSORTMENT_READ_MODE),
  taxonomyReadMode:persisted?'live':readMode(process.env.D365_TAXONOMY_READ_MODE),
  hierarchyKey:persisted?.hierarchyKey||clean(process.env.D365_CATEGORY_HIERARCHY_KEY)||'PROCUREMENT',
  taxonomy:{
   mappingSource:persisted?'STOREOPS_VALIDATED_MAPPING':'ENV_CONFIG',
   mappingState:persisted?.state||null,
   categoryEntity:persisted?.categoryEntity||clean(process.env.D365_CATEGORY_ENTITY)||'ProcurementProductCategories',
   assignmentEntity:persisted?.assignmentEntity||clean(process.env.D365_PRODUCT_CATEGORY_ASSIGNMENT_ENTITY)||'ProductCategoryAssignments',
   categoryIdField:pf.categoryId||clean(process.env.D365_CATEGORY_ID_FIELD),
   categoryNameField:pf.categoryName||clean(process.env.D365_CATEGORY_NAME_FIELD),
   parentCategoryIdField:pf.parentCategoryId||clean(process.env.D365_CATEGORY_PARENT_FIELD),
   categoryLevelField:pf.categoryLevel||clean(process.env.D365_CATEGORY_LEVEL_FIELD),
   categoryPathField:pf.categoryPath||clean(process.env.D365_CATEGORY_PATH_FIELD),
   hierarchyField:pf.categoryHierarchy||clean(process.env.D365_CATEGORY_HIERARCHY_FIELD),
   assignmentProductField:pf.assignmentProduct||clean(process.env.D365_PRODUCT_CATEGORY_PRODUCT_FIELD),
   assignmentCategoryField:pf.assignmentCategory||clean(process.env.D365_PRODUCT_CATEGORY_CATEGORY_FIELD),
   assignmentHierarchyField:pf.assignmentHierarchy||clean(process.env.D365_PRODUCT_CATEGORY_HIERARCHY_FIELD),
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
  const categoryId=clean(first(row,[mapping.categoryIdField,'CategoryId','CategoryIdentifier','ProcurementCategoryId','CategoryCode','ProductCategoryCode','ProductCategoryName','Category','CategoryName']));
  const categoryName=clean(first(row,[mapping.categoryNameField,'CategoryName','ProcurementCategoryName','ProductCategoryName','Name','Description']));
  if(!categoryId||!categoryName)continue;
  out.push({categoryId,categoryName,categoryCode:clean(first(row,['ProductCategoryCode','CategoryCode','Code']))||[row.ProductCategoryName,row.CategoryName,categoryId].map(retailCategoryCode).find(Boolean)||null,parentCategoryId:clean(first(row,[mapping.parentCategoryIdField,'ParentCategoryId','ParentCategoryIdentifier','ParentCategory','ParentCategoryName']))||null,level:Number(first(row,[mapping.categoryLevelField,'CategoryLevel','Level']))||null,path:clean(first(row,[mapping.categoryPathField,'CategoryPath','Path']))||null,hierarchy:clean(first(row,[mapping.hierarchyField,'ProductCategoryHierarchyName','CategoryHierarchyName','HierarchyName','CategoryHierarchy']))||null,active:boolish(first(row,['IsActive','Active','Status']),true)});
 }
 return out
}

export function normalizeAssignmentRows(rows=[],mapping=dynamicsMerchandisingConfig().taxonomy){
 const out=[];
 for(const row of Array.isArray(rows)?rows:[]){
  const productNumber=clean(first(row,[mapping.assignmentProductField,'ProductNumber','ItemNumber','Product','ProductId']));
  const categoryId=clean(first(row,[mapping.assignmentCategoryField,'CategoryId','CategoryIdentifier','ProcurementCategoryId','CategoryCode','ProductCategoryCode','ProductCategoryName','Category']));
  if(!productNumber||!categoryId)continue;
  out.push({productNumber,categoryId,categoryCode:[row.ProductCategoryCode,row.CategoryCode,row.ProductCategoryName,row.CategoryName,categoryId].map(retailCategoryCode).find(Boolean)||null,hierarchy:clean(first(row,[mapping.assignmentHierarchyField,'ProductCategoryHierarchyName','CategoryHierarchyName','HierarchyName','CategoryHierarchy']))||null});
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
 if(categoriesRaw.truncated||assignmentsRaw.truncated)throw Object.assign(new Error('Référentiel catégories incomplet : dernier état conservé.'),{status:409,code:'D365_TAXONOMY_TRUNCATED'});
 const companyRows=rows=>(rows||[]).filter(row=>{const area=clean(first(row,[config.dynamics.dataAreaField,'dataAreaId','DataAreaId']));return !area||!config.dynamics.dataAreaId||area.toLowerCase()===config.dynamics.dataAreaId.toLowerCase()});
 const categories=normalizeCategoryRows(companyRows(categoriesRaw.value),t),assignments=normalizeAssignmentRows(companyRows(assignmentsRaw.value),t);
 if(!categories.length)throw Object.assign(new Error('Aucune catégorie exploitable retournée par D365 : mapping à valider.'),{status:409,code:'D365_TAXONOMY_EMPTY',details:{entity:categoryEntity,rowsRead:categoriesRaw.rowCount}});
 if(!assignments.length)throw Object.assign(new Error('Aucune affectation produit/catégorie exploitable retournée par D365 : mapping à valider.'),{status:409,code:'D365_CATEGORY_ASSIGNMENT_EMPTY',details:{entity:assignmentEntity,rowsRead:assignmentsRaw.rowCount}});
 const hierarchyKey=c.hierarchyKey;
 const named=[...new Set([...categories,...assignments].map(x=>x.hierarchy).filter(Boolean))];
 // Unscoped rows can only be attributed when one hierarchy is unambiguous.
 if(named.length>1&&[...categories,...assignments].some(x=>!x.hierarchy))throw Object.assign(new Error('Hiérarchie absente sur une partie du référentiel : mapping à préciser.'),{status:409,code:'D365_TAXONOMY_SCOPE_AMBIGUOUS'});
 const scope=x=>x.hierarchy||named[0]||hierarchyKey,keys=[...new Set([...categories,...assignments].map(scope))];
 let categoryCount=0,assignmentCount=0;
 db.exec('SAVEPOINT sync_taxonomy');
 try{
  for(const key of keys){
   const cats=categories.filter(x=>scope(x)===key),links=assignments.filter(x=>scope(x)===key);
   if(!cats.length||!links.length)throw Object.assign(new Error(`Référentiel incomplet pour ${key} : dernier état conservé.`),{status:409,code:'D365_TAXONOMY_SCOPE_INCOMPLETE'});
   categoryCount+=syncCategoryHierarchy({source:c.source,hierarchyKey:key,categories:cats}).inserted;
   assignmentCount+=syncProductCategoryAssignments({source:c.source,hierarchyKey:key,assignments:links}).inserted;
  }
  db.exec('RELEASE sync_taxonomy');
 }catch(error){db.exec('ROLLBACK TO sync_taxonomy');db.exec('RELEASE sync_taxonomy');throw error}
 const categorySync={inserted:categoryCount},assignmentSync={inserted:assignmentCount};
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
 return{source:'D365',globalMode:config.dynamics.mode,capabilities:{taxonomy:{mode:c.taxonomyReadMode,mapped:validEntity(c.taxonomy.categoryEntity)&&validEntity(c.taxonomy.assignmentEntity),mappingSource:c.taxonomy.mappingSource,mappingState:c.taxonomy.mappingState,entities:{categories:c.taxonomy.categoryEntity,assignments:c.taxonomy.assignmentEntity}},assortment:{mode:c.assortmentReadMode,mapped:validEntity(c.assortment.entity)&&validField(c.assortment.storeField)&&validField(c.assortment.productField)&&validField(c.assortment.assortmentIdField)&&(!storeId||!!channel),entity:c.assortment.entity||null,storeId,channel:channel||null}}}
}

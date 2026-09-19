import {db,audit} from '../db.mjs';
import {config} from '../config.mjs';
import {probeDataEntity} from './dynamics.mjs';

const clean=v=>String(v??'').trim();
const validName=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));
const validEntity=v=>/^[A-Za-z0-9_]+$/.test(clean(v));
const STATES=['DRAFT','VALIDATED','LIVE','DISABLED'];
const REQUIRED_CATEGORY=['categoryId','categoryName'];
const OPTIONAL_CATEGORY=['parentCategoryId','categoryLevel','categoryPath','categoryHierarchy'];
const REQUIRED_ASSIGNMENT=['assignmentProduct','assignmentCategory'];
const OPTIONAL_ASSIGNMENT=['assignmentHierarchy'];
const ALL=[...REQUIRED_CATEGORY,...OPTIONAL_CATEGORY,...REQUIRED_ASSIGNMENT,...OPTIONAL_ASSIGNMENT];

db.exec(`
CREATE TABLE IF NOT EXISTS d365_taxonomy_mapping_settings(
 id TEXT PRIMARY KEY,
 category_entity TEXT NOT NULL,
 assignment_entity TEXT NOT NULL,
 hierarchy_key TEXT NOT NULL,
 fields_json TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'DRAFT',
 smoke_json TEXT NULL,
 validated_at TEXT NULL,
 validated_by TEXT NULL REFERENCES users(id),
 updated_by TEXT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function safeJson(raw,fallback={}){try{const x=JSON.parse(raw||'');return x&&typeof x==='object'?x:fallback}catch{return fallback}}
function normalizeFields(input={}){
 const out={};for(const role of ALL){const v=clean(input?.[role]);out[role]=v&&validName(v)?v:''}return out
}
function validateInput(input={}){
 const categoryEntity=clean(input.categoryEntity||'ProcurementProductCategories');
 const assignmentEntity=clean(input.assignmentEntity||'ProductCategoryAssignments');
 const hierarchyKey=clean(input.hierarchyKey||'PROCUREMENT')||'PROCUREMENT';
 if(!validEntity(categoryEntity)||!validEntity(assignmentEntity))throw Object.assign(new Error('Entité taxonomie D365 invalide.'),{status:400,code:'D365_TAXONOMY_ENTITY_INVALID'});
 const fields=normalizeFields(input.fields||{});
 const missing=[...REQUIRED_CATEGORY,...REQUIRED_ASSIGNMENT].filter(x=>!fields[x]);
 if(missing.length)throw Object.assign(new Error(`Champs taxonomie obligatoires manquants : ${missing.join(', ')}`),{status:400,code:'D365_TAXONOMY_MAPPING_INCOMPLETE',details:{missing}});
 return{categoryEntity,assignmentEntity,hierarchyKey,fields}
}
function rowToSettings(row){
 if(!row)return null;return{
  categoryEntity:row.category_entity,assignmentEntity:row.assignment_entity,hierarchyKey:row.hierarchy_key,
  fields:normalizeFields(safeJson(row.fields_json,{})),state:STATES.includes(row.state)?row.state:'DRAFT',
  smoke:safeJson(row.smoke_json,null),validatedAt:row.validated_at||null,validatedBy:row.validated_by||null,
  updatedAt:row.updated_at||null,updatedBy:row.updated_by||null
 }
}
function auditMapping(actor,action,details={}){
 const storeId=actor?.store_id||db.prepare(`SELECT id FROM stores WHERE active=1 ORDER BY name LIMIT 1`).get()?.id;
 if(storeId)audit({storeId,userId:actor?.id||null,action,entityType:'D365_TAXONOMY_MAPPING',entityId:'default',details})
}
const value=v=>v!==null&&v!==undefined&&v!=='';
const esc=v=>String(v).replaceAll("'","''");

export function d365TaxonomyMappingSettings(){return rowToSettings(db.prepare(`SELECT * FROM d365_taxonomy_mapping_settings WHERE id='default'`).get())}
export function effectiveD365TaxonomyMapping(){const x=d365TaxonomyMappingSettings();return x?.state==='LIVE'?x:null}

export function saveD365TaxonomyMappingDraft({actor,input={}}){
 const n=validateInput(input);
 db.prepare(`INSERT INTO d365_taxonomy_mapping_settings(id,category_entity,assignment_entity,hierarchy_key,fields_json,state,smoke_json,validated_at,validated_by,updated_by,updated_at)
 VALUES('default',?,?,?,?,'DRAFT',NULL,NULL,NULL,?,CURRENT_TIMESTAMP)
 ON CONFLICT(id) DO UPDATE SET category_entity=excluded.category_entity,assignment_entity=excluded.assignment_entity,hierarchy_key=excluded.hierarchy_key,fields_json=excluded.fields_json,state='DRAFT',smoke_json=NULL,validated_at=NULL,validated_by=NULL,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
 .run(n.categoryEntity,n.assignmentEntity,n.hierarchyKey,JSON.stringify(n.fields),actor?.id||null);
 auditMapping(actor,'D365_TAXONOMY_MAPPING_DRAFT_SAVED',{categoryEntity:n.categoryEntity,assignmentEntity:n.assignmentEntity,hierarchyKey:n.hierarchyKey,fields:n.fields});
 return d365TaxonomyMappingSettings()
}

export function evaluateD365TaxonomySmokeRows({categoryRows=[],assignmentRows=[],mapping,productNumber=null,latencyMs=null}={}){
 const n=validateInput(mapping||{}),f=n.fields,sku=clean(productNumber),assignments=(Array.isArray(assignmentRows)?assignmentRows:[]).filter(r=>value(r?.[f.assignmentProduct])&&value(r?.[f.assignmentCategory]));
 const relevant=sku?assignments.filter(r=>clean(r?.[f.assignmentProduct])===sku):assignments;
 const assignedIds=[...new Set(relevant.map(r=>clean(r?.[f.assignmentCategory])).filter(Boolean))];
 const categories=(Array.isArray(categoryRows)?categoryRows:[]).filter(r=>value(r?.[f.categoryId])&&value(r?.[f.categoryName]));
 const categoriesById=new Map(categories.map(r=>[clean(r?.[f.categoryId]),r]));
 const resolvedIds=assignedIds.filter(id=>categoriesById.has(id)),unresolvedIds=assignedIds.filter(id=>!categoriesById.has(id));
 const passed=relevant.length>0&&assignedIds.length>0&&resolvedIds.length>0&&unresolvedIds.length===0;
 return{
  status:passed?'PASSED':'FAILED',checkedAt:new Date().toISOString(),productNumber:sku||null,
  categoryEntity:n.categoryEntity,assignmentEntity:n.assignmentEntity,hierarchyKey:n.hierarchyKey,
  assignmentRows:relevant.length,assignedCategoryIds:assignedIds,resolvedCategoryIds:resolvedIds,unresolvedCategoryIds:unresolvedIds,
  categoryRows:categories.length,latencyMs,
  hierarchyValues:[...new Set(relevant.map(r=>clean(r?.[f.assignmentHierarchy])).filter(Boolean))].slice(0,10),
  sampleCategories:resolvedIds.slice(0,8).map(id=>({categoryId:id,categoryName:clean(categoriesById.get(id)?.[f.categoryName]),parentCategoryId:f.parentCategoryId?clean(categoriesById.get(id)?.[f.parentCategoryId])||null:null,level:f.categoryLevel?Number(categoriesById.get(id)?.[f.categoryLevel])||null:null,path:f.categoryPath?clean(categoriesById.get(id)?.[f.categoryPath])||null:null})),
  note:passed?'Relation produit → catégorie et référentiel catégorie prouvés techniquement.':'La relation produit/catégorie n’est pas encore entièrement résolue.'
 }
}

export async function smokeD365TaxonomyMapping({actor,productNumber,input=null}={}){
 if(config.dynamics.mode!=='live')throw Object.assign(new Error('D365_MODE doit être LIVE pour valider la taxonomie.'),{status:409,code:'D365_TAXONOMY_SMOKE_REQUIRES_LIVE'});
 const sku=clean(productNumber);if(!sku)throw Object.assign(new Error('Un article témoin est requis.'),{status:400,code:'D365_TAXONOMY_SAMPLE_ITEM_REQUIRED'});
 const base=input?validateInput(input):d365TaxonomyMappingSettings();if(!base)throw Object.assign(new Error('Aucun mapping taxonomie à valider.'),{status:404,code:'D365_TAXONOMY_MAPPING_NOT_FOUND'});
 const mapping=input?base:{categoryEntity:base.categoryEntity,assignmentEntity:base.assignmentEntity,hierarchyKey:base.hierarchyKey,fields:base.fields},f=mapping.fields;
 let assignProbe=await probeDataEntity(mapping.assignmentEntity,{top:50,filter:`${f.assignmentProduct} eq '${esc(sku)}'`});
 if(!assignProbe?.ok||!(assignProbe.rows||[]).length)assignProbe=await probeDataEntity(mapping.assignmentEntity,{top:50});
 const assignmentRows=Array.isArray(assignProbe?.rows)?assignProbe.rows:[],ids=[...new Set(assignmentRows.filter(r=>clean(r?.[f.assignmentProduct])===sku).map(r=>clean(r?.[f.assignmentCategory])).filter(Boolean))];
 let categoryRows=[];
 for(const id of ids.slice(0,12)){
  const p=await probeDataEntity(mapping.categoryEntity,{top:10,filter:`${f.categoryId} eq '${esc(id)}'`});
  if(p?.ok&&Array.isArray(p.rows))categoryRows.push(...p.rows)
 }
 if(!categoryRows.length){const p=await probeDataEntity(mapping.categoryEntity,{top:100});if(p?.ok&&Array.isArray(p.rows))categoryRows=p.rows}
 const smoke=evaluateD365TaxonomySmokeRows({categoryRows,assignmentRows,mapping,productNumber:sku,latencyMs:{assignments:assignProbe?.latencyMs||null}});
 const passed=!!assignProbe?.ok&&smoke.status==='PASSED';
 if(input)saveD365TaxonomyMappingDraft({actor,input:mapping});
 db.prepare(`UPDATE d365_taxonomy_mapping_settings SET state=?,smoke_json=?,validated_at=?,validated_by=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`)
 .run(passed?'VALIDATED':'DRAFT',JSON.stringify(smoke),passed?smoke.checkedAt:null,passed?actor?.id||null:null,actor?.id||null);
 auditMapping(actor,passed?'D365_TAXONOMY_MAPPING_VALIDATED':'D365_TAXONOMY_MAPPING_VALIDATION_FAILED',{productNumber:sku,assignmentRows:smoke.assignmentRows,resolved:smoke.resolvedCategoryIds,unresolved:smoke.unresolvedCategoryIds});
 return{...d365TaxonomyMappingSettings(),smoke}
}

export function activateD365TaxonomyMapping({actor}={}){
 const current=d365TaxonomyMappingSettings();
 if(!current)throw Object.assign(new Error('Aucun mapping taxonomie enregistré.'),{status:404,code:'D365_TAXONOMY_MAPPING_NOT_FOUND'});
 if(current.state!=='VALIDATED'||current.smoke?.status!=='PASSED')throw Object.assign(new Error('Le mapping doit réussir un smoke avant activation.'),{status:409,code:'D365_TAXONOMY_MAPPING_NOT_VALIDATED'});
 db.prepare(`UPDATE d365_taxonomy_mapping_settings SET state='LIVE',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(actor?.id||null);
 auditMapping(actor,'D365_TAXONOMY_MAPPING_ACTIVATED',{categoryEntity:current.categoryEntity,assignmentEntity:current.assignmentEntity,hierarchyKey:current.hierarchyKey});
 return d365TaxonomyMappingSettings()
}
export function disableD365TaxonomyMapping({actor}={}){
 const current=d365TaxonomyMappingSettings();if(!current)throw Object.assign(new Error('Aucun mapping taxonomie enregistré.'),{status:404,code:'D365_TAXONOMY_MAPPING_NOT_FOUND'});
 db.prepare(`UPDATE d365_taxonomy_mapping_settings SET state='DISABLED',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='default'`).run(actor?.id||null);
 auditMapping(actor,'D365_TAXONOMY_MAPPING_DISABLED',{categoryEntity:current.categoryEntity,assignmentEntity:current.assignmentEntity});
 return d365TaxonomyMappingSettings()
}

import { config } from '../config.mjs';
import { odataGetAll } from './dynamics.mjs';
import { dynamicsMerchandisingConfig } from './dynamics-merchandising.mjs';
import { normalizeProductAssortmentCategoryRows,syncProductAssortmentCategoryRows,PRODUCT_ASSORTMENT_SOURCE } from './assortment-category-mapping.mjs';
import { allStoreOperationalSettings } from './store-settings.mjs';
import { applyAssortmentProfile } from './assortment-profiles.mjs';

const clean=v=>String(v??'').trim();
const validEntity=v=>/^[A-Za-z0-9_]+$/.test(clean(v));
const validField=v=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean(v));

export function productAssortmentReadiness(){
 const c=dynamicsMerchandisingConfig(),t=c.taxonomy,hierarchyField=clean(t.assignmentHierarchyField)||'ProductCategoryHierarchyName';
 return{source:PRODUCT_ASSORTMENT_SOURCE,globalMode:config.dynamics.mode,mode:c.taxonomyReadMode,entity:t.assignmentEntity||'ProductCategoryAssignments',hierarchyField,mapped:validEntity(t.assignmentEntity||'ProductCategoryAssignments')&&validField(hierarchyField),filterHint:`contains(${hierarchyField},'Assort')`}
}

export async function syncProductAssortmentsFromDynamics(){
 const c=dynamicsMerchandisingConfig(),t=c.taxonomy,entity=clean(t.assignmentEntity)||'ProductCategoryAssignments',hierarchyField=clean(t.assignmentHierarchyField)||'ProductCategoryHierarchyName';
 if(config.dynamics.mode!=='live'||c.taxonomyReadMode!=='live')throw Object.assign(new Error('Lecture ProductCategoryAssignments non activée en LIVE.'),{status:409,code:'D365_PRODUCT_ASSORTMENT_NOT_LIVE',details:{globalMode:config.dynamics.mode,mode:c.taxonomyReadMode}});
 if(!validEntity(entity)||!validField(hierarchyField))throw Object.assign(new Error('Mapping ProductCategoryAssignments invalide.'),{status:503,code:'D365_PRODUCT_ASSORTMENT_MAPPING_REQUIRED',details:{entity,hierarchyField}});
 const fetched=await odataGetAll(entity,{filter:`contains(${hierarchyField},'Assort')`,pageSize:t.pageSize,maxRows:t.maxRows,extra:config.dynamics.dataAreaId?'cross-company=true':''});
 if(fetched.truncated)throw Object.assign(new Error('Affectations assortiment tronquées : ancien référentiel conservé.'),{status:409,code:'D365_PRODUCT_ASSORTMENT_TRUNCATED',details:{rowsRead:fetched.rowCount,maxRows:t.maxRows}});
 const mapping={hierarchyField,productField:t.assignmentProductField,categoryField:t.assignmentCategoryField,categoryNameField:clean(process.env.D365_PRODUCT_CATEGORY_NAME_FIELD)};
 const normalized=normalizeProductAssortmentCategoryRows(fetched.value,mapping);
 if(!normalized.length)throw Object.assign(new Error('Aucune catégorie assortiment trouvée dans ProductCategoryAssignments.'),{status:409,code:'D365_PRODUCT_ASSORTMENT_EMPTY',details:{entity,hierarchyField,rowsRead:fetched.rowCount}});
 const result=syncProductAssortmentCategoryRows(fetched.value,{mapping,source:PRODUCT_ASSORTMENT_SOURCE,complete:true});
 const profileApplications=[];
 for(const store of allStoreOperationalSettings()){
  const profileCode=store.settings?.assortmentProfile;if(!profileCode)continue;
  try{
   const applied=applyAssortmentProfile({storeId:store.id,profileCode,source:PRODUCT_ASSORTMENT_SOURCE});
   profileApplications.push({storeId:store.id,storeName:store.name,profileCode,status:'APPLIED',rowCount:applied.rowCount,resolved:applied.resolved.map(x=>x.assortmentName)});
  }catch(error){
   profileApplications.push({storeId:store.id,storeName:store.name,profileCode,status:'NOT_APPLIED',code:error?.code||'ASSORTMENT_PROFILE_APPLY_FAILED',message:error?.message||String(error),details:error?.details||null});
  }
 }
 return{...result,entity,hierarchyField,rowsRead:fetched.rowCount,pages:fetched.pages,profileApplications,assortments:result.assortments.map(x=>({assortmentKey:x.assortmentKey,assortmentName:x.assortmentName,brandScope:x.brandScope,tier:x.tier,rowCount:x.rowCount,recognized:x.recognized}))}
}

// Server-side authorization contract. Caller must verify the principal and load grants
// from a trusted server repository on each request. Never accept these from browser JSON.
const id=v=>typeof v==='string'&&v.length>0&&v.length<=160&&v===v.trim()&&!/[\x00-\x1f]/.test(v);
const permissions=Object.freeze({
 analyst:['analytics.read','segments.preview'],
 marketer:['analytics.read','segments.preview','draft.prepare'],
 reviewer:['analytics.read','segments.preview','draft.review'],
 data_admin:['analytics.read','segments.preview','data.reconcile'],
 brand_admin:['analytics.read','segments.preview','draft.prepare','draft.review','data.reconcile','access.read']
});
const denied=()=>Object.assign(Error('Access denied'),{code:'CRM_FORBIDDEN'});
export function authorizeCrm({principal,grants,tenantId,requestedStoreIds,operation,registeredStoreIds}){
 if(principal?.verified!==true||!id(principal.issuer)||!id(principal.subject)||principal.active!==true||!id(tenantId)||!Array.isArray(grants)||grants.length>10000||!Array.isArray(registeredStoreIds)||!registeredStoreIds.length||new Set(registeredStoreIds).size!==registeredStoreIds.length||registeredStoreIds.some(s=>!id(s))||!Array.isArray(requestedStoreIds)||!requestedStoreIds.length||requestedStoreIds.length>50||new Set(requestedStoreIds).size!==requestedStoreIds.length||requestedStoreIds.some(s=>!registeredStoreIds.includes(s)))throw denied();
 if(typeof operation!=='string'||!Object.values(permissions).some(p=>p.includes(operation)))throw denied();
 const scoped=grants.filter(g=>g?.tenantId===tenantId&&g.issuer===principal.issuer&&g.subject===principal.subject);
 // Exactly one active role per membership, no union of privileges or implicit global admin.
 if(scoped.length!==1)throw denied();
 const g=scoped[0];
 if(g.active!==true||!Object.hasOwn(permissions,g.role)||!permissions[g.role].includes(operation)||!Array.isArray(g.storeIds)||!g.storeIds.length||new Set(g.storeIds).size!==g.storeIds.length||g.storeIds.some(s=>!registeredStoreIds.includes(s))||requestedStoreIds.some(s=>!g.storeIds.includes(s)))throw denied();
 return Object.freeze({tenantId,role:g.role,operation,storeIds:Object.freeze([...requestedStoreIds]),allowedStoreIds:Object.freeze([...g.storeIds]),activationEnabled:false});
}
// Internal interface: no HTTP registration. Aggregate response only, no activation.
// The underlying read adapter is trusted and must validate data provenance and scope.
export function makeCrmAudienceGateway({verifyPrincipal,loadMemberships,loadTenantStores,readAudience,minAudience=10}){
 if([verifyPrincipal,loadMemberships,loadTenantStores,readAudience].some(f=>typeof f!=='function')||!Number.isSafeInteger(minAudience)||minAudience<10)throw Error('Invalid gateway configuration');
 return async ({session,request})=>{
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['tenantId','storeIds','windowStart','asOf','rules'].includes(k)))throw denied();
  const {tenantId,storeIds,windowStart,asOf,rules}=request;
  if(!id(tenantId))throw denied();
  const principal=await verifyPrincipal(session);
  if(principal?.verified!==true||principal.active!==true||!id(principal.subject)||!id(principal.issuer))throw denied();
  const grants=await loadMemberships({issuer:principal.issuer,subject:principal.subject,tenantId});
  if(!Array.isArray(grants)||!grants.some(g=>g?.tenantId===tenantId&&g.issuer===principal.issuer&&g.subject===principal.subject&&g.active===true))throw denied();
  const registeredStoreIds=await loadTenantStores(tenantId);
  const auth=authorizeCrm({principal,grants,tenantId,requestedStoreIds:storeIds,operation:'segments.preview',registeredStoreIds});
  const x=await readAudience({tenantId,storeIds:[...auth.storeIds],allowedStoreIds:[...auth.allowedStoreIds],windowStart,asOf,rules});
  if(x?.status!=='READY'||x.currency!=='MAD'||x.activationEnabled!==false||x.windowStart!==windowStart||x.asOf!==asOf||!Array.isArray(x.storeIds)||JSON.stringify(x.storeIds)!==JSON.stringify(auth.storeIds)||!Number.isSafeInteger(x.audienceCount)||x.audienceCount<0||!Number.isSafeInteger(x.audienceNetMinor))throw Error('Invalid audience response');
  // Basic small-cohort suppression, not a defense against repeated differencing.
  if(x.audienceCount<minAudience)return {status:'SUPPRESSED',reason:'MINIMUM_COHORT',activationEnabled:false};
  return {status:'READY',currency:'MAD',storeIds:[...auth.storeIds],windowStart,asOf,audienceCount:x.audienceCount,audienceNetMinor:x.audienceNetMinor,activationEnabled:false};
 };
}

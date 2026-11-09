// Read-only audit: prints schema names, never customer values or credentials.
process.env.STOREOPS_DB ||= ':memory:';
const {config}=await import('../config.mjs');
const {listDataEntities,probeDataEntity}=await import('../services/dynamics.mjs');
const required=['D365_BASE_URL','D365_TENANT_ID','D365_CLIENT_ID','D365_CLIENT_SECRET'];
const missing=required.filter(k=>!process.env[k]);
if(config.dynamics.mode!=='live'||missing.length){
 console.log(JSON.stringify({status:'BLOCKED',reason:'D365_ACCESS_NOT_CONFIGURED',live:config.dynamics.mode==='live',missing,verifiedEntity:null,verifiedCreatedField:null},null,2));process.exitCode=2;
}else{
 try{
  const entities=await listDataEntities('customer');
  const names=[...new Set(entities.map(x=>x.PublicCollectionName||x.PublicEntityName||x.Name).filter(x=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(x)))];
  const results=[];
  for(const name of names){try{const r=await probeDataEntity(name,{top:1,extra:'cross-company=true'});results.push({entity:name,endpoint:`/data/${name}`,fields:Object.keys(r.rows?.[0]||{}),samplePresent:!!r.rows?.length})}catch(e){results.push({entity:name,error:e.code||e.status||'READ_FAILED'})}}
  console.log(JSON.stringify({status:'REQUIRES_SEMANTIC_RECONCILIATION',discoveryEndpoint:'/Metadata/DataEntities',results,notice:'Field presence alone does not prove CustTable creation semantics, network identity uniqueness, permissions completeness or creation store attribution.'},null,2));
 }catch(e){console.log(JSON.stringify({status:'BLOCKED',reason:e.code||'D365_DISCOVERY_FAILED'}));process.exitCode=2}
}

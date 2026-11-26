// Explicit, evidence-backed identity links; never match by name, phone or email.
// Internal opaque tokens only. Source trust and proof verification remain caller responsibilities.
const cleanId=v=>typeof v==='string'&&v.length>0&&v.length<=160&&v===v.trim()&&!/[\x00-\x1f]/.test(v);
const key=(system,account)=>JSON.stringify([system,account]);
export function resolveIdentityLinks({tenantId,records,links,allowedSystems}){
 if(!cleanId(tenantId)||!Array.isArray(records)||!Array.isArray(links)||!Array.isArray(allowedSystems)||allowedSystems.some(s=>!cleanId(s))||records.length>100000||links.length>100000)throw Error('Invalid identity input');
 const systems=new Set(allowedSystems),nodes=new Map(),edges=new Map(),issues=[];
 for(const r of records){
  if(r?.tenantId!==tenantId||!systems.has(r.system)||!cleanId(r.accountToken))throw Error('Identity outside authorized scope');
  const k=key(r.system,r.accountToken);if(!nodes.has(k))nodes.set(k,{system:r.system,accountToken:r.accountToken});
 }
 for(const l of links){
  if(l?.tenantId!==tenantId||!systems.has(l.system)||!cleanId(l.accountToken)||!cleanId(l.customerToken))throw Error('Link outside authorized scope');
  const k=key(l.system,l.accountToken);
  if(!nodes.has(k))throw Error('Unknown identity record');
  if(l.status!=='verified'||!cleanId(l.proofId)){issues.push({code:'LINK_UNVERIFIED',key:k});continue}
  const set=edges.get(k)||new Set();set.add(l.customerToken);edges.set(k,set);
 }
 const ambiguous=new Set();
 for(const [k,set] of edges)if(set.size>1){ambiguous.add(k);issues.push({code:'ACCOUNT_CONFLICT',key:k})}
 // Quarantine every canonical customer touched by conflicting evidence.
 const quarantined=new Set();for(const k of ambiguous)for(const c of edges.get(k))quarantined.add(c);
 const mappings=[],summary={records:nodes.size,resolved:0,unresolved:0,quarantined:0,canonicalCustomers:0};
 const canonical=new Set();
 for(const [k,r] of nodes){
  const set=edges.get(k),customerToken=set?.size===1?[...set][0]:null;
  const status=ambiguous.has(k)||(customerToken&&quarantined.has(customerToken))?'QUARANTINED':customerToken?'RESOLVED':'UNRESOLVED';
  if(status==='RESOLVED'){summary.resolved++;canonical.add(customerToken)}else if(status==='QUARANTINED')summary.quarantined++;else summary.unresolved++;
  mappings.push({...r,status,customerToken:status==='RESOLVED'?customerToken:null});
 }
 summary.canonicalCustomers=canonical.size;
 const issueCounts={};for(const i of issues)issueCounts[i.code]=(issueCounts[i.code]||0)+1;
 return {tenantId,summary:{...summary,issueCounts,activationEnabled:false},mappings};
}
export function identityLookup(result,tenantId,system,accountToken){
 if(!cleanId(tenantId)||result?.tenantId!==tenantId||!Array.isArray(result.mappings))throw Error('Identity lookup tenant mismatch');
 const matches=result.mappings.filter(r=>r.system===system&&r.accountToken===accountToken);
 return matches.length===1&&matches[0].status==='RESOLVED'?matches[0].customerToken:null;
}

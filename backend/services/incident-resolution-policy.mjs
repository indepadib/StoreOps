export function autoResolutionDecision({requiresEvidence=false,openActions=0,evidenceCount=0}={}){
  const actions=Math.max(0,Number(openActions)||0),evidence=Math.max(0,Number(evidenceCount)||0),requires=requiresEvidence===true||requiresEvidence===1||requiresEvidence==='1';
  if(actions>0)return{canResolve:false,reason:'ACTIONS_OPEN',openActions:actions,evidenceCount:evidence};
  if(requires&&evidence===0)return{canResolve:false,reason:'EVIDENCE_REQUIRED',openActions:0,evidenceCount:0};
  return{canResolve:true,reason:null,openActions:0,evidenceCount:evidence};
}

// The LLM proposes only a bounded intent. It never computes or supplies business facts.
const keys=(x,k)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===k.slice().sort().join(',');
const rule=(field,op,value)=>({kind:'rule',field,op,value});
export function validateCopilotPlan(raw,allowedStores){
 if(!Array.isArray(allowedStores)||!allowedStores.length||allowedStores.length>50||new Set(allowedStores).size!==allowedStores.length||allowedStores.some(s=>typeof s!=='string'||!s.trim()))throw Error('Invalid trusted scope');
 if(typeof raw!=='string'||raw.length>2000)throw Error('Invalid model output');
 let p;try{p=JSON.parse(raw)}catch{throw Error('Invalid model JSON')}
 if(!keys(p,['intent','store','days','channel'])||!['count','net','dormant','vip','draft','unsupported'].includes(p.intent)||!(p.store===null||allowedStores.includes(p.store)))throw Error('Invalid plan scope');
 const threshold=p.intent==='dormant'||p.intent==='draft';
 if(threshold?(!Number.isSafeInteger(p.days)||p.days<1||p.days>90):p.days!==null)throw Error('Invalid threshold');
 if(p.intent==='draft'?!['email','whatsapp','sms'].includes(p.channel):p.channel!==null)throw Error('Invalid channel');
 if(p.intent==='unsupported'){if(p.store!==null)throw Error('Invalid unsupported plan');return {intent:'unsupported',activationEnabled:false}}
 const children=threshold?[rule('recencyDays','gte',p.days),rule('purchaseTickets','gte',2)]:p.intent==='vip'?[rule('rfmTotal','gte',12)]:[];
 return {intent:p.intent,storeIds:p.store===null?[...allowedStores]:[p.store],rules:children.length?{expression:{kind:'group',match:'all',children:[{kind:'group',match:'all',children}]}}:{},channel:p.channel,requiresReview:true,activationEnabled:false};
}
export function renderCopilotEvidence(plan,evidence){
 if(plan?.intent==='unsupported')return {status:'UNSUPPORTED',activationEnabled:false};
 if(evidence?.status==='SUPPRESSED')return {status:'SUPPRESSED',activationEnabled:false};
 if(evidence?.status!=='READY'||evidence.activationEnabled!==false||evidence.currency!=='MAD'||!Number.isSafeInteger(evidence.audienceCount)||evidence.audienceCount<10||!Number.isSafeInteger(evidence.audienceNetMinor)||JSON.stringify(evidence.storeIds)!==JSON.stringify(plan.storeIds))throw Error('Invalid evidence');
 return {status:'READY',intent:plan.intent,storeIds:[...plan.storeIds],windowStart:evidence.windowStart,asOf:evidence.asOf,audienceCount:evidence.audienceCount,...(plan.intent==='net'?{netMinor:evidence.audienceNetMinor,currency:'MAD'}:{}),...(plan.intent==='draft'?{draftProposal:{channel:plan.channel,rules:plan.rules,requiresReview:true}}:{}),activationEnabled:false};
}
export function makeGenerativeCopilot({authorizeScope,proposePlan,readAudience,reserveQuery}){
 if([authorizeScope,proposePlan,readAudience,reserveQuery].some(f=>typeof f!=='function'))throw Error('Missing dependencies');
 return async ({session,request})=>{
  if(!keys(request,['question','tenantId','storeIds','windowStart','asOf'])||typeof request.question!=='string'||!request.question.trim()||request.question.length>300)throw Error('Invalid request');
  const {question,tenantId,storeIds,windowStart,asOf}=request;
  const scope=await authorizeScope({session,tenantId,storeIds});
  if(scope?.tenantId!==tenantId||!Array.isArray(scope.storeIds)||JSON.stringify(scope.storeIds)!==JSON.stringify(storeIds)||scope.syntheticOnly!==true||scope.providerApproved!==true)throw Error('Copilot not authorized');
  if(await reserveQuery({session,tenantId})!==true)throw Error('Query budget unavailable');
  const plan=validateCopilotPlan(await proposePlan({question,allowedStores:[...scope.storeIds]}),scope.storeIds);
  if(plan.intent==='unsupported')return renderCopilotEvidence(plan,null);
  const evidence=await readAudience({session,request:{tenantId,storeIds:plan.storeIds,windowStart,asOf,rules:plan.rules}});
  if(evidence?.status==='READY'&&(evidence.windowStart!==windowStart||evidence.asOf!==asOf))throw Error('Evidence period mismatch');
  return renderCopilotEvidence(plan,evidence);
 };
}

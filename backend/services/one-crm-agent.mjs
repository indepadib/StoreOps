// Read-only opportunity discovery. Deterministic rules, not a self-executing agent.
// No actual customers, messages or monetary commitments in this demo contract.
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v===v.trim();
const safe=Number.isSafeInteger;
const stores=['Val Fleuri','Trèfle'];
const rule=(field,op,value)=>({kind:'rule',field,op,value});
const group=children=>({kind:'group',match:'all',children:[{kind:'group',match:'all',children}]});
const recipes=[
 {id:'winback',title:'Réactivation',reason:'Dernier achat ≥ 60 jours et au moins deux achats observés',channel:'whatsapp',rules:[rule('recencyDays','gte',60),rule('purchaseTickets','gte',2)],matches:p=>p.recencyDays>=60&&p.purchaseTickets>=2},
 {id:'vip',title:'Reconnaissance VIP',reason:'Score RFM ≥ 12 et achat dans les 30 derniers jours',channel:'email',rules:[rule('rfmTotal','gte',12),rule('recencyDays','lte',30)],matches:p=>p.rfmTotal>=12&&p.recencyDays<=30},
 {id:'second',title:'Encourager le deuxième achat',reason:'Un seul achat observé et dernier achat dans les 14 jours',channel:'email',rules:[rule('purchaseTickets','eq',1),rule('recencyDays','lte',14)],matches:p=>p.purchaseTickets===1&&p.recencyDays<=14},
 {id:'watch',title:'Prévenir le décrochage',reason:'Dernier achat entre 31 et 59 jours et au moins deux achats',channel:'sms',rules:[rule('recencyDays','gte',31),rule('recencyDays','lte',59),rule('purchaseTickets','gte',2)],matches:p=>p.recencyDays>=31&&p.recencyDays<=59&&p.purchaseTickets>=2}
];
export function scanOpportunities({tenantId,profiles,store=null,allowedStores,coverageComplete,consentComplete,minEligible=5,contactCostsMinor,budgetMinor}){
 if(!id(tenantId)||!Array.isArray(profiles)||profiles.length>100000||!Array.isArray(allowedStores)||!allowedStores.length||new Set(allowedStores).size!==allowedStores.length||allowedStores.some(s=>!stores.includes(s))||!(store===null||allowedStores.includes(store))||!safe(minEligible)||minEligible<1||!safe(budgetMinor)||budgetMinor<0||['email','whatsapp','sms'].some(c=>!safe(contactCostsMinor?.[c])||contactCostsMinor[c]<0))throw Error('Invalid scan scope');
 const seen=new Set();
 for(const p of profiles){
  if(p?.tenantId!==tenantId||!id(p.customerToken)||seen.has(p.customerToken)||!Array.isArray(p.stores)||p.stores.length!==1||!allowedStores.includes(p.stores[0])||!safe(p.recencyDays)||p.recencyDays<0||p.recencyDays>36500||!safe(p.purchaseTickets)||p.purchaseTickets<0||!safe(p.netMinor)||!safe(p.rfmTotal)||p.rfmTotal<3||p.rfmTotal>15||!['active','quarantined','erased'].includes(p.status)||!Array.isArray(p.eligibleChannels)||p.eligibleChannels.some(c=>!['email','whatsapp','sms'].includes(c)))throw Error('Invalid profile evidence');
  seen.add(p.customerToken)
 }
 if(coverageComplete!==true||consentComplete!==true)return {status:'BLOCKED',opportunities:[],activationEnabled:false};
 const scoped=profiles.filter(p=>store===null||p.stores[0]===store),opportunities=[];
 for(const r of recipes){
  const audience=scoped.filter(r.matches),eligible=audience.filter(p=>p.status==='active'&&p.eligibleChannels.includes(r.channel));
  const net=eligible.reduce((n,p)=>{const s=n+p.netMinor;if(!safe(s))throw Error('Amount overflow');return s},0),cost=eligible.length*contactCostsMinor[r.channel];
  if(!safe(cost))throw Error('Cost overflow');
  const state=eligible.length<minEligible?'INSUFFICIENT_AUDIENCE':cost>budgetMinor?'OVER_BUDGET':'READY_FOR_REVIEW';
  opportunities.push({id:r.id,title:r.title,reason:r.reason,channel:r.channel,audience:audience.length,eligible:eligible.length,excluded:audience.length-eligible.length,historicalNetMinor:net,estimatedContactCostMinor:cost,state,expression:group([...r.rules.map(x=>({...x})),...(store?[rule('stores','contains',store)]:[])]),requiresApproval:true,activationEnabled:false});
 }
 opportunities.sort((a,b)=>Number(b.state==='READY_FOR_REVIEW')-Number(a.state==='READY_FOR_REVIEW')||b.eligible-a.eligible||a.id.localeCompare(b.id));
 return {status:'SCANNED',scanned:scoped.length,opportunities,method:'rule-based-opportunity-scan-v1',ranking:'eligible-count',activationEnabled:false};
}
export function reviewOpportunity({report,opportunityId,decision,expectedEligible}){
 if(report?.status!=='SCANNED'||report.activationEnabled!==false||!Array.isArray(report.opportunities)||!['prepare','dismiss'].includes(decision)||!safe(expectedEligible))throw Error('Invalid review');
 const o=report.opportunities.find(x=>x.id===opportunityId);
 if(!o||o.eligible!==expectedEligible)throw Error('Stale opportunity');
 if(decision==='prepare'&&o.state!=='READY_FOR_REVIEW')throw Error('Opportunity not eligible for preparation');
 return {opportunityId,decision,state:decision==='prepare'?'DRAFT_AUTHORIZED':'DISMISSED',requiresFinalApproval:true,activationEnabled:false};
}

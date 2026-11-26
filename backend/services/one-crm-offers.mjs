// Offer decision support using explicit hypothetical response rates, never inferred uplift.
// Monetary amounts are integer MAD minor units. Compare incremental contribution
// to no contact; budget is worst-case face value of offers plus contact costs.
const safe=Number.isSafeInteger,id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v;
const rate=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10000;
const round=v=>{const n=Math.round(v);if(!safe(n))throw Error('Money overflow');return n};
export function rankOfferScenarios({tenantId,profile,offers,baselineConversionBps,budgetMinor,consentComplete,evidenceComplete,minIncrementalMinor=0}){
 if(!id(tenantId)||profile?.tenantId!==tenantId||!id(profile.customerToken)||!['active','quarantined','erased'].includes(profile.status)||!Array.isArray(profile.eligibleChannels)||profile.eligibleChannels.some(c=>!['email','whatsapp','sms','push'].includes(c))||!Array.isArray(profile.preferredCategories)||profile.preferredCategories.some(c=>!id(c))||!safe(profile.purchaseTickets)||profile.purchaseTickets<0||!Array.isArray(offers)||offers.length>50||!rate(baselineConversionBps)||!safe(budgetMinor)||budgetMinor<0||!safe(minIncrementalMinor)||minIncrementalMinor<0)throw Error('Invalid scenario scope');
 const seen=new Set(),candidates=[];
 for(const o of offers){
  if(o?.tenantId!==tenantId||!id(o.id)||seen.has(o.id)||!id(o.label)||!['email','whatsapp','sms','push'].includes(o.channel)||!(o.category===null||id(o.category))||!safe(o.basketMinor)||o.basketMinor<=0||!rate(o.marginBps)||!rate(o.conversionBps)||!safe(o.rewardMinor)||o.rewardMinor<0||o.rewardMinor>o.basketMinor||!safe(o.contactCostMinor)||o.contactCostMinor<0||typeof o.available!=='boolean')throw Error('Invalid offer');
  seen.add(o.id);
 }
 if(consentComplete!==true||evidenceComplete!==true||profile.status!=='active'||profile.purchaseTickets<2)return {status:'BLOCKED',recommendation:null,candidates:[],activationEnabled:false,reason:'Incomplete evidence, inactive identity or insufficient history'};
 for(const o of offers){
  const p=o.conversionBps/10000,p0=baselineConversionBps/10000,margin=o.basketMinor*o.marginBps/10000;
  const incremental=round((p-p0)*margin-p*o.rewardMinor-o.contactCostMinor);
  const worstCase=round(o.rewardMinor+o.contactCostMinor);
  const expectedCost=round(p*o.rewardMinor+o.contactCostMinor);
  let reason=null;
  if(!o.available)reason='UNAVAILABLE';
  else if(!profile.eligibleChannels.includes(o.channel))reason='NO_CONSENT';
  else if(o.category!==null&&!profile.preferredCategories.includes(o.category))reason='NO_AFFINITY';
  else if(o.rewardMinor>margin)reason='MARGIN_GUARD';
  else if(worstCase>budgetMinor)reason='BUDGET';
  else if(incremental<=minIncrementalMinor)reason='NO_POSITIVE_INCREMENT';
  candidates.push({id:o.id,label:o.label,channel:o.channel,category:o.category,conversionBps:o.conversionBps,incrementalContributionMinor:incremental,expectedCostMinor:expectedCost,maxCostMinor:worstCase,eligible:reason===null,reason});
 }
 candidates.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||b.incrementalContributionMinor-a.incrementalContributionMinor||a.maxCostMinor-b.maxCostMinor||a.id.localeCompare(b.id));
 const best=candidates.find(c=>c.eligible)||null;
 return {status:'SCENARIO',recommendation:best?{...best,requiresApproval:true}:null,candidates,baselineConversionBps,budgetMinor,method:'hypothetical-incremental-contribution-v1',activationEnabled:false};
}

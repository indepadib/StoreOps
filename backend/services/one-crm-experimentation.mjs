// Experiment Lab: synthetic allocation and intention-to-treat aggregate evaluation.
// A production trial requires independently randomized immutable assignment, complete outcome
// capture, pre-registered horizon, overlap controls and a verified cost/margin basis.
const safe=Number.isSafeInteger;
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&v===v.trim();
const money=n=>{const x=Math.round(n);if(!safe(x))throw Error('Financial overflow');return x};
export function allocateDemo({audience,holdoutPct,seed}){
 if(!Array.isArray(audience)||audience.length>100000||!safe(holdoutPct)||holdoutPct<1||holdoutPct>50||!id(seed))throw Error('Invalid allocation');
 const seen=new Set(),eligible=[];
 for(const p of audience){if(!id(p?.id)||seen.has(p.id)||typeof p.eligible!=='boolean')throw Error('Invalid audience');seen.add(p.id);if(p.eligible)eligible.push(p.id)}
 // Stable synthetic shuffle only, never use for production randomization.
 eligible.sort();let state=2166136261;for(const c of seed)state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;
 const random=()=>{state=(state+0x6D2B79F5)>>>0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296};
 for(let i=eligible.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[eligible[i],eligible[j]]=[eligible[j],eligible[i]]}
 const holdout=eligible.length<2?eligible.length:Math.min(eligible.length-1,Math.max(1,Math.round(eligible.length*holdoutPct/100)));
 return {mode:'SYNTHETIC_ONLY',eligible:eligible.length,excluded:audience.length-eligible.length,control:eligible.slice(0,holdout),treatment:eligible.slice(holdout),activationEnabled:false};
}
function wilson(k,n){const z=1.95996398454,p=k/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [Math.max(0,c-h),Math.min(1,c+h)]}
export function evaluateExperiment({treatment,control,outcomesComplete,assignmentVerified,windowClosed}){
 for(const g of [treatment,control])if(!g||!safe(g.assigned)||g.assigned<0||!safe(g.converted)||g.converted<0||g.converted>g.assigned||!safe(g.netRevenueMinor)||!safe(g.contributionBeforeCampaignMinor)||!safe(g.campaignCostMinor)||g.campaignCostMinor<0||(g.assigned===0&&(g.netRevenueMinor!==0||g.contributionBeforeCampaignMinor!==0||g.campaignCostMinor!==0)))throw Error('Invalid trial aggregate');
 if(outcomesComplete!==true||assignmentVerified!==true||windowClosed!==true)return {status:'BLOCKED',reason:'Incomplete assignment, window or outcomes',activationEnabled:false};
 const nt=treatment.assigned,nc=control.assigned;
 if(!nt||!nc)return {status:'INSUFFICIENT_SAMPLE',activationEnabled:false};
 const pt=treatment.converted/nt,pc=control.converted/nc,delta=pt-pc;
 const [tl,tu]=wilson(treatment.converted,nt),[cl,cu]=wilson(control.converted,nc);
 // Newcombe hybrid score interval for difference of independent proportions.
 const lower=Math.max(-1,delta-Math.hypot(pt-tl,cu-pc)),upper=Math.min(1,delta+Math.hypot(tu-pt,pc-cl));
 const revenue=money(treatment.netRevenueMinor-control.netRevenueMinor/nc*nt);
 const incrementalCost=money(treatment.campaignCostMinor-control.campaignCostMinor/nc*nt);
 const contribution=money(treatment.contributionBeforeCampaignMinor-control.contributionBeforeCampaignMinor/nc*nt-incrementalCost);
 const sufficient=nt>=30&&nc>=30;
 return {status:sufficient?'OBSERVED':'SMALL_SAMPLE',treatmentRate:pt,controlRate:pc,absoluteLift:delta,relativeLift:pc>0?delta/pc:null,interval95:[lower,upper],incrementalConversions:delta*nt,incrementalRevenueMinor:revenue,incrementalCampaignCostMinor:incrementalCost,incrementalContributionMinor:contribution,roi:incrementalCost>0?contribution/incrementalCost:null,interpretation:!sufficient?'INSUFFICIENT_SAMPLE':lower>0?'POSITIVE_CONVERSION_SIGNAL':upper<0?'NEGATIVE_CONVERSION_SIGNAL':'INCONCLUSIVE',activationEnabled:false,method:'intent-to-treat-scaled-control-v1'};
}

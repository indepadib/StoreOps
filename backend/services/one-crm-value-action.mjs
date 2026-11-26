// Scenario-based customer economics. No learned retention model or causal claim.
// All money is MAD minor units. Assumptions are explicit and never enable sending.
const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const safe=Number.isSafeInteger;
const money=n=>{const v=Math.round(n);if(!safe(v))throw Error('Financial overflow');return v};
export function customerValueScenario({profile,windowDays,horizonMonths,monthlyRetentionPct,marginPct,monthlyContactCostMinor=0,annualDiscountPct=0}){
 if(!profile||!safe(profile.netMinor)||!safe(profile.purchaseTickets)||profile.purchaseTickets<0||!safe(windowDays)||windowDays<30||windowDays>366||!safe(horizonMonths)||horizonMonths<1||horizonMonths>36||!finite(monthlyRetentionPct,0,100)||!finite(marginPct,0,100)||!finite(annualDiscountPct,0,100)||!safe(monthlyContactCostMinor)||monthlyContactCostMinor<0)throw Error('Invalid value scenario');
 const observedNetMinor=profile.netMinor;
 if(profile.purchaseTickets<2||observedNetMinor<=0)return {status:'INSUFFICIENT_HISTORY',observedNetMinor,projectedRevenueMinor:null,projectedContributionMinor:null,activationEnabled:false};
 const monthlyNet=observedNetMinor/windowDays*(365.25/12),retention=monthlyRetentionPct/100,discount=Math.pow(1+annualDiscountPct/100,1/12);
 let revenue=0,contribution=0;
 for(let m=1;m<=horizonMonths;m++){const survival=retention**m;revenue+=monthlyNet*survival;contribution+=(monthlyNet*marginPct/100-monthlyContactCostMinor)*survival/discount**m}
 return {status:'SCENARIO',observedNetMinor,monthlyRunRateMinor:money(monthlyNet),projectedRevenueMinor:money(revenue),projectedContributionMinor:money(contribution),horizonMonths,monthlyRetentionPct,marginPct,monthlyContactCostMinor,annualDiscountPct,method:'constant-run-rate-retention-scenario-v1',activationEnabled:false};
}
export function nextBestAction({profile,rfm,promotion,preferredCategories=[],eligibleChannels=[],ledgerComplete,identityStatus='unknown'}){
 if(!profile||!safe(profile.purchaseTickets)||profile.purchaseTickets<0||!safe(profile.netMinor)||!rfm||!['unknown','low','watch','high'].includes(rfm.risk)||!['unknown','low','medium','high'].includes(promotion?.promotionBand)||!Array.isArray(preferredCategories)||preferredCategories.some(x=>typeof x!=='string'||!x.trim())||!Array.isArray(eligibleChannels)||eligibleChannels.some(x=>!['email','whatsapp','sms','push'].includes(x)))throw Error('Invalid action evidence');
 const channels=[...new Set(eligibleChannels)];
 if(identityStatus!=='active'||ledgerComplete!==true||!channels.length)return {action:'NO_CONTACT',reason:'Identité ou autorisations non vérifiées',channels:[],requiresApproval:true,activationEnabled:false};
 let action,reason;
 if(profile.purchaseTickets<2){action='ONBOARD';reason='Historique limité : privilégier la découverte plutôt que la remise.'}
 else if(rfm.risk==='high'){action='WIN_BACK_TEST';reason='Inactivité observée : tester une réactivation avec groupe témoin.'}
 else if(rfm.risk==='watch'){action='REMINDER';reason='Récence dégradée : tester un rappel pertinent sans remise automatique.'}
 else if(profile.netMinor>=300000){action='RECOGNITION';reason='Valeur observée élevée : reconnaître la fidélité sans remise systématique.'}
 else if(promotion.promotionBand==='high'){action='PROMO_EXPERIMENT';reason='Exposition promotionnelle élevée : mesurer l’incrémentalité avant de généraliser.'}
 else if(preferredCategories.length){action='CATEGORY_DISCOVERY';reason='Affinité observée : proposer une découverte dans une catégorie pertinente.'}
 else{action='RELATIONSHIP';reason='Entretenir la relation sans pression commerciale excessive.'}
 return {action,reason,channels,category:preferredCategories[0]??null,requiresApproval:true,activationEnabled:false,method:'explainable-rules-v1'};
}

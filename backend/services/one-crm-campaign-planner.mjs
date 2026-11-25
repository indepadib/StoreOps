// Synthetic planning only: no random assignment, no dispatch, no provider.
export function planCampaign({audience,channel,holdoutPct=10,costMinor=0,offerMinor=0,conversionPct,controlPct,basketMinor,marginPct}){
 const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 if(!Array.isArray(audience)||audience.some(x=>typeof x?.id!=='string'||!x.id||typeof x.eligible!=='boolean')||new Set(audience.map(x=>x.id)).size!==audience.length)throw Error('Invalid audience');
 if(!['email','whatsapp','sms','push'].includes(channel)||!integer(holdoutPct,1,50)||![costMinor,offerMinor,basketMinor].every(v=>integer(v,0,100000000))||![conversionPct,controlPct,marginPct].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100))throw Error('Invalid campaign assumptions');
 const eligible=audience.filter(x=>x.eligible).length;
 const holdout=eligible>=2?Math.min(eligible-1,Math.max(1,Math.round(eligible*holdoutPct/100))):eligible;
 const targeted=eligible-holdout;
 const expectedConversions=targeted*conversionPct/100;
 const incrementalConversions=targeted*(conversionPct-controlPct)/100;
 const incrementalRevenueMinor=Math.round(incrementalConversions*basketMinor);
 const cost=Math.round(targeted*costMinor+expectedConversions*offerMinor);
 const net=Math.round(incrementalRevenueMinor*marginPct/100-cost);
 if(![incrementalRevenueMinor,cost,net].every(Number.isSafeInteger))throw Error('Financial overflow');
 return {channel,audience:audience.length,eligible,excluded:audience.length-eligible,holdout,targeted,expectedConversions,incrementalRevenueMinor,costMinor:cost,incrementalMarginMinor:net,roiPct:cost?Math.round(net/cost*10000)/100:null,canActivate:false,mode:'SIMULATION_ONLY'};
}

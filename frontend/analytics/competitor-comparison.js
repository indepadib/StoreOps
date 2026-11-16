export function compareObservedPrice(ours, observation){
 if(!ours)return {reason:'Vérifier d’abord le prix StoreOps'};
 if(observation.matchType!=='IDENTICAL_GTIN')return {reason:'Équivalence à valider'};
 if(ours.currency!==observation.currency)return {reason:'Devises différentes'};
 const oursDate=Date.parse(ours.businessDate),observedDate=Date.parse(observation.observedAt?.slice(0,10));
 if(!Number.isFinite(oursDate)||!Number.isFinite(observedDate)||Math.abs(oursDate-observedDate)>7*86400000)return {reason:'Dates distantes de plus de 7 jours ou inconnues'};
 const unit=String(ours.priceUnit||'').toUpperCase(),other=String(observation.unit||'').toUpperCase();
 const factor=unit&&unit===other?1:({'KG:G':1000,'G:KG':.001,'L:ML':1000,'ML:L':.001})[unit+':'+other];
 if(!factor)return {reason:'Unités incompatibles'};
 const ourQuantity=ours.priceQuantity??1,theirQuantity=observation.priceQuantity;
 if(ours.indicativeEffectivePrice==null||![ours.indicativeEffectivePrice,observation.price,ourQuantity,theirQuantity].every(Number.isFinite)||ours.indicativeEffectivePrice<0||observation.price<=0||ourQuantity<=0||theirQuantity<=0)return {reason:'Prix ou base tarifaire insuffisants'};
 const own=ours.indicativeEffectivePrice/ourQuantity, competitor=observation.price/theirQuantity*factor;
 const difference=own-competitor;
 return {own,competitor,difference,percent:difference/competitor*100,unit};
}
